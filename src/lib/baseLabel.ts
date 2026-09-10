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

/**
 * Sortable date key extracted from a base name (e.g. `ADMIN_2026_07_25_VISA`).
 * Returns 0 when the base carries no date, so dated bases always sort first.
 */
export const baseDateKey = (base?: string | null): number => {
  if (!base) return 0;
  const s = String(base);
  const m =
    s.match(/(20\d{2})[^0-9]?(\d{2})[^0-9]?(\d{2})/) ||
    s.match(/(\d{2})[^0-9]?(\d{2})[^0-9]?(20\d{2})/);
  if (!m) return 0;
  const [a, b, c] = [m[1], m[2], m[3]];
  const y = a.length === 4 ? Number(a) : Number(c);
  const mo = a.length === 4 ? Number(b) : Number(b);
  const d = a.length === 4 ? Number(c) : Number(a);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return 0;
  return y * 10000 + mo * 100 + d;
};

/** Bases ordered newest-dated first, then alphabetically. */
export const sortBasesLatestFirst = (bases: string[]): string[] =>
  [...bases].sort((x, y) => {
    const d = baseDateKey(y) - baseDateKey(x);
    return d !== 0 ? d : publicBase(x).localeCompare(publicBase(y));
  });
