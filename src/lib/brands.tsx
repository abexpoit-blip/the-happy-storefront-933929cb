import { ReactNode } from "react";

export const BRANDS = ["VISA", "MASTERCARD", "AMEX", "DISCOVER", "JCB", "DINERS"] as const;
export type Brand = (typeof BRANDS)[number];

export const COUNTRIES: { code: string; name: string; flag: string }[] = [
  { code: "US", name: "United States", flag: "🇺🇸" },
  { code: "CA", name: "Canada", flag: "🇨🇦" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
  { code: "AU", name: "Australia", flag: "🇦🇺" },
  { code: "DE", name: "Germany", flag: "🇩🇪" },
  { code: "FR", name: "France", flag: "🇫🇷" },
  { code: "IT", name: "Italy", flag: "🇮🇹" },
  { code: "ES", name: "Spain", flag: "🇪🇸" },
  { code: "JP", name: "Japan", flag: "🇯🇵" },
  { code: "BR", name: "Brazil", flag: "🇧🇷" },
  { code: "MX", name: "Mexico", flag: "🇲🇽" },
  { code: "IN", name: "India", flag: "🇮🇳" },
  { code: "CN", name: "China", flag: "🇨🇳" },
  { code: "KR", name: "South Korea", flag: "🇰🇷" },
  { code: "RU", name: "Russia", flag: "🇷🇺" },
  { code: "ZA", name: "South Africa", flag: "🇿🇦" },
  { code: "NG", name: "Nigeria", flag: "🇳🇬" },
  { code: "AE", name: "UAE", flag: "🇦🇪" },
  { code: "SA", name: "Saudi Arabia", flag: "🇸🇦" },
  { code: "SG", name: "Singapore", flag: "🇸🇬" },
  { code: "NZ", name: "New Zealand", flag: "🇳🇿" },
  { code: "SE", name: "Sweden", flag: "🇸🇪" },
  { code: "NO", name: "Norway", flag: "🇳🇴" },
  { code: "DK", name: "Denmark", flag: "🇩🇰" },
  { code: "FI", name: "Finland", flag: "🇫🇮" },
  { code: "NL", name: "Netherlands", flag: "🇳🇱" },
  { code: "BE", name: "Belgium", flag: "🇧🇪" },
  { code: "AT", name: "Austria", flag: "🇦🇹" },
  { code: "CH", name: "Switzerland", flag: "🇨🇭" },
  { code: "PL", name: "Poland", flag: "🇵🇱" },
  { code: "PT", name: "Portugal", flag: "🇵🇹" },
  { code: "IE", name: "Ireland", flag: "🇮🇪" },
  { code: "CZ", name: "Czech Republic", flag: "🇨🇿" },
  { code: "TR", name: "Turkey", flag: "🇹🇷" },
  { code: "TH", name: "Thailand", flag: "🇹🇭" },
  { code: "PH", name: "Philippines", flag: "🇵🇭" },
  { code: "MY", name: "Malaysia", flag: "🇲🇾" },
  { code: "ID", name: "Indonesia", flag: "🇮🇩" },
  { code: "VN", name: "Vietnam", flag: "🇻🇳" },
  { code: "AR", name: "Argentina", flag: "🇦🇷" },
  { code: "CL", name: "Chile", flag: "🇨🇱" },
  { code: "CO", name: "Colombia", flag: "🇨🇴" },
  { code: "PE", name: "Peru", flag: "🇵🇪" },
  { code: "EG", name: "Egypt", flag: "🇪🇬" },
  { code: "IL", name: "Israel", flag: "🇮🇱" },
  { code: "HK", name: "Hong Kong", flag: "🇭🇰" },
  { code: "TW", name: "Taiwan", flag: "🇹🇼" },
  { code: "PK", name: "Pakistan", flag: "🇵🇰" },
  { code: "BD", name: "Bangladesh", flag: "🇧🇩" },
  { code: "UA", name: "Ukraine", flag: "🇺🇦" },
  { code: "RO", name: "Romania", flag: "🇷🇴" },
  { code: "GR", name: "Greece", flag: "🇬🇷" },
  { code: "HU", name: "Hungary", flag: "🇭🇺" },
];

export const countryFlag = (code?: string | null) => flagEmoji(code);

/** Works for every ISO country, plus common aliases (USA, UK, Holland…). */
export const countryCode = (input?: string | null): string => resolveCountryCode(input);

export const countryName = (input?: string | null): string => resolveCountryName(input);

export function detectBrandFromBin(bin: string): string {
  const n = (bin ?? "").replace(/\D/g, "");
  if (/^4/.test(n)) return "VISA";
  if (/^(5[1-5]|2[2-7])/.test(n)) return "MASTERCARD";
  if (/^3[47]/.test(n)) return "AMEX";
  if (/^6(011|5|4[4-9])/.test(n)) return "DISCOVER";
  if (/^35/.test(n)) return "JCB";
  if (/^3(0[0-5]|[68])/.test(n)) return "DINERS";
  return "OTHER";
}

export function brandEmoji(brand: string): string {
  switch (brand?.toUpperCase()) {
    case "VISA": return "💳";
    case "MASTERCARD": return "🔴";
    case "AMEX": return "💎";
    case "DISCOVER": return "🔶";
    case "JCB": return "🟢";
    case "DINERS": return "🏛️";
    default: return "💳";
  }
}

/* ── Inline SVG brand logos ── */

const VisaLogo = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 780 500" className={className} xmlns="http://www.w3.org/2000/svg">
    <rect width="780" height="500" rx="40" fill="#1a1f71"/>
    <path d="M293.2 348.73l33.36-195.76h53.35l-33.38 195.76H293.2zm246.11-191.54c-10.57-3.97-27.16-8.2-47.89-8.2-52.84 0-90.08 26.58-90.36 64.62-.28 28.14 26.5 43.82 46.73 53.18 20.78 9.6 27.77 15.72 27.68 24.3-.14 13.12-16.58 19.12-31.91 19.12-21.35 0-32.67-2.96-50.18-10.27l-6.88-3.11-7.49 43.87c12.46 5.46 35.52 10.2 59.47 10.44 56.19 0 92.7-26.27 93.12-66.88.2-22.28-14.02-39.22-44.8-53.2-18.65-9.06-30.08-15.1-29.96-24.29 0-8.14 9.67-16.84 30.56-16.84 17.45-.28 30.1 3.53 39.94 7.5l4.78 2.26 7.19-42.5zm137.31-4.22h-41.34c-12.81 0-22.39 3.49-28.02 16.25l-79.49 179.51h56.18s9.17-24.14 11.25-29.43l68.55.07c1.6 7.27 6.52 29.36 6.52 29.36h49.64l-43.29-195.76zm-65.95 126.41c4.43-11.3 21.33-54.86 21.33-54.86-.31.52 4.39-11.36 7.1-18.74l3.62 16.93s10.25 46.81 12.39 56.67h-44.44zM238.58 152.97L186.1 290.26l-5.6-27.19c-9.74-31.28-40.09-65.18-74.06-82.12l47.89 167.67 56.56-.07 84.15-195.58h-56.46z" fill="#ffffff"/>
    <path d="M146.92 152.96H60.88l-.68 4.07c67.08 16.22 111.48 55.39 129.85 102.41l-18.72-89.95c-3.23-12.36-12.6-16.06-24.41-16.53z" fill="#f7a600"/>
  </svg>
);

const MastercardLogo = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 780 500" className={className} xmlns="http://www.w3.org/2000/svg">
    <rect width="780" height="500" rx="40" fill="#000"/>
    <circle cx="312" cy="250" r="150" fill="#eb001b"/>
    <circle cx="468" cy="250" r="150" fill="#f79e1b"/>
    <path d="M390 130a149.6 149.6 0 0 0-56 120 149.6 149.6 0 0 0 56 120 149.6 149.6 0 0 0 56-120 149.6 149.6 0 0 0-56-120z" fill="#ff5f00"/>
  </svg>
);

const AmexLogo = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 780 500" className={className} xmlns="http://www.w3.org/2000/svg">
    <rect width="780" height="500" rx="40" fill="#006fcf"/>
    <path d="M104 250l40-100h50l-65 100 65 100h-50l-40-100zm110-100h45l30 60 30-60h45l-55 100 55 100h-45l-30-60-30 60h-45l55-100-55-100zm195 0h120v35h-75v22h73v33h-73v22h75v38h-120V150zm145 0h50l40 60 40-60h50l-65 100 65 100h-50l-40-60-40 60h-50l65-100-65-100z" fill="#fff"/>
  </svg>
);

const DiscoverLogo = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 780 500" className={className} xmlns="http://www.w3.org/2000/svg">
    <rect width="780" height="500" rx="40" fill="#fff"/>
    <rect x="0" y="330" width="780" height="170" rx="0" fill="#f47216"/>
    <circle cx="490" cy="250" r="100" fill="#f47216"/>
    <text x="230" y="280" textAnchor="middle" fontFamily="Arial,Helvetica,sans-serif" fontWeight="bold" fontSize="110" fill="#1a1a1a">DISC</text>
    <text x="600" y="280" textAnchor="middle" fontFamily="Arial,Helvetica,sans-serif" fontWeight="bold" fontSize="110" fill="#fff">VER</text>
  </svg>
);

const JcbLogo = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 780 500" className={className} xmlns="http://www.w3.org/2000/svg">
    <rect width="780" height="500" rx="40" fill="#fff"/>
    <rect x="200" y="80" width="160" height="340" rx="30" fill="#0e4c96"/>
    <rect x="310" y="80" width="160" height="340" rx="30" fill="#e21836"/>
    <rect x="420" y="80" width="160" height="340" rx="30" fill="#007b40"/>
    <text x="280" y="290" textAnchor="middle" fontFamily="Arial,Helvetica,sans-serif" fontWeight="bold" fontSize="100" fill="#fff">J</text>
    <text x="390" y="290" textAnchor="middle" fontFamily="Arial,Helvetica,sans-serif" fontWeight="bold" fontSize="100" fill="#fff">C</text>
    <text x="500" y="290" textAnchor="middle" fontFamily="Arial,Helvetica,sans-serif" fontWeight="bold" fontSize="100" fill="#fff">B</text>
  </svg>
);

const brandSvgMap: Record<string, (props: { className?: string }) => ReactNode> = {
  VISA: VisaLogo,
  MASTERCARD: MastercardLogo,
  AMEX: AmexLogo,
  DISCOVER: DiscoverLogo,
  JCB: JcbLogo,
};

/** Small brand icon for inline use (e.g. in the live feed) */
export const BrandIcon = ({ brand, className = "h-5 w-auto" }: { brand: string; className?: string }): ReactNode => {
  const b = brand?.toUpperCase();
  const SvgComponent = brandSvgMap[b];
  if (SvgComponent) return <SvgComponent className={className} />;
  return <span className="text-sm">{brandEmoji(brand)}</span>;
};

export const RoleBadge = ({ role, isVerified }: { role: string; isVerified?: boolean }): ReactNode => {
  switch (role?.toLowerCase()) {
    case "admin":
      return (
        <span className="role-badge-admin inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-destructive/45 font-display font-bold uppercase tracking-wider">
          🛡️ Admin
        </span>
      );
    case "seller":
      return (
        <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-display font-bold uppercase tracking-wider ${
          isVerified
            ? "role-badge-seller border border-success/45 text-success"
            : "role-badge-seller border border-gold/45"
        }`}>
          {isVerified ? "✅ Verified" : "⏳ Unverified"}
        </span>
      );
    default:
      return (
        <span className="role-badge-buyer inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-primary/40 font-display font-bold uppercase tracking-wider">
          🏷️ Buyer
        </span>
      );
  }
};

export const BrandLogo = ({ brand, className = "h-6" }: { brand: string; className?: string }): ReactNode => {
  const b = brand?.toUpperCase();
  const SvgComponent = brandSvgMap[b];
  if (SvgComponent) {
    return (
      <span className={`inline-flex items-center justify-center ${className}`}>
        <SvgComponent className="h-full w-auto" />
      </span>
    );
  }
  const label = b === "DINERS" ? "DIN" : (brand || "?");
  return (
    <span className={`inline-flex items-center justify-center font-display font-bold rounded-md px-2 py-0.5 bg-gradient-gold text-gold-foreground shadow-gold text-[10px] ${className}`}>
      💳 {label}
    </span>
  );
};

/** Premium catalog card icon - larger visual for homepage */
export const CatalogBrandIcon = ({ brand }: { brand: string }): ReactNode => {
  const b = brand?.toUpperCase();
  const SvgComponent = brandSvgMap[b];
  const displayName = b === "MASTERCARD" ? "Mastercard" : b === "AMEX" ? "Amex" : b === "DISCOVER" ? "Discover" : brand;
  if (SvgComponent) {
    return (
      <div className="flex items-center gap-3">
        <SvgComponent className="h-8 w-auto" />
        <span className="font-display text-2xl font-bold text-primary-foreground tracking-tight drop-shadow-[0_1px_2px_hsl(var(--foreground)/0.25)]">{displayName}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-2xl">💳</span>
      <span className="font-display text-2xl font-bold text-primary-foreground tracking-tight drop-shadow-[0_1px_2px_hsl(var(--foreground)/0.25)]">{brand}</span>
    </div>
  );
};

/** SVG flag image (emoji flags don't render on Windows/Linux). */
export const CountryFlagImg = ({ code, className = "h-3.5 w-5" }: { code?: string | null; className?: string }) => {
  const cc = countryCode(code);
  if (!cc || cc.length !== 2) return <span className={className} />;
  return (
    <img
      src={`https://flagcdn.com/w40/${cc.toLowerCase()}.png`}
      alt={cc}
      loading="lazy"
      className={`${className} inline-block object-cover align-middle`}
    />
  );
};
