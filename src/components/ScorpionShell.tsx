import { ReactNode, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ChevronDown, LogOut } from "lucide-react";

const NAV = [
  { to: "/", label: "HOME", end: true },
  { to: "/shop", label: "SHOP" },
  { to: "/cart", label: "CAR" },
  { to: "/orders", label: "ORDER" },
  { to: "/recharge", label: "RECHARGE CENTER" },
  { to: "/referrals", label: "REFERRAL" },
];


export function ScorpionShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const balance = Number(profile?.balance ?? 0).toFixed(2);
  const uname = profile?.username ?? "member";

  return (
    <div
      className="min-h-screen bg-white text-[#1a1a1a]"
      style={{ fontFamily: '"DM Sans", "Segoe UI", system-ui, sans-serif' }}
    >
      {/* TOP NAV */}
      <header className="bg-[#1f2d3d] text-white">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 h-12 flex items-center gap-6">
          <nav className="flex items-center gap-1 h-full text-[13px] tracking-wide">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `h-full px-4 flex items-center transition-colors border-b-2 ${
                    isActive
                      ? "text-[#4fc3f7] border-[#4fc3f7]"
                      : "text-white/85 border-transparent hover:text-white"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      {/* SUB BAR — balance + user */}
      <div className="bg-white border-b border-[#e6e6e6]">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 h-12 flex items-center justify-end gap-3 text-[13px]">
          <Link
            to="/recharge"
            className="px-3 py-1.5 border border-[#e6e6e6] text-[#2196f3] hover:bg-[#f5faff] transition"
          >
            Samexpoit
          </Link>
          <Link
            to="/recharge"
            className="px-3 py-1.5 border border-[#e6e6e6] text-[#2fb344] hover:bg-[#f4fbf5] transition font-medium"
          >
            $ {balance}
          </Link>
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 pl-1 pr-2 py-1 hover:bg-[#f7f7f7] transition"
            >
              <span className="h-8 w-8 rounded-full bg-[#1f2d3d] text-white text-xs uppercase font-medium flex items-center justify-center">
                {uname.slice(0, 2)}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-[#666]" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-[#e6e6e6] shadow-md z-10 text-sm">
                <div className="px-3 py-2 border-b border-[#eee] text-[#333]">
                  <div className="font-medium truncate">{uname}</div>
                  <div className="text-[11px] text-[#888]">Balance: ${balance}</div>
                </div>
                <Link to="/settings" className="block px-3 py-2 hover:bg-[#f7f7f7]" onClick={() => setMenuOpen(false)}>
                  Settings
                </Link>
                <Link to="/referrals" className="block px-3 py-2 hover:bg-[#f7f7f7]" onClick={() => setMenuOpen(false)}>
                  Referrals
                </Link>
                <Link to="/support" className="block px-3 py-2 hover:bg-[#f7f7f7]" onClick={() => setMenuOpen(false)}>
                  Support
                </Link>
                <button
                  onClick={() => { setMenuOpen(false); signOut(); }}
                  className="w-full text-left px-3 py-2 hover:bg-[#f7f7f7] flex items-center gap-2 text-[#d32f2f]"
                >
                  <LogOut className="h-3.5 w-3.5" /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1400px] px-4 sm:px-6 py-5">{children}</main>
    </div>
  );
}

export default ScorpionShell;
