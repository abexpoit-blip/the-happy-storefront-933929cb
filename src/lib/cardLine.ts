/** Shared card-line parsing/masking used by the checker (UI + API). */
export const digits = (s: string) => s.replace(/\D/g, "");

/** Parse a pasted line into `PAN|MM|YYYY|CVV`. */
export function parseCardLine(raw: string): string | null {
  const p = raw.trim().split(/[|:/\s,]+/).filter(Boolean);
  if (p.length < 4) return null;
  const pan = digits(p[0] ?? "");
  let mm = digits(p[1] ?? "");
  let yy = digits(p[2] ?? "");
  const cvv = digits(p[3] ?? "");
  if (pan.length < 12 || !mm || !yy || !cvv) return null;
  if (mm.length === 1) mm = `0${mm}`;
  if (yy.length === 2) yy = `20${yy}`;
  return `${pan}|${mm}|${yy}|${cvv}`;
}

export const maskPan = (pan: string) =>
  pan.length > 10 ? `${pan.slice(0, 6)}${"*".repeat(pan.length - 10)}${pan.slice(-4)}` : pan;
