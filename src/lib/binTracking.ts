import { detectOfflineBin } from "./binDetection";

let lastTrackedBin = "";
let lastTrackedAt = 0;

/**
 * Tracks a customer BIN search non-blockingly using sendBeacon / keepalive fetch.
 * Debounces repeating searches for the same BIN within 10 seconds.
 */
export function trackBinSearch(rawBin: string) {
  if (typeof window === "undefined") return;
  const clean = (rawBin || "").replace(/\D/g, "").slice(0, 8);
  if (clean.length < 6) return;

  // Debounce: don't track the exact same BIN within 10 seconds from the same client
  if (clean === lastTrackedBin && Date.now() - lastTrackedAt < 10_000) return;
  lastTrackedBin = clean;
  lastTrackedAt = Date.now();

  try {
    const offline = detectOfflineBin(clean);
    const payload = {
      bin: clean,
      brand: offline.brand,
      country: offline.country,
      card_type: offline.type,
      card_level: offline.level,
      bank: offline.bank,
    };

    const body = JSON.stringify(payload);

    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/public/bin-track", blob);
    } else {
      void fetch("/api/public/bin-track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Silent fail so customer browsing is 100% uninterrupted
  }
}
