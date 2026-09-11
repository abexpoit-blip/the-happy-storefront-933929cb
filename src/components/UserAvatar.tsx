import { useState } from "react";

interface UserAvatarProps {
  username?: string | null;
  avatarUrl?: string | null;
  className?: string;
}

// Consistent seed-based palette for male characters
const THEMES = [
  { bg: "#1e293b", hair: "#0f172a", jacket: "#334155", accent: "#38bdf8", skin: "#fed7aa" },
  { bg: "#0f172a", hair: "#18181b", jacket: "#1e293b", accent: "#818cf8", skin: "#fcd34d" },
  { bg: "#14213d", hair: "#000000", jacket: "#1f2937", accent: "#3b82f6", skin: "#fde047" },
  { bg: "#111827", hair: "#27272a", jacket: "#374151", accent: "#10b981", skin: "#ffedd5" },
];

function getTheme(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return THEMES[Math.abs(hash) % THEMES.length];
}

/**
 * 100% self-contained handsome male vector avatar.
 * Zero external CDN dependencies, 0ms latency, never blocked by privacy blockers.
 */
export function MaleAvatarSvg({ seed, className = "h-full w-full" }: { seed: string; className?: string }) {
  const theme = getTheme(seed);
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label={`Avatar for ${seed}`}
    >
      {/* Background circle */}
      <circle cx="50" cy="50" r="50" fill={theme.bg} />
      
      {/* Inner subtle glow */}
      <circle cx="50" cy="50" r="48" stroke={theme.accent} strokeWidth="1" strokeOpacity="0.4" fill="none" />

      {/* Shoulders & Jacket */}
      <path
        d="M16 96 C20 74 34 68 50 68 C66 68 80 74 84 96 Z"
        fill={theme.jacket}
      />

      {/* Inner collar & shirt */}
      <path d="M42 68 L50 82 L58 68 Z" fill="#ffffff" />
      <path d="M47 78 L50 96 L53 78 Z" fill={theme.accent} />

      {/* Neck */}
      <rect x="44" y="54" width="12" height="18" rx="3" fill={theme.skin} />
      <path d="M44 64 C48 68 52 68 56 64 Z" fill="rgba(0,0,0,0.12)" />

      {/* Head & Jaw */}
      <path
        d="M34 40 C34 27 41 24 50 24 C59 24 66 27 66 40 C66 53 59 60 50 60 C41 60 34 53 34 40 Z"
        fill={theme.skin}
      />

      {/* Ears */}
      <circle cx="33" cy="42" r="4.5" fill={theme.skin} />
      <circle cx="67" cy="42" r="4.5" fill={theme.skin} />
      <circle cx="33" cy="42" r="2.5" fill="rgba(0,0,0,0.1)" />
      <circle cx="67" cy="42" r="2.5" fill="rgba(0,0,0,0.1)" />

      {/* Stylish male modern haircut */}
      <path
        d="M31 38 C30 25 38 15 50 15 C62 15 70 25 69 38 C66 28 59 24 50 24 C41 24 34 28 31 38 Z"
        fill={theme.hair}
      />
      {/* Textured hair side sweep */}
      <path
        d="M32 35 C36 26 46 20 58 20 C64 20 68 24 69 29 C65 23 58 22 50 22 C42 22 35 27 32 35 Z"
        fill="rgba(255,255,255,0.15)"
      />

      {/* Sunglasses / Tech Glasses (sharp modern look) */}
      <rect x="36" y="37" width="12" height="9" rx="2.5" fill="#090d16" stroke={theme.accent} strokeWidth="1.2" />
      <rect x="52" y="37" width="12" height="9" rx="2.5" fill="#090d16" stroke={theme.accent} strokeWidth="1.2" />
      <line x1="48" y1="41" x2="52" y2="41" stroke={theme.accent} strokeWidth="1.5" />
      
      {/* Lens reflections */}
      <line x1="38" y1="39" x2="44" y2="44" stroke="rgba(255,255,255,0.4)" strokeWidth="1" strokeLinecap="round" />
      <line x1="54" y1="39" x2="60" y2="44" stroke="rgba(255,255,255,0.4)" strokeWidth="1" strokeLinecap="round" />

      {/* Subtle beard shadow & masculine jawline */}
      <path
        d="M37 49 C41 57 59 57 63 49 C61 59 39 59 37 49 Z"
        fill="rgba(0,0,0,0.18)"
      />

      {/* Confident smile */}
      <path
        d="M45 52 Q50 55 55 52"
        stroke="#9a3412"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function UserAvatar({
  username,
  avatarUrl,
  className = "h-full w-full rounded-full object-cover",
}: UserAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const seed = username?.trim() || "User";

  // If a valid custom URL exists (that is not the broken dicebear) and hasn't failed, render it
  const isDicebear = typeof avatarUrl === "string" && avatarUrl.includes("dicebear.com");
  const usableUrl = !isDicebear && avatarUrl && avatarUrl.startsWith("http") && !imgFailed ? avatarUrl : null;

  if (usableUrl) {
    return (
      <img
        src={usableUrl}
        alt={seed}
        className={className}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return <MaleAvatarSvg seed={seed} className={className} />;
}
