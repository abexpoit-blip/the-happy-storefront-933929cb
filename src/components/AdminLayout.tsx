import { ReactNode, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { NavLink, useLocation } from "react-router-dom";
import { Shield, LayoutDashboard, CreditCard, KeyRound, Settings as SettingsIcon, Menu, X, Banknote, DollarSign, LayoutGrid, LifeBuoy, Activity, Hash, FileArchive } from "lucide-react";

interface Item { to: string; label: string; icon: React.ComponentType<{ className?: string }>; }

const items: Item[] = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard },
  { to: "/admin/shop", label: "Shop · Cards", icon: CreditCard },
  { to: "/admin/categories", label: "Categories", icon: LayoutGrid },
  { to: "/admin/cards", label: "Card moderation", icon: CreditCard },
  { to: "/admin/bins", label: "BIN section", icon: Hash },
  { to: "/admin/dumps", label: "DUMP · Bulk files", icon: FileArchive },
  { to: "/admin/payments", label: "Payments · Deposits", icon: DollarSign },

  { to: "/admin/payment-gateway", label: "Plisio Payment Gateway", icon: Banknote },
  { to: "/admin/checker", label: "Checker logs", icon: Activity },
  { to: "/admin/api-keys", label: "API keys", icon: KeyRound },
  { to: "/admin/support", label: "Support tickets", icon: LifeBuoy },
  { to: "/admin/site", label: "Site settings", icon: SettingsIcon },
  { to: "/admin/settings", label: "Credentials", icon: KeyRound },
];


const SidebarContent = ({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) => (
  <>
    <div className="mb-6 flex items-center gap-3 rounded-2xl border border-white/10 bg-gradient-to-br from-[#16224a] to-[#0c1430] px-3 py-3 shadow-[0_18px_40px_-28px_rgba(0,0,0,0.9)]">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#f9a825] to-[#ff7043] shadow-[0_10px_24px_-12px_rgba(249,168,37,0.9)]">
        <Shield className="h-5 w-5 text-[#101a33]" />
      </div>
      <div className="leading-tight">
        <span className="block text-[15px] font-bold uppercase tracking-[0.18em] text-white">Admin</span>
        <span className="block text-[11px] uppercase tracking-wider text-white/45">Control center</span>
      </div>
    </div>
    <nav className="space-y-1">
      {items.map((it) => {
        const active = it.to === "/admin" ? pathname === "/admin" : pathname.startsWith(it.to);
        const Icon = it.icon;
        return (
          <NavLink
            key={it.to}
            to={it.to}
            onClick={onNavigate}
            className={`group relative flex items-center gap-3 rounded-xl px-3.5 py-3 text-[14px] font-medium transition-all ${
              active
                ? "border border-[#f9a825]/40 bg-gradient-to-r from-[#f9a825]/20 via-[#f9a825]/10 to-transparent text-[#ffd54f] shadow-[0_14px_30px_-22px_rgba(249,168,37,0.95)]"
                : "border border-transparent text-white/60 hover:border-white/10 hover:bg-white/[0.06] hover:text-white"
            }`}
          >
            <span
              className={`absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full transition-all ${
                active ? "bg-gradient-to-b from-[#f9a825] to-[#ff7043]" : "bg-transparent"
              }`}
            />
            <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? "text-[#ffd54f]" : "text-white/45 group-hover:text-white"}`} />
            <span className="truncate">{it.label}</span>
          </NavLink>
        );
      })}
    </nav>
  </>
);

export const AdminLayout = ({ children, title }: { children: ReactNode; title: string }) => {
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <AppShell>
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
        {/* Mobile sidebar toggle */}
        <div className="lg:hidden flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-gradient-to-b from-[#16224a] to-[#0c1430] px-4 py-2.5 text-sm font-medium text-white/85 transition-all hover:border-[#f9a825]/45 hover:text-white"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            <Shield className="h-4 w-4 text-[#ffd54f]" />
            <span>Admin Menu</span>
          </button>
          <h1 className="truncate text-xl font-bold tracking-tight text-white">{title}</h1>
        </div>

        {/* Mobile sidebar drawer */}
        {mobileOpen && (
          <div className="lg:hidden animate-fade-up rounded-2xl border border-white/10 bg-gradient-to-b from-[#111c3d] to-[#0a1226] p-4 shadow-[0_30px_70px_-45px_rgba(0,0,0,0.95)]">
            <SidebarContent pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </div>
        )}

        {/* Desktop sidebar */}
        <aside className="hidden lg:block lg:w-[272px] xl:w-[292px] lg:shrink-0">
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-[#111c3d] via-[#0d1730] to-[#0a1226] p-4 lg:sticky lg:top-[calc(var(--nav-h)+1.5rem)] shadow-[0_30px_70px_-45px_rgba(0,0,0,0.95)]">
            <div className="pointer-events-none absolute -top-24 -right-16 h-52 w-52 rounded-full bg-[#f9a825]/12 blur-3xl" />
            <div className="relative">
              <SidebarContent pathname={pathname} />
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-6">
          <div className="relative hidden lg:block overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#132145] via-[#101a33] to-[#080f21] px-7 py-7 shadow-[0_28px_70px_-40px_rgba(0,0,0,0.95)]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#f9a825]/60 to-transparent" />
            <div className="pointer-events-none absolute -top-24 -right-14 h-64 w-64 rounded-full bg-[#2196f3]/22 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-28 -left-12 h-64 w-64 rounded-full bg-[#f9a825]/18 blur-3xl" />
            <div className="relative flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#f9a825] to-[#ff7043] shadow-[0_16px_34px_-16px_rgba(249,168,37,0.95)]">
                <Shield className="h-6 w-6 text-[#101a33]" />
              </div>
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/75">
                  Admin panel
                </span>
                <h1 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">
                  <span className="bg-gradient-to-r from-[#f9a825] via-[#ffd54f] to-[#ffab91] bg-clip-text text-transparent">{title}</span>
                </h1>
              </div>
            </div>
          </div>
          {children}
        </div>
      </div>
    </AppShell>
  );
};
