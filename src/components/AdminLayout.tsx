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
    <div className="mb-5 flex items-center gap-3 rounded-xl border border-[#e6e9ef] bg-[#f7f9fc] px-3 py-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#409eff] to-[#4fc3f7] shadow-[0_10px_22px_-12px_rgba(64,158,255,0.9)]">
        <Shield className="h-5 w-5 text-white" />
      </div>
      <div className="leading-tight">
        <span className="block text-[15px] font-bold uppercase tracking-[0.18em] text-[#1f2d3d]">Admin</span>
        <span className="block text-[11px] uppercase tracking-wider text-[#909399]">Control center</span>
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
                ? "border border-[#cfe4ff] bg-[#ecf5ff] text-[#409eff]"
                : "border border-transparent text-[#5b6472] hover:border-[#e6e9ef] hover:bg-[#f7f9fc] hover:text-[#1f2d3d]"
            }`}
          >
            <span
              className={`absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full transition-all ${
                active ? "bg-gradient-to-b from-[#409eff] to-[#4fc3f7]" : "bg-transparent"
              }`}
            />
            <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? "text-[#409eff]" : "text-[#9aa3af] group-hover:text-[#1f2d3d]"}`} />
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
            className="inline-flex items-center gap-2 rounded-xl border border-[#e6e9ef] bg-white px-4 py-2.5 text-sm font-medium text-[#1f2d3d] transition-all hover:border-[#409eff]/50 hover:text-[#409eff]"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            <Shield className="h-4 w-4 text-[#409eff]" />
            <span>Admin Menu</span>
          </button>
          <h1 className="truncate text-xl font-bold tracking-tight text-[#1f2d3d]">{title}</h1>
        </div>

        {/* Mobile sidebar drawer */}
        {mobileOpen && (
          <div className="lg:hidden animate-fade-up rounded-2xl border border-[#e6e9ef] bg-white p-4 shadow-[0_18px_40px_-30px_rgba(31,45,61,0.35)]">
            <SidebarContent pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </div>
        )}

        {/* Desktop sidebar */}
        <aside className="hidden lg:block lg:w-[272px] xl:w-[292px] lg:shrink-0">
          <div className="relative overflow-hidden rounded-2xl border border-[#e6e9ef] bg-white p-4 lg:sticky lg:top-[calc(var(--nav-h)+1.5rem)] shadow-[0_18px_40px_-32px_rgba(31,45,61,0.35)]">
            <div className="pointer-events-none absolute -top-24 -right-16 h-52 w-52 rounded-full bg-[#409eff]/10 blur-3xl" />
            <div className="relative">
              <SidebarContent pathname={pathname} />
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-6">
          <div className="relative hidden lg:block overflow-hidden rounded-2xl border border-[#e6e9ef] bg-white px-7 py-6 shadow-[0_18px_40px_-34px_rgba(31,45,61,0.35)]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#409eff] via-[#4fc3f7] to-transparent" />
            <div className="relative flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#409eff] to-[#4fc3f7] shadow-[0_16px_30px_-18px_rgba(64,158,255,0.95)]">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#cfe4ff] bg-[#ecf5ff] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#409eff]">
                  Admin panel
                </span>
                <h1 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-[#1f2d3d]">{title}</h1>
              </div>
            </div>
          </div>
          {children}
        </div>
      </div>
    </AppShell>
  );
};
