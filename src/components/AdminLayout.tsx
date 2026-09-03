import { ReactNode, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { NavLink, useLocation } from "react-router-dom";
import { Shield, LayoutDashboard, CreditCard, KeyRound, Settings as SettingsIcon, Menu, X, Banknote, DollarSign, LayoutGrid, LifeBuoy } from "lucide-react";

interface Item { to: string; label: string; icon: React.ComponentType<{ className?: string }>; }

const items: Item[] = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard },
  { to: "/admin/shop", label: "Shop · Cards", icon: CreditCard },
  { to: "/admin/categories", label: "Categories", icon: LayoutGrid },
  { to: "/admin/cards", label: "Card moderation", icon: CreditCard },
  { to: "/admin/payments", label: "Payments · Deposits", icon: DollarSign },

  { to: "/admin/payment-gateway", label: "Plisio Payment Gateway", icon: Banknote },
  { to: "/admin/support", label: "Support tickets", icon: LifeBuoy },
  { to: "/admin/site", label: "Site settings", icon: SettingsIcon },
  { to: "/admin/settings", label: "Credentials", icon: KeyRound },
];


const SidebarContent = ({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) => (
  <>
    <div className="flex items-center gap-3 mb-6 px-2">
      <div className="h-10 w-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center">
        <Shield className="h-5 w-5 text-primary-glow" />
      </div>
      <span className="font-display font-bold tracking-[0.15em] text-primary-glow text-base uppercase">Admin</span>
    </div>
    <nav className="space-y-1.5">
      {items.map((it) => {
        const active = it.to === "/admin" ? pathname === "/admin" : pathname.startsWith(it.to);
        const Icon = it.icon;
        return (
          <NavLink
            key={it.to}
            to={it.to}
            onClick={onNavigate}
            className={`flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-[15px] font-medium transition-all ${
              active
                ? "bg-gradient-to-r from-primary/20 to-primary/5 text-primary-glow border border-primary/40 shadow-gold"
                : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground border border-transparent"
            }`}
          >
            <Icon className={`h-5 w-5 shrink-0 ${active ? "text-primary-glow" : ""}`} />
            <span>{it.label}</span>
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
          <div className="glass-neon rounded-2xl p-6 lg:sticky lg:top-[calc(var(--nav-h)+1.5rem)]">
            <SidebarContent pathname={pathname} />
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-6">
          <h1 className="hidden lg:block font-display text-3xl font-black neon-text tracking-tight">{title}</h1>
          {children}
        </div>
      </div>
    </AppShell>
  );
};
