/**
 * Public label for a card "base".
 * Uploaded bases carry an internal uploader prefix (e.g. `ADMIN_2026_07_25_VISA`).
 * Buyers must never see who uploaded the card, so the prefix is stripped everywhere
 * the base is shown or exported.
 */
const UPLOADER_PREFIX = /^\s*(admin|administrator|seller|staff|owner|root|support)[\s_\-.:]+/i;

export const publicBase = (base?: string | null): string => {
  if (!base) return "";
  let out = String(base);
  // strip repeated prefixes like "ADMIN_SELLER_..."
  for (let i = 0; i < 3 && UPLOADER_PREFIX.test(out); i++) out = out.replace(UPLOADER_PREFIX, "");
  return out.trim() || String(base).trim();
};
