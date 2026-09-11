import { Link } from "react-router-dom";
import { Bot, LifeBuoy, Sparkles } from "lucide-react";

/**
 * Animated call-to-action: build a CC shop or a checker bot.
 * Telegram is intentionally not linked yet — support only.
 */
export const BuildBotBanner = ({ className = "" }: { className?: string }) => (
  <div
    className={`relative overflow-hidden rounded-2xl border border-[#cfe4ff] bg-white px-5 py-4 shadow-[0_18px_40px_-34px_rgba(31,45,61,0.4)] animate-pulse-glow ${className}`}
  >
    <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#409eff] via-[#4fc3f7] to-transparent" />
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#409eff] to-[#4fc3f7] text-white animate-float">
        <Bot className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <p
          className="bg-[linear-gradient(90deg,#1f2d3d_0%,#409eff_35%,#4fc3f7_50%,#409eff_65%,#1f2d3d_100%)] bg-[length:200%_100%] bg-clip-text text-[15px] font-bold tracking-tight text-transparent animate-shimmer sm:text-[17px]"
        >
          Wanna build a CC Shop or a Checker bot? Contact admin.
        </p>
        <p className="mt-0.5 text-[12.5px] text-[#5b6472]">
          Message us on support — full shop, checker and API setup, built for you.
        </p>
      </div>

      <Link
        to="/support"
        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#409eff] to-[#4fc3f7] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:brightness-110"
      >
        <LifeBuoy className="h-4 w-4" /> Message support
      </Link>
      <span className="inline-flex items-center gap-1 rounded-full border border-[#cfe4ff] bg-[#ecf5ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#409eff]">
        <Sparkles className="h-3 w-3" /> Custom build
      </span>
    </div>
  </div>
);

export default BuildBotBanner;
