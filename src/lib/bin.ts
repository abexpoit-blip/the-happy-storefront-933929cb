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

  // If bank is generic or unconfirmed, attempt live enrichment from server API (max 2.5s)
  const isGenericBank =
    !offline.bank ||
    offline.bank.includes("ISSUING BANK") ||
    offline.bank.toUpperCase().includes("UNKNOWN");

  if (isGenericBank && typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/public/bin/${bin}`, { signal: AbortSignal.timeout(2500) });
      if (res.ok) {
        const j = await res.json();
        if (j.bank && !j.bank.toUpperCase().includes("UNKNOWN")) {
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
