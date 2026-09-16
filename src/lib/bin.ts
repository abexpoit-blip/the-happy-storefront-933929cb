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
  try {
    const res = await fetch(`/api/public/bin/${bin}`);
    if (res.ok) {
      const data = (await res.json()) as BinInfo;
      memo.set(bin, data);
      return data;
    }
  } catch {
    // ignore
  }

  const fallback: BinInfo = {
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
  memo.set(bin, fallback);
  return fallback;
};
