import { ReactNode, useMemo } from "react";
import dragonBg from "@/assets/dragon-bg.webp";
import dragonLogo from "@/assets/dragon-logo.png";

const heroBg = dragonBg;

type Props = {
  children: ReactNode;
  title?: string;
  tagline?: ReactNode;
  accent?: "blue" | "red" | "gold";
  /** When true, the dragon breathes fire (used on successful login). */
  fire?: boolean;
};

const accentBar: Record<NonNullable<Props["accent"]>, string> = {
  blue: "from-[#2196f3] via-[#4fc3f7] to-[#2196f3]",
  red: "from-[#ff2d2d] via-[#ff6b6b] to-[#ff2d2d]",
  gold: "from-[#ffb300] via-[#ffe082] to-[#ffb300]",
};

/** Floating ember particles for the premium fire-dragon vibe */
function Embers() {
  const embers = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => ({
        id: i,
        left: `${(i * 47) % 100}%`,
        size: 4 + ((i * 7) % 7),
        delay: `${(i * 1.37) % 9}s`,
        duration: `${7 + ((i * 13) % 9)}s`,
        opacity: 0.35 + ((i * 17) % 55) / 100,
      })),
    []
  );
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {embers.map((e) => (
        <span
          key={e.id}
          className="absolute rounded-full"
          style={{
            left: e.left,
            bottom: "-12px",
            width: e.size,
            height: e.size,
            opacity: e.opacity,
            background: "radial-gradient(circle, #ffe082 0%, #ff6b1a 55%, transparent 100%)",
            boxShadow: "0 0 14px 3px rgba(255,120,30,0.7)",
            animation: `ember-rise ${e.duration} linear ${e.delay} infinite`,
          }}
        />
      ))}
    </div>
  );
}

/** Fire breath burst erupting from the dragon's mouth on successful login */
function FireBreath() {
  const sparks = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        id: i,
        dx: -70 + ((i * 41) % 140),
        dy: 30 + ((i * 29) % 90),
        size: 4 + ((i * 11) % 8),
        delay: (i * 0.035).toFixed(2),
      })),
    []
  );
  return (
    <div className="absolute inset-0 overflow-visible pointer-events-none" aria-hidden="true">
      {/* Core flame cone shooting downward from the dragon's mouth */}
      <div
        className="absolute left-1/2 top-[86%] -translate-x-1/2"
        style={{
          width: 110,
          height: 190,
          transformOrigin: "top center",
          background:
            "radial-gradient(ellipse 45% 30% at 50% 0%, #fff8e1 0%, #ffd54f 22%, #ff6b1a 52%, rgba(255,45,45,0.75) 75%, transparent 100%)",
          filter: "blur(7px)",
          clipPath: "polygon(42% 0, 58% 0, 100% 100%, 0 100%)",
          animation: "fire-breath 1.15s ease-out forwards",
        }}
      />
      {/* Inner white-hot core */}
      <div
        className="absolute left-1/2 top-[86%] -translate-x-1/2"
        style={{
          width: 46,
          height: 150,
          transformOrigin: "top center",
          background:
            "radial-gradient(ellipse 50% 25% at 50% 0%, #ffffff 0%, #ffe082 45%, rgba(255,140,26,0.8) 80%, transparent 100%)",
          filter: "blur(4px)",
          clipPath: "polygon(38% 0, 62% 0, 100% 100%, 0 100%)",
          animation: "fire-breath 0.95s ease-out 0.05s forwards",
        }}
      />
      {/* Scattered sparks */}
      {sparks.map((s) => (
        <span
          key={s.id}
          className="absolute left-1/2 top-[88%] rounded-full"
          style={{
            width: s.size,
            height: s.size,
            background: "radial-gradient(circle, #fff3e0 0%, #ff8c1a 60%, transparent 100%)",
            boxShadow: "0 0 12px 3px rgba(255,110,20,0.8)",
            animation: `fire-spark 1.05s ease-out ${s.delay}s forwards`,
            ["--dx" as string]: `${s.dx}px`,
            ["--dy" as string]: `${s.dy}px`,
            opacity: 0,
          }}
        />
      ))}
    </div>
  );
}

export function ScorpionAuthShell({
  children,
  title = "Zoru Shop",
  tagline,
  accent = "blue",
  fire = false,
}: Props) {
  return (
    <main
      className="min-h-screen w-full relative flex items-center justify-center px-4 py-10"
      style={{ fontFamily: '"DM Sans", "Segoe UI", system-ui, sans-serif' }}
    >
      <style>{`
        @keyframes ember-rise {
          0% { transform: translateY(0) translateX(0) scale(1); opacity: 0; }
          10% { opacity: 0.9; }
          50% { transform: translateY(-50vh) translateX(14px) scale(0.85); }
          100% { transform: translateY(-100vh) translateX(-10px) scale(0.4); opacity: 0; }
        }
        @keyframes dragon-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes ring-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fire-breath {
          0% { transform: translateX(-50%) scaleY(0) scaleX(0.4); opacity: 0; }
          12% { opacity: 1; }
          45% { transform: translateX(-50%) scaleY(1.15) scaleX(1.15); opacity: 1; }
          100% { transform: translateX(-50%) scaleY(1.35) scaleX(0.9); opacity: 0; }
        }
        @keyframes fire-spark {
          0% { transform: translate(-50%, 0) scale(0.5); opacity: 0; }
          15% { opacity: 1; }
          100% { transform: translate(calc(-50% + var(--dx)), var(--dy)) scale(0.2); opacity: 0; }
        }
        @keyframes dragon-roar {
          0%, 100% { transform: translateY(0) scale(1); }
          20% { transform: translateY(-10px) scale(1.08); filter: brightness(1.5) drop-shadow(0 0 24px rgba(255,120,20,0.95)); }
          55% { transform: translateY(-4px) scale(1.04); filter: brightness(1.25) drop-shadow(0 0 14px rgba(255,80,20,0.8)); }
        }
      `}</style>

      {/* Background dragon artwork */}
      <div
        className="absolute inset-0 bg-black"
        style={{
          backgroundImage: `url(${heroBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0.1) 0%, rgba(12,3,3,0.45) 55%, rgba(0,0,0,0.78) 100%)",
        }}
      />
      {/* Ambient fire glow at the bottom */}
      <div
        className="absolute inset-x-0 bottom-0 h-[38vh] pointer-events-none"
        style={{
          background:
            "linear-gradient(to top, rgba(255,70,15,0.14) 0%, rgba(255,45,45,0.05) 45%, transparent 100%)",
        }}
      />
      <Embers />

      <div
        className="relative z-10 w-full max-w-[420px]"
        style={{ animation: "fade-up 0.6s ease-out both" }}
      >
        {/* Premium glass card */}
        <div className="relative rounded-2xl overflow-hidden">
          {/* Animated conic border glow */}
          <div
            className="absolute -inset-[40%] opacity-60"
            style={{
              background:
                "conic-gradient(from 0deg, transparent 0%, rgba(255,45,45,0.55) 12%, transparent 25%, transparent 50%, rgba(255,179,0,0.5) 62%, transparent 75%, transparent 100%)",
              animation: "ring-spin 7s linear infinite",
            }}
          />
          {/* Glass surface */}
          <div
            className="relative m-[1.5px] rounded-2xl border border-white/15 shadow-[0_25px_80px_-15px_rgba(0,0,0,0.85)]"
            style={{
              background:
                "linear-gradient(160deg, rgba(24,10,16,0.55) 0%, rgba(10,5,10,0.72) 100%)",
              backdropFilter: "blur(24px) saturate(160%)",
            }}
          >
            <div className={`h-[2px] w-full bg-gradient-to-r ${accentBar[accent]}`} />
            <div className="px-8 py-9 sm:px-10 sm:py-10 text-white">
              <div className="text-center mb-7">
                <div className="flex justify-center mb-4">
                  <div
                    className="relative h-24 w-24"
                    style={{
                      animation: fire
                        ? "dragon-roar 1.2s ease-out both"
                        : "dragon-float 4.5s ease-in-out infinite",
                    }}
                  >
                    {fire && <FireBreath />}
                    <div
                      className="absolute inset-[-14px] rounded-full blur-xl opacity-70"
                      style={{
                        background:
                          "radial-gradient(circle, rgba(255,90,30,0.6) 0%, rgba(255,45,45,0.18) 55%, transparent 75%)",
                      }}
                    />
                    <div className="relative h-full w-full rounded-2xl bg-gradient-to-br from-[#1a0505]/85 to-[#3a0a0a]/65 border border-[#ffb300]/50 shadow-[inset_0_0_22px_rgba(255,80,20,0.3),0_0_30px_rgba(255,45,45,0.4)] flex items-center justify-center overflow-hidden backdrop-blur-sm">
                      <img
                        src={dragonLogo}
                        alt="Dragon emblem"
                        width={512}
                        height={512}
                        loading="lazy"
                        className="h-[92%] w-[92%] object-contain drop-shadow-[0_0_16px_rgba(255,80,20,0.9)]"
                      />
                    </div>
                  </div>
                </div>
                <h1
                  className="text-[27px] leading-none font-extrabold tracking-tight"
                  style={{ fontFamily: '"Space Grotesk", "DM Sans", sans-serif' }}
                >
                  <span
                    className="inline-block bg-clip-text text-transparent"
                    style={{
                      backgroundImage:
                        "linear-gradient(90deg, #ff2d2d 0%, #ff8c1a 50%, #ffd54f 100%)",
                    }}
                  >
                    {title}
                  </span>
                </h1>
                <div className="mt-2.5 flex justify-center">
                  <div className="h-[2px] w-16 rounded-full bg-gradient-to-r from-transparent via-[#ffb300]/80 to-transparent" />
                </div>
                {tagline && (
                  <p className="mt-4 text-[13px] text-white/80 leading-relaxed">{tagline}</p>
                )}
              </div>
              {children}
            </div>
          </div>
        </div>

        <p className="text-center text-[11px] text-white/60 mt-5 tracking-[0.15em] uppercase">
          © {new Date().getFullYear()} Zoru Shop · Все права защищены
        </p>
      </div>
    </main>
  );
}

export default ScorpionAuthShell;
