/**
 * Full ISO 3166-1 alpha-2 country support.
 * The list is derived at runtime from Intl.DisplayNames, so every country the
 * browser knows about is supported (no hand-maintained subset).
 */

type Entry = { code: string; name: string };

let CACHE: Entry[] | null = null;
let BY_CODE: Map<string, Entry> | null = null;
let BY_NAME: Map<string, string> | null = null;

/** Common aliases / non-standard spellings seen in uploaded card bases. */
const ALIASES: Record<string, string> = {
  USA: "US", "U.S.A.": "US", "U.S.": "US", AMERICA: "US",
  "UNITED STATES OF AMERICA": "US", "UNITED STATES": "US",
  UK: "GB", ENGLAND: "GB", SCOTLAND: "GB", WALES: "GB",
  "GREAT BRITAIN": "GB", "NORTHERN IRELAND": "GB",
  "SOUTH KOREA": "KR", "KOREA REPUBLIC": "KR", "REPUBLIC OF KOREA": "KR",
  "NORTH KOREA": "KP", "RUSSIAN FEDERATION": "RU", RUSSIA: "RU",
  UAE: "AE", "UNITED ARAB EMIRATES": "AE", HOLLAND: "NL",
  "THE NETHERLANDS": "NL", "CZECH REPUBLIC": "CZ", CZECHIA: "CZ",
  "IVORY COAST": "CI", "COTE D'IVOIRE": "CI", VIETNAM: "VN",
  "VIET NAM": "VN", TURKIYE: "TR", TURKEY: "TR", BURMA: "MM",
  "HONG KONG SAR": "HK", MACAU: "MO", "CAPE VERDE": "CV",
  "SWAZILAND": "SZ", "EAST TIMOR": "TL", PALESTINE: "PS",
  BOLIVIA: "BO", VENEZUELA: "VE", TANZANIA: "TZ", MOLDOVA: "MD",
  LAOS: "LA", SYRIA: "SY", BRUNEI: "BN", "SOUTH AFRICA": "ZA",
  "DOMINICAN REP": "DO", "DOMINICAN REPUBLIC": "DO",
};

function build(): Entry[] {
  if (CACHE) return CACHE;
  const out: Entry[] = [];
  let dn: Intl.DisplayNames | null = null;
  try {
    dn = new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    dn = null;
  }
  for (let a = 65; a < 91; a++) {
    for (let b = 65; b < 91; b++) {
      const code = String.fromCharCode(a) + String.fromCharCode(b);
      let name = code;
      try {
        name = dn?.of(code) ?? code;
      } catch {
        name = code;
      }
      if (!name || name === code) continue;
      out.push({ code, name });
    }
  }
  out.sort((x, y) => x.name.localeCompare(y.name));
  CACHE = out;
  BY_CODE = new Map(out.map((e) => [e.code, e]));
  BY_NAME = new Map(out.map((e) => [e.name.toUpperCase(), e.code]));
  return out;
}

export const allCountries = (): Entry[] => build();

/** Best-effort ISO2 code from a code, a full name or a messy label. */
export function resolveCountryCode(input?: string | null): string {
  if (!input) return "";
  build();
  const raw = String(input).trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (BY_CODE!.has(upper)) return upper;
  if (ALIASES[upper]) return ALIASES[upper];
  if (BY_NAME!.has(upper)) return BY_NAME!.get(upper)!;

  // strip punctuation / extra words: "US - CALIFORNIA", "United States (US)"
  const cleaned = upper.replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();
  if (BY_CODE!.has(cleaned)) return cleaned;
  if (ALIASES[cleaned]) return ALIASES[cleaned];
  if (BY_NAME!.has(cleaned)) return BY_NAME!.get(cleaned)!;

  const first = cleaned.split(" ")[0];
  if (first && first.length === 2 && BY_CODE!.has(first)) return first;
  if (ALIASES[first]) return ALIASES[first];

  // partial name match ("UNITED STATES MINOR" etc.)
  for (const [name, code] of BY_NAME!) {
    if (cleaned === name || cleaned.startsWith(name + " ")) return code;
  }
  return upper.slice(0, 2);
}

export function resolveCountryName(input?: string | null): string {
  if (!input) return "";
  build();
  const code = resolveCountryCode(input);
  return BY_CODE!.get(code)?.name ?? String(input);
}

/** Flag emoji for any ISO2 code (regional indicator letters). */
export function flagEmoji(input?: string | null): string {
  const code = resolveCountryCode(input);
  if (!/^[A-Z]{2}$/.test(code)) return "🌐";
  const base = 0x1f1e6 - 65;
  return String.fromCodePoint(base + code.charCodeAt(0)) + String.fromCodePoint(base + code.charCodeAt(1));
}
