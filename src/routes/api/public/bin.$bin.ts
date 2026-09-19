import { createFileRoute } from "@tanstack/react-router";
import { detectOfflineBin } from "@/lib/binDetection";

export interface BinInfo {
  bin: string;
  brand: string | null;
  type: string | null;
  level: string | null;
  bank: string | null;
  country: string | null;
  countryName: string | null;
  currency: string | null;
  source: string;
}

const cache = new Map<string, { at: number; data: BinInfo }>();
const TTL = 1000 * 60 * 60 * 24; // 24h

const up = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().toUpperCase() : null);
const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** https://data.handyapi.com — free, no key, good coverage */
async function fromHandy(bin: string): Promise<BinInfo | null> {
  const r = await fetch(`https://data.handyapi.com/bin/${bin}`, {
    headers: { "User-Agent": "zoru-shop/1.0", Accept: "application/json" },
  });
  if (!r.ok) return null;
  const j = (await r.json()) as Record<string, any>;
  if (!j || j.Status !== "SUCCESS") return null;
  return {
    bin,
    brand: up(j.Scheme),
    type: up(j.Type),
    level: up(j.CardTier),
    bank: txt(j.Issuer),
    country: up(j.Country?.A2),
    countryName: txt(j.Country?.Name),
    currency: null,
    source: "handyapi",
  };
}

/** https://lookup.binlist.net — fallback (rate limited) */
async function fromBinlist(bin: string): Promise<BinInfo | null> {
  const r = await fetch(`https://lookup.binlist.net/${bin}`, {
    headers: { "Accept-Version": "3", Accept: "application/json", "User-Agent": "zoru-shop/1.0" },
  });
  if (!r.ok) return null;
  const j = (await r.json()) as Record<string, any>;
  return {
    bin,
    brand: up(j.scheme),
    type: up(j.type),
    level: up(j.brand),
    bank: txt(j.bank?.name),
    country: up(j.country?.alpha2),
    countryName: txt(j.country?.name),
    currency: up(j.country?.currency),
    source: "binlist",
  };
}

/** Offline fallback so the endpoint always answers something useful. */
function fromPrefix(bin: string): BinInfo {
  const n = bin;
  let brand: string | null = null;
  if (/^4/.test(n)) brand = "VISA";
  else if (/^(5[1-5]|2[2-7])/.test(n)) brand = "MASTERCARD";
  else if (/^3[47]/.test(n)) brand = "AMEX";
  else if (/^(6011|65|64[4-9]|622)/.test(n)) brand = "DISCOVER";
  else if (/^35/.test(n)) brand = "JCB";
  else if (/^3(0[0-5]|6|8)/.test(n)) brand = "DINERS";
  else if (/^62/.test(n)) brand = "UNIONPAY";
  return { bin, brand, type: null, level: null, bank: null, country: null, countryName: null, currency: null, source: "prefix" };
}

export const Route = createFileRoute("/api/public/bin/$bin")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const bin = String(params.bin ?? "").replace(/\D/g, "").slice(0, 8);
        if (bin.length < 6) {
          return Response.json({ error: "BIN must be at least 6 digits" }, { status: 400 });
        }

        const hit = cache.get(bin);
        if (hit && Date.now() - hit.at < TTL) {
          return Response.json({ ...hit.data, cached: true });
        }

        let data: BinInfo | null = null;
        for (const fn of [fromHandy, fromBinlist]) {
          try {
            data = await fn(bin);
          } catch {
            data = null;
          }
          if (data?.brand || data?.bank) break;
        }

        const offline = detectOfflineBin(bin);
        const resolvedBank =
          data?.bank && !/issuing bank/i.test(data.bank) && !/unknown/i.test(data.bank)
            ? data.bank
            : offline.bank;

        const merged: BinInfo = {
          bin,
          brand: data?.brand || offline.brand,
          type: data?.type || offline.type,
          level: data?.level || offline.level,
          bank: resolvedBank,
          country: data?.country || offline.country,
          countryName: data?.countryName || offline.countryName,
          currency: data?.currency || null,
          source: data?.source || "intelligence_engine",
        };

        cache.set(bin, { at: Date.now(), data: merged });
        return Response.json(merged, {
          headers: { "Cache-Control": "public, max-age=86400" },
        });
      },
    },
  },
});
