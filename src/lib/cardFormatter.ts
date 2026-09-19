// Auto-formats messy card lines into the canonical pipe format:
// cc|month/year|cvv|name|addr|city|state|zip|country|tel|email
// Missing fields are emitted as the literal "null".

export type ParsedCard = {
  cc: string; month: string; year: string; cvv: string;
  name: string; addr: string; city: string; state: string;
  zip: string; country: string; tel: string; email: string;
};

const NULLISH = new Set(["", "null", "n/a", "na", "none", "-", "undefined", "unknown", "?"]);
const norm = (s: string) => (NULLISH.has(s.trim().toLowerCase()) ? "null" : s.trim());

const digitsOnly = (s: string) => s.replace(/\D/g, "");
const isCC = (s: string) => /^\d{12,19}$/.test(s.replace(/[\s-]/g, ""));
const isCVV = (s: string) => /^\d{3,4}$/.test(s.trim());
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const isPhone = (s: string) => /^[+(]?[\d][\d\s\-().]{7,}$/.test(s.trim()) && digitsOnly(s).length >= 7;
const isZip = (s: string) => /^\d{4,6}(-\d{4})?$/.test(s.trim()) || /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i.test(s.trim()) || /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i.test(s.trim());
const isAlpha2 = (s: string) => /^[A-Za-z]{2}$/.test(s.trim());

const US_STATES = new Set(("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR").split(" "));

const COUNTRY_MAP: Record<string, string> = {
  "united states": "US", "united states of america": "US", usa: "US", us: "US", america: "US",
  "united kingdom": "GB", uk: "GB", england: "GB", britain: "GB", "great britain": "GB",
  canada: "CA", australia: "AU", germany: "DE", deutschland: "DE", france: "FR", spain: "ES",
  italy: "IT", netherlands: "NL", holland: "NL", belgium: "BE", sweden: "SE", norway: "NO",
  denmark: "DK", finland: "FI", ireland: "IE", poland: "PL", portugal: "PT", austria: "AT",
  switzerland: "CH", mexico: "MX", brazil: "BR", japan: "JP", china: "CN", india: "IN",
  russia: "RU", turkey: "TR", "south africa": "ZA", "new zealand": "NZ", singapore: "SG",
  "united arab emirates": "AE", uae: "AE", bangladesh: "BD", pakistan: "PK", indonesia: "ID",
  philippines: "PH", thailand: "TH", vietnam: "VN", malaysia: "MY", romania: "RO", greece: "GR",
  "czech republic": "CZ", hungary: "HU", ukraine: "UA", israel: "IL", "saudi arabia": "SA",
  argentina: "AR", chile: "CL", colombia: "CO", peru: "PE", egypt: "EG", nigeria: "NG",
};

/** Normalise country names/codes to ISO-2 when possible. */
export function normCountry(v: string): string {
  const s = v.trim();
  if (!s || s.toLowerCase() === "null") return "null";
  const mapped = COUNTRY_MAP[s.toLowerCase().replace(/\./g, "")];
  if (mapped) return mapped;
  if (isAlpha2(s)) return s.toUpperCase();
  return s.toUpperCase();
}

const isCountryName = (s: string) => !!COUNTRY_MAP[s.trim().toLowerCase().replace(/\./g, "")];

export function detectBrand(cc: string): string {
  const n = digitsOnly(cc);
  if (/^4/.test(n)) return "VISA";
  if (/^(5[1-5]|2[2-7])/.test(n)) return "MASTERCARD";
  if (/^3[47]/.test(n)) return "AMEX";
  if (/^6(011|5|4[4-9])/.test(n)) return "DISCOVER";
  if (/^35/.test(n)) return "JCB";
  if (/^3(0[0-5]|[68])/.test(n)) return "DINERS";
  if (/^62/.test(n)) return "UNIONPAY";
  return "OTHER";
}

/** Normalise expiry pieces: accepts 1, 01, 2028, 28, 1228, 122028. */
function normExp(month: string, year: string): { month: string; year: string } {
  let m = digitsOnly(month);
  let y = digitsOnly(year);
  if (!y && (m.length === 4 || m.length === 6)) { y = m.slice(2); m = m.slice(0, 2); }
  if (y.length === 4) y = y.slice(2);
  if (y.length === 1) y = "0" + y;
  if (m.length === 1) m = "0" + m;
  if (m.length > 2) m = m.slice(0, 2);
  return { month: m || "null", year: y || "null" };
}

/** "12/28", "1228", "12-2028", "122028" → month + year */
function parseExpBlob(s: string): { month: string; year: string } | null {
  const t = s.trim();
  const sep = t.match(/^(\d{1,2})\s*[\/\-.\s]\s*(\d{2}|\d{4})$/);
  if (sep) {
    if (Number(sep[1]) < 1 || Number(sep[1]) > 12) return null;
    return normExp(sep[1], sep[2]);
  }
  const d = digitsOnly(t);
  if (t.replace(/\D/g, "") !== t.replace(/[^0-9]/g, "")) return null;
  if ((d.length === 4 || d.length === 6) && /^(0[1-9]|1[0-2])/.test(d)) {
    return normExp(d.slice(0, 2), d.slice(2));
  }
  return null;
}

const LABEL_KEYS: Record<string, keyof ParsedCard | "exp"> = {
  cc: "cc", card: "cc", number: "cc", cardnumber: "cc", "card number": "cc", pan: "cc", ccnum: "cc",
  cvv: "cvv", cvc: "cvv", cvv2: "cvv", code: "cvv", seccode: "cvv", "security code": "cvv",
  name: "name", holder: "name", cardholder: "name", fullname: "name", "full name": "name", "card holder": "name",
  address: "addr", addr: "addr", street: "addr", "address line": "addr", "address 1": "addr",
  city: "city", town: "city",
  state: "state", province: "state", region: "state",
  zip: "zip", zipcode: "zip", "zip code": "zip", postal: "zip", "postal code": "zip", postcode: "zip",
  country: "country",
  phone: "tel", tel: "tel", mobile: "tel", telephone: "tel", "phone number": "tel",
  email: "email", mail: "email", "e mail": "email",
  month: "month", mm: "month", "exp month": "month",
  year: "year", yy: "year", yyyy: "year", "exp year": "year",
  exp: "exp", expiry: "exp", expiration: "exp", expires: "exp", "exp date": "exp",
  "expiry date": "exp", valid: "exp", "valid thru": "exp", date: "exp",
};

const emptyCard = (): ParsedCard => ({
  cc: "null", month: "null", year: "null", cvv: "null", name: "null", addr: "null",
  city: "null", state: "null", zip: "null", country: "null", tel: "null", email: "null",
});

function finalize(out: ParsedCard): ParsedCard | null {
  out.cc = out.cc.replace(/[\s-]/g, "");
  if (!isCC(out.cc)) return null;
  const e = normExp(out.month === "null" ? "" : out.month, out.year === "null" ? "" : out.year);
  out.month = e.month; out.year = e.year;
  out.country = normCountry(out.country);
  if (out.state !== "null" && isAlpha2(out.state)) out.state = out.state.toUpperCase();
  if (out.cvv !== "null") out.cvv = digitsOnly(out.cvv) || "null";
  (Object.keys(out) as (keyof ParsedCard)[]).forEach((k) => { out[k] = norm(out[k]); });
  return out;
}

/** Strategy 1 — labeled "Key: value" input. */
function parseLabeled(line: string): ParsedCard | null {
  const re = /(?:^|[|,;\s])([A-Za-z][A-Za-z_-]{1,16})\s*[:=]\s*([^|,;\n]*?)(?=\s+[A-Za-z][A-Za-z_-]{1,16}\s*[:=]|[|,;]|$)/g;
  const out = emptyCard();
  let hits = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const rawKey = m[1].trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
    const value = m[2].trim();
    if (!value) continue;
    const key = LABEL_KEYS[rawKey] ?? LABEL_KEYS[rawKey.replace(/\s/g, "")];
    if (!key) continue;
    if (key === "exp") {
      const e = parseExpBlob(value);
      if (e) { out.month = e.month; out.year = e.year; hits++; }
      continue;
    }
    out[key] = value;
    hits++;
  }
  if (hits < 3 || out.cc === "null") return null;
  return finalize(out);
}

/** Strategy 3 — whitespace/free-text: pull known shapes out by regex. */
function parseLoose(line: string): ParsedCard | null {
  let s = ` ${line.trim()} `;
  const out = emptyCard();
  const grab = (re: RegExp): string | null => {
    const m = s.match(re);
    if (!m) return null;
    s = s.replace(m[0], " ");
    return m[0].trim();
  };

  const email = grab(/[^\s@|,;]+@[^\s@|,;]+\.[A-Za-z]{2,}/);
  if (email) out.email = email;

  const cc = grab(/(?<![\d-])\d{4}[ -]\d{4}[ -]\d{4}(?:[ -]\d{1,4})?(?![\d-])/) ?? grab(/(?<!\d)\d{12,19}(?!\d)/);
  if (!cc || !isCC(cc)) return null;
  out.cc = cc.replace(/[\s-]/g, "");

  const exp = grab(/(?<![\d\/])(0?[1-9]|1[0-2])\s*[\/\-.]\s*(\d{4}|\d{2})(?![\d\/])/);
  if (exp) {
    const e = parseExpBlob(exp);
    if (e) { out.month = e.month; out.year = e.year; }
  }

  const tel = grab(/(?<![\d@.])(?:\+\d[\d\s().-]{8,}|\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4})(?!\d)/);
  if (tel) out.tel = tel;

  const cvv = grab(/(?<!\d)\d{3,4}(?!\d)/);
  if (cvv) out.cvv = cvv;

  const zip = grab(/(?<![\w-])\d{5}(?:-\d{4})?(?![\w-])/);
  if (zip) out.zip = zip;

  const tokens = s.trim().split(/\s+/).filter(Boolean);
  if (tokens.length) {
    const last = tokens[tokens.length - 1];
    const twoWord = tokens.length >= 2 ? `${tokens[tokens.length - 2]} ${last}` : "";
    if (twoWord && isCountryName(twoWord)) { out.country = twoWord; tokens.splice(-2, 2); }
    else if (isCountryName(last) || (isAlpha2(last) && !US_STATES.has(last.toUpperCase()))) { out.country = last; tokens.pop(); }
  }
  if (tokens.length && isAlpha2(tokens[tokens.length - 1])) out.state = tokens.pop()!;
  if (tokens.length >= 2) out.name = `${tokens.shift()} ${tokens.shift()}`;
  else if (tokens.length === 1) out.name = tokens.shift()!;
  if (tokens.length >= 2) out.city = tokens.pop()!;
  if (tokens.length) out.addr = tokens.join(" ");
  return finalize(out);
}

/** Strip common label prefixes like "Address:", "City:". */
function stripLabel(s: string): string {
  const m = s.match(/^([A-Za-z][A-Za-z _-]{1,16})\s*[:=]\s*(.*)$/);
  if (!m) return s.trim();
  const key = m[1].trim().toLowerCase().replace(/[_-]+/g, " ");
  return (LABEL_KEYS[key] ? m[2] : s).trim();
}

/** Split a line on the strongest delimiter present. */
function splitLine(line: string): string[] {
  for (const d of ["|", "\t", ";", ",", ":"]) {
    if (line.split(d).length >= 3) return line.split(d).map((p) => stripLabel(p.trim()));
  }
  if (line.split(/\s{2,}/).length >= 3) return line.split(/\s{2,}/).map((p) => stripLabel(p.trim()));
  return [];
}

/** Strategy 2 — delimited tokens assigned by type + order. */
function parseDelimited(line: string): ParsedCard | null {
  let parts = splitLine(line).filter((p) => p.length > 0);
  if (parts.length < 3) return null;

  // Strip a leading base tag + price prefix (e.g. "BASE_X|2.50|4111...")
  const ccAt = parts.findIndex((p) => isCC(p));
  if (ccAt === -1) return null;
  parts = parts.slice(ccAt);

  // Drop trailing price tokens
  while (parts.length > 1 && /^\$?\d+(\.\d{1,2})?\$?$/.test(parts[parts.length - 1]) && parts.length > 3) {
    const t = parts[parts.length - 1];
    if (/\./.test(t)) parts.pop(); else break;
  }

  const out = emptyCard();
  out.cc = parts[0];
  let rest = parts.slice(1);

  // Expiry: "MM/YY" blob or separate month + year
  const blob = rest[0] ? parseExpBlob(rest[0]) : null;
  if (blob && (rest[0].includes("/") || rest[0].includes("-") || digitsOnly(rest[0]).length >= 4)) {
    out.month = blob.month; out.year = blob.year; rest = rest.slice(1);
  } else if (rest.length >= 2 && /^\d{1,2}$/.test(rest[0]) && Number(rest[0]) >= 1 && Number(rest[0]) <= 12 && /^(\d{2}|20\d{2})$/.test(rest[1])) {
    const e = normExp(rest[0], rest[1]);
    out.month = e.month; out.year = e.year; rest = rest.slice(2);
  }

  // CVV: next numeric 3-4
  if (rest.length && isCVV(rest[0])) { out.cvv = rest[0]; rest = rest.slice(1); }

  // Typed extraction from the remainder
  const takeFirst = (pred: (v: string) => boolean): string | null => {
    const i = rest.findIndex((v) => pred(v));
    if (i === -1) return null;
    const [v] = rest.splice(i, 1);
    return v;
  };

  out.email = takeFirst(isEmail) ?? "null";
  out.tel = takeFirst(isPhone) ?? "null";
  out.zip = takeFirst(isZip) ?? "null";
  const countryTok = takeFirst((v) => isCountryName(v)) ?? takeFirst((v) => isAlpha2(v) && !US_STATES.has(v.toUpperCase()));
  const stateTok = takeFirst((v) => isAlpha2(v) && US_STATES.has(v.toUpperCase()));
  out.country = countryTok ?? "null";
  out.state = stateTok ?? takeFirst((v) => isAlpha2(v)) ?? "null";
  if (out.cvv === "null") out.cvv = takeFirst(isCVV) ?? "null";

  // Remaining free-text tokens keep source order: name, addr, city
  const text = rest.filter((v) => norm(v) !== "null");
  if (text.length) out.name = text.shift()!;
  if (text.length >= 2) { out.addr = text.shift()!; out.city = text.shift()!; }
  else if (text.length === 1) out.city = text.shift()!;
  return finalize(out);
}

export function parseCardLine(raw: string): ParsedCard | null {
  const line = raw.trim();
  if (!line) return null;
  // Skip header rows (no card number present)
  if (!/\d{12}/.test(line.replace(/[\s-]/g, ""))) return null;

  return parseLabeled(line) ?? parseDelimited(line) ?? parseLoose(line);
}

/** Output in upload/fixer format: cc|month/year|cvv|name|addr|city|state|zip|country|tel|email */
export function toPipeFormat(card: ParsedCard): string {
  return `${card.cc}|${card.month}/${card.year}|${card.cvv}|${card.name}|${card.addr}|${card.city}|${card.state}|${card.zip}|${card.country}|${card.tel}|${card.email}`;
}

export function parseAndFormat(input: string): { lines: ParsedCard[]; output: string; failed: string[] } {
  const lines: ParsedCard[] = [];
  const failed: string[] = [];
  for (const raw of input.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const parsed = parseCardLine(raw);
    if (parsed && parsed.cc !== "null") lines.push(parsed);
    else failed.push(raw);
  }
  return { lines, output: lines.map(toPipeFormat).join("\n"), failed };
}

/** Dedupe by full card number. */
export function dedupe(cards: ParsedCard[]): { unique: ParsedCard[]; dropped: number } {
  const seen = new Set<string>();
  const unique: ParsedCard[] = [];
  for (const c of cards) {
    if (seen.has(c.cc)) continue;
    seen.add(c.cc);
    unique.push(c);
  }
  return { unique, dropped: cards.length - unique.length };
}
