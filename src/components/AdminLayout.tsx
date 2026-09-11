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
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary/40 border border-border/50 text-sm font-medium text-foreground hover:bg-secondary/60 hover:border-primary/40 transition-all"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            <Shield className="h-4 w-4 text-primary-glow" />
            <span>Admin Menu</span>
          </button>
          <h1 className="font-display text-xl font-black neon-text tracking-tight truncate">{title}</h1>
        </div>

        {/* Mobile sidebar drawer */}
        {mobileOpen && (
          <div className="lg:hidden glass-neon rounded-2xl p-5 animate-fade-up">
            <SidebarContent pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </div>
        )}

        {/* Desktop sidebar */}
        <aside className="hidden lg:block lg:w-[280px] xl:w-[300px] lg:shrink-0">
          <div className="glass-neon rounded-2xl p-6 lg:sticky lg:top-[calc(var(--nav-h)+1.5rem)] border border-primary/25 bg-gradient-to-b from-primary/10 via-transparent to-primary/5 shadow-[0_30px_70px_-45px_rgba(0,0,0,0.95)]">
            <SidebarContent pathname={pathname} />
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-6">
          <div className="relative hidden lg:block overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#101a33] via-[#132145] to-[#0a1122] px-6 py-6 shadow-[0_18px_50px_rgba(10,17,34,0.35)]">
            <div className="pointer-events-none absolute -top-20 -right-16 h-56 w-56 rounded-full bg-[#2196f3]/25 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-[#f9a825]/20 blur-3xl" />
            <div className="relative">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-wider text-white/80">
                <Shield className="h-3 w-3" /> Admin panel
              </span>
              <h1 className="mt-3 text-2xl sm:text-3xl font-semibold text-white">
                <span className="bg-gradient-to-r from-[#f9a825] to-[#ffd54f] bg-clip-text text-transparent">{title}</span>
              </h1>
            </div>
          </div>
          {children}
        </div>
      </div>
    </AppShell>
  );
};
