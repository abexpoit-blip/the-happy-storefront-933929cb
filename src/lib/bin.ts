import { detectOfflineBin } from "./binDetection";

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

const memo = new Map<string, BinInfo>();

/** Accurate BIN lookup via server endpoint + instant offline intelligence fallback. */
export const lookupBin = async (raw: string): Promise<BinInfo | null> => {
  const bin = raw.replace(/\D/g, "").slice(0, 8);
  if (bin.length < 6) return null;
  const cached = memo.get(bin);
  if (cached) return cached;

  const offline = detectOfflineBin(bin);
  const result: BinInfo = {
    bin,
    brand: offline.brand,
    type: offline.type,
    level: offline.level,
    bank: offline.bank,
    country: offline.country,
    countryName: offline.countryName,
    currency: null,
    source: "offline_intelligence",
  };

  // Always attempt live enrichment from server API if online (max 2.5s) to guarantee maximum accuracy
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/public/bin/${bin}`, { signal: AbortSignal.timeout(2500) });
      if (res.ok) {
        const j = await res.json();
        if (j.bank && !j.bank.toUpperCase().includes("UNKNOWN") && !j.bank.toUpperCase().includes("ISSUING BANK")) {
          result.bank = j.bank;
          if (j.brand && j.brand !== "OTHER") result.brand = j.brand;
          if (j.level) result.level = j.level;
          if (j.type) result.type = j.type;
          if (j.country) result.country = j.country;
          if (j.countryName) result.countryName = j.countryName;
          result.source = j.source || "server_api";
        }
      }
    } catch {
      /* fallback to offline intelligence */
    }
  }

  memo.set(bin, result);
  return result;
};

/**
 * High-performance batch BIN enrichment for card arrays.
 * Gathers unique 6-digit BINs, enriches them in parallel, and returns cards with accurate bank/type/level.
 */
export async function enrichCardsWithBinInfo<
  T extends {
    cc?: string;
    bin?: string;
    brand?: string;
    card_type?: string;
    card_level?: string;
    bank?: string | null;
    country?: string | null;
  }
>(cards: T[], onProgress?: (done: number, total: number) => void): Promise<T[]> {
  if (!cards.length) return cards;

  // Extract unique 6-digit BINs
  const binSet = new Set<string>();
  for (const c of cards) {
    const raw = (c.bin || c.cc || "").replace(/\D/g, "").slice(0, 6);
    if (raw.length >= 6) binSet.add(raw);
  }

  const uniqueBins = Array.from(binSet);
  const binMap = new Map<string, BinInfo>();

  // Fetch in concurrency-controlled batches of 5
  const CONCURRENCY = 5;
  let completed = 0;
  for (let i = 0; i < uniqueBins.length; i += CONCURRENCY) {
    const chunk = uniqueBins.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (b) => {
        const info = await lookupBin(b);
        if (info) binMap.set(b, info);
        completed++;
        onProgress?.(completed, uniqueBins.length);
      })
    );
  }

  // Map enriched bank details back onto every card
  return cards.map((c) => {
    const b = (c.bin || c.cc || "").replace(/\D/g, "").slice(0, 6);
    const enriched = binMap.get(b) || (b ? detectOfflineBin(b) : null);
    if (!enriched) return c;

    const currentBank = (c.bank || "").trim();
    const isBadBank =
      !currentBank ||
      /unknown/i.test(currentBank) ||
      /issuing bank/i.test(currentBank) ||
      currentBank === "—";

    return {
      ...c,
      brand: (!c.brand || c.brand === "OTHER" || c.brand === "CARD") ? enriched.brand || c.brand : c.brand,
      bank: isBadBank ? enriched.bank : currentBank,
      card_type: c.card_type || enriched.type || "CREDIT",
      card_level: c.card_level || enriched.level || "STANDARD",
      country: c.country || enriched.country || "US",
    };
  });
}

