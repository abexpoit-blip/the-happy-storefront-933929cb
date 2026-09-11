import { ReactNode, useEffect, useRef, useState } from "react";
import { Link, Navigate, NavLink, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, Menu, X, ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { LanguageToggle, useLanguage } from "@/lib/i18n";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { cartCount, onCartChange } from "@/lib/cart";
import { UserAvatar } from "@/components/UserAvatar";


const buyerNav = [
  { to: "/", en: "HOME", ru: "ГЛАВНАЯ", end: true },
  { to: "/shop", en: "SHOP", ru: "МАГАЗИН" },
  { to: "/bins", en: "BIN", ru: "BIN" },
  { to: "/dumps", en: "DUMP", ru: "DUMP" },
  { to: "/cart", en: "CART", ru: "КОРЗИНА" },
  { to: "/orders", en: "ORDERS", ru: "ЗАКАЗЫ" },
  { to: "/recharge", en: "RECHARGE", ru: "ПОПОЛНЕНИЕ" },
  { to: "/checker", en: "CHECKER", ru: "ЧЕКЕР" },
  { to: "/referrals", en: "REFERRALS", ru: "РЕФЕРАЛЫ" },
  { to: "/api-access", en: "API", ru: "API" },
  { to: "/support", en: "SUPPORT", ru: "ПОДДЕРЖКА" },
];


export const AppShell = ({ children, wide }: { children: ReactNode; wide?: boolean }) => {
  const { profile, signOut, user } = useAuth();
  const { lang } = useLanguage();
  const settings = useSiteSettings();
  const nav = useNavigate();
  useLocation();

  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const items = buyerNav;
  const [cartN, setCartN] = useState(0);
  useEffect(() => {
    const sync = () => setCartN(cartCount());
    sync();
    return onCartChange(sync);
  }, []);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const balance = Number(profile?.balance ?? 0).toFixed(2);
  const uname = profile?.username ?? "пользователь";

  return (
    <div
      className="min-h-screen bg-white text-[#1a1a1a] flex flex-col"
      style={{ fontFamily: '"DM Sans", "Segoe UI", system-ui, sans-serif' }}
    >
      {settings.site_maintenance && profile?.role === "admin" && (
        <div className="bg-amber-500 text-black text-xs font-semibold px-4 py-2 text-center flex items-center justify-center gap-2 sticky top-0 z-50 shadow-sm">
          <span>⚠️ <b>Технические работы включены (Maintenance Mode Active)</b> — Обычные пользователи не могут зайти на сайт.</span>
          <Link to="/admin/site" className="underline hover:text-black/80 font-bold ml-2">Настройки сайта</Link>
        </div>
      )}

      {/* TOP NAV */}
      <header className="bg-[#304156] text-white sticky top-0 z-40">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 h-12 flex items-center justify-between gap-6">
          <nav className="hidden lg:flex items-center h-full text-[13px] tracking-wide">
            {items.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={(n as any).end}
                className={({ isActive }) =>
                  `h-full px-4 flex items-center transition-colors border-b-2 relative ${
                    isActive
                      ? "text-[#409EFF] border-[#409EFF] bg-[#263445]"
                      : "text-[#bfcbd9] border-transparent hover:text-white"
                  }`
                }
              >
                {n[lang]}
                {n.to === "/cart" && cartN > 0 && (
                  <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#f56c6c] px-1 text-[10px] font-bold text-white">
                    {cartN}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
          <button
            onClick={() => setDrawerOpen((v) => !v)}
            className="lg:hidden p-2 -ml-2 text-white"
            aria-label={lang === "en" ? "Menu" : "Меню"}
          >
            {drawerOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="text-[13px] font-medium tracking-wide text-white/90 truncate">
            {settings.shop_name}
          </div>
        </div>
        {drawerOpen && (
          <div className="lg:hidden bg-[#304156] border-t border-white/10">
            {items.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={(n as any).end}
                onClick={() => setDrawerOpen(false)}
                className={({ isActive }) =>
                  `block px-4 py-3 text-sm border-l-2 ${
                    isActive ? "border-[#409EFF] text-[#409EFF] bg-white/5" : "border-transparent text-[#bfcbd9] hover:bg-white/5"
                  }`
                }
              >
                {n[lang]}
                {n.to === "/cart" && cartN > 0 && (
                  <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#f56c6c] px-1 text-[10px] font-bold text-white">
                    {cartN}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        )}
      </header>

      {/* SUB BAR */}
      <div className="bg-white border-b border-[#e6e6e6]">
        <div className="mx-auto max-w-[1400px] px-3 sm:px-6 min-h-16 py-2.5 flex flex-wrap items-center justify-end gap-2.5 sm:gap-3.5 text-[13px] sm:text-[14px]">
          <LanguageToggle />
          <span className="px-3 sm:px-3.5 py-2 border border-[#e6e6e6] text-[#2196f3] max-w-[140px] sm:max-w-none truncate">


            {uname}
          </span>
          <Link
            to="/recharge"
            className="px-3 sm:px-3.5 py-2 border border-[#e6e6e6] text-[#2fb344] hover:bg-[#f4fbf5] transition font-medium whitespace-nowrap"
          >
            $ {balance}
          </Link>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="group flex items-center gap-2 rounded-full border border-[#e6e6e6] bg-gradient-to-b from-white to-[#f4f6f8] pl-1 pr-2 py-1 hover:border-[#2196f3]/60 hover:shadow-[0_6px_16px_-10px_rgba(33,150,243,0.9)] transition"
            >
              <span className="relative h-11 w-11 rounded-full p-[2px] bg-[conic-gradient(from_180deg,#42a5f5,#7e57c2,#f9a825,#42a5f5)] shadow-[0_6px_14px_-8px_rgba(31,45,61,0.9)]">
                <UserAvatar username={uname} avatarUrl={profile?.avatar_url} className="h-full w-full rounded-full object-cover" />
                <span className="absolute -bottom-0 -right-0 h-2.5 w-2.5 rounded-full bg-[#2fb344] ring-2 ring-white" />
              </span>
              <span className="hidden sm:flex flex-col items-start leading-tight">
                <span className="text-[13px] font-semibold text-[#1f2d3d] max-w-[130px] truncate">{uname}</span>
                <span className="text-[11px] text-[#8a97a5]">
                  {profile?.role === "admin" ? "ADMIN" : "PREMIUM"}
                </span>
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-[#666] group-hover:text-[#2196f3]" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-60 rounded-xl bg-white border border-[#e6e6e6] shadow-[0_20px_50px_-24px_rgba(31,45,61,0.85)] z-20 text-sm overflow-hidden">
                <div className="flex items-center gap-3 px-3 py-3 bg-gradient-to-r from-[#304156] to-[#3d5570] text-white">
                  <span className="h-11 w-11 rounded-full p-[2px] bg-[conic-gradient(from_180deg,#42a5f5,#7e57c2,#f9a825,#42a5f5)]">
                    <UserAvatar username={uname} avatarUrl={profile?.avatar_url} className="h-full w-full rounded-full object-cover" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold truncate">{uname}</div>
                    <div className="text-[11px] text-white/70">$ {balance}</div>
                  </div>
                </div>
                <Link
                  to="/profile"
                  onClick={() => setMenuOpen(false)}
                  className="block px-3 py-2 hover:bg-[#f7f7f7] text-[#333]"
                >
                  {lang === "en" ? "Profile" : "Профиль"}
                </Link>
                <Link
                  to="/orders"
                  onClick={() => setMenuOpen(false)}
                  className="block px-3 py-2 hover:bg-[#f7f7f7] text-[#333]"
                >
                  {lang === "en" ? "Orders" : "Заказы"}
                </Link>
                <Link
                  to="/recharge"
                  onClick={() => setMenuOpen(false)}
                  className="block px-3 py-2 hover:bg-[#f7f7f7] text-[#333]"
                >
                  {lang === "en" ? "Recharge" : "Пополнение"}
                </Link>
                <button
                  onClick={async () => { setMenuOpen(false); await signOut(); nav("/auth"); }}
                  className="w-full text-left px-3 py-2 hover:bg-[#fff5f5] flex items-center gap-2 text-[#d32f2f] border-t border-[#eee]"
                >
                  <LogOut className="h-3.5 w-3.5" /> {lang === "en" ? "Log out" : "Выйти"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <main className={`flex-1 mx-auto w-full ${wide ? "max-w-[1860px] px-2 sm:px-4" : "max-w-[1400px] px-3 sm:px-6"} py-4 sm:py-5`}>{children}</main>

      {/* ПОДВАЛ */}
      <footer className="bg-[#304156] text-white/70 mt-6">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-3 text-[12px]">
          <div>© {new Date().getFullYear()} {settings.shop_name}. {lang === "en" ? "All rights reserved." : "Все права защищены."}</div>
          <div className="flex items-center gap-4">
            <span>{lang === "en" ? "24/7 support" : "Поддержка 24/7"}</span>
            <span className="hidden md:inline text-white/30">·</span>
            <span>{lang === "en" ? "Instant delivery" : "Мгновенная доставка"}</span>
            <span className="hidden md:inline text-white/30">·</span>
            <span>{lang === "en" ? "Secure payments" : "Безопасные расчёты"}</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { user, profile, loading, signOut, profileError } = useAuth();
  const settings = useSiteSettings();
  const nav = useNavigate();
  const loc = useLocation();
  // 30-minute session limit — regular users only, admins are exempt.
  useSessionTimeout(Boolean(user) && profile?.role !== "admin");
  if (loading && !profileError) return <div className="min-h-screen flex items-center justify-center text-[#666]">Загрузка…</div>;

  if (!user) return <Navigate to="/auth" replace state={{ from: loc }} />;
  if (profile?.banned) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center bg-white">
        <div className="border border-[#e6e6e6] rounded-md p-8 max-w-md bg-white shadow-sm">
          <h2 className="text-2xl font-semibold text-[#d32f2f] mb-2">Аккаунт заблокирован</h2>
          <p className="text-[#666] text-sm mb-6">Ваш аккаунт заблокирован. Свяжитесь с поддержкой, если считаете это ошибкой.</p>
          <Button onClick={async () => { await signOut(); nav("/auth"); }} variant="outline">Выйти</Button>
        </div>
      </div>
    );
  }

  // Site maintenance guard — admins are exempt
  if (settings.site_maintenance && profile?.role !== "admin") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#0c1322] text-white text-center">
        <div className="max-w-md w-full p-8 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md shadow-2xl space-y-5">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white mb-2">Технические работы</h1>
            <p className="text-sm text-white/70 leading-relaxed">
              {settings.site_maintenance_msg || "Сайт временно закрыт на плановое техническое обслуживание. Пожалуйста, зайдите позже."}
            </p>
          </div>
          <div className="pt-3 border-t border-white/10 flex flex-col gap-2">
            <Link
              to="/crzr-x9k2-panel"
              className="text-xs text-white/40 hover:text-[#5ac8fa] transition-colors"
            >
              Вход для администратора
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => { await signOut(); nav("/auth"); }}
              className="mt-1"
            >
              Выйти
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export const AdminRoute = ({ children }: { children: ReactNode }) => {
  const { profile, loading, user, profileError } = useAuth();
  const loc = useLocation();
  if (loading && !profileError) {
    return <div className="min-h-screen flex items-center justify-center text-[#666]">Загрузка…</div>;
  }
  if (!user) return <Navigate to="/crzr-x9k2-panel" replace state={{ from: loc }} />;
  // Profile not loaded yet (slow/failed request) — don't bounce a signed-in admin out.
  if (!profile) {
    return <div className="min-h-screen flex items-center justify-center text-[#666]">Загрузка…</div>;
  }
  if (profile?.role !== "admin") {
    return <Navigate to="/crzr-x9k2-panel" replace state={{ from: loc, reason: "not-admin" }} />;
  }
  return <>{children}</>;
};
