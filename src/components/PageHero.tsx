import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Premium gradient hero used across Referrals / Recharge / Orders / Cart
 * so every inner page shares the same "designful" header language.
 */
export const PageHero = ({
  eyebrow,
  eyebrowIcon: EyebrowIcon,
  title,
  highlight,
  description,
  right,
}: {
  eyebrow: string;
  eyebrowIcon?: LucideIcon;
  title: ReactNode;
  highlight?: string;
  description?: ReactNode;
  right?: ReactNode;
}) => (
  <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#101a33] via-[#132145] to-[#0a1122] p-6 sm:p-8 mb-5 shadow-[0_18px_50px_rgba(10,17,34,0.35)]">
    <div className="pointer-events-none absolute -top-20 -right-16 h-56 w-56 rounded-full bg-[#2196f3]/25 blur-3xl" />
    <div className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-[#f9a825]/20 blur-3xl" />
    <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-wider text-white/80">
          {EyebrowIcon ? <EyebrowIcon className="h-3 w-3" /> : null} {eyebrow}
        </span>
        <h1 className="mt-3 text-2xl sm:text-3xl font-semibold text-white">
          {title}
          {highlight ? (
            <>
              {" "}
              <span className="bg-gradient-to-r from-[#f9a825] to-[#ffd54f] bg-clip-text text-transparent">
                {highlight}
              </span>
            </>
          ) : null}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-white/70">{description}</p>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  </div>
);

const TONES = {
  blue: {
    wrap: "border-[#e6e6e6] bg-gradient-to-br from-white to-[#f3f7ff] shadow-[0_4px_16px_rgba(20,30,60,0.06)]",
    icon: "text-[#2196f3]",
    value: "text-[#1f2d3d]",
  },
  green: {
    wrap: "border-[#c8e6c9] bg-gradient-to-br from-white to-[#eaf7ec] shadow-[0_4px_16px_rgba(46,125,50,0.10)]",
    icon: "text-[#2fb344]",
    value: "text-[#2fb344]",
  },
  amber: {
    wrap: "border-[#ffe0b2] bg-gradient-to-br from-white to-[#fff6e5] shadow-[0_4px_16px_rgba(249,168,37,0.12)]",
    icon: "text-[#f9a825]",
    value: "text-[#1f2d3d]",
  },
} as const;

export const StatCard = ({
  label,
  value,
  icon: Icon,
  tone = "blue",
  hint,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone?: keyof typeof TONES;
  hint?: string;
}) => {
  const t = TONES[tone];
  return (
    <div className={`rounded-xl border p-4 ${t.wrap}`}>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-[#888]">
        <Icon className={`h-3.5 w-3.5 ${t.icon}`} /> {label}
      </div>
      <div className={`text-2xl sm:text-3xl font-semibold mt-1 ${t.value}`}>{value}</div>
      {hint ? <div className="text-[11.5px] text-[#8a8a8a] mt-0.5">{hint}</div> : null}
    </div>
  );
};

export default PageHero;
