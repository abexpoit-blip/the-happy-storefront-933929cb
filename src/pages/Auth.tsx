import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { authApi, setToken, ApiError } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, User as UserIcon, Lock, Mail, Eye, EyeOff, ShieldCheck, Zap, BadgeCheck } from "lucide-react";
import Seo from "@/components/Seo";
import { useAuth } from "@/hooks/useAuth";
import { ScorpionAuthShell } from "@/components/ScorpionAuthShell";
import { useLanguage } from "@/lib/i18n";

const inputCls =
  "w-full pl-11 pr-11 py-3 rounded-xl bg-white/[0.05] border border-white/10 text-white text-sm placeholder-white/35 focus:outline-none focus:border-[#ffb300]/70 focus:bg-white/[0.08] focus:shadow-[0_0_0_3px_rgba(255,179,0,0.12)] transition-all backdrop-blur-sm";

const Auth = () => {
  const { lang, setLang } = useLanguage();
  const nav = useNavigate();
  const loc = useLocation();
  const { refresh } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fire, setFire] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{ title: string; hint?: string } | null>(null);
  const fromPath = (loc.state as { from?: { pathname?: string } } | null)?.from?.pathname;
  const safeFrom = fromPath && fromPath !== "/auth" ? fromPath : null;

  useEffect(() => {
    const prefill = sessionStorage.getItem("zorushop.prefillEmail");
    if (prefill) {
      setUsername(prefill);
      sessionStorage.removeItem("zorushop.prefillEmail");
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusBanner(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        const fakeEmail = email || `${username.toLowerCase()}@zoru.cc`;
        const result = await authApi.signup({ email: fakeEmail, username, password });
        setToken(result.token);
        await refresh();
        toast.success("Аккаунт создан");
        setFire(true);
        setTimeout(() => nav("/shop", { replace: true }), 950);
      } else {
        const result = await authApi.login({ identifier: username.trim(), password });
        setToken(result.token);
        await refresh();
        const destination = safeFrom ?? (result.user.role === "admin" ? "/admin" : "/shop");

        toast.success("С возвращением");
        setFire(true);
        setTimeout(() => nav(destination, { replace: true }), 950);
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 403 && err.message === "Use admin login") {
          sessionStorage.setItem("zorushop.prefillAdminEmail", username.trim());
          toast.error("Только для администраторов. Перенаправление…");
          nav("/crzr-x9k2-panel", { replace: true });
          return;
        }
        setStatusBanner({ title: err.message, hint: `HTTP ${err.status}` });
        toast.error(err.message);
      } else {
        const msg = err instanceof Error ? err.message : "Ошибка входа";
        setStatusBanner({ title: msg });
        toast.error(msg);
      }
    } finally { setLoading(false); }
  };

  return (
    <>
      <Seo title="Вход и регистрация | Zoru Shop" description="Вход и регистрация покупателей в Zoru Shop — проверенный маркетплейс." path="/auth" />
      <button
        type="button"
        onClick={() => setLang(lang === "en" ? "ru" : "en")}
        title={lang === "en" ? "Переключить на русский" : "Change language to English"}
        className="fixed top-4 right-4 z-50 px-3 py-1.5 rounded-lg text-[11px] font-semibold tracking-[0.15em] text-white/80 bg-white/[0.06] border border-white/15 backdrop-blur-md hover:text-white hover:border-[#ffb300]/60 transition"
      >
        {lang === "en" ? "RU" : "EN"}
      </button>
      <ScorpionAuthShell
        fire={fire}
        tagline="Поддержка — только через тикеты на сайте. Мы не используем Telegram и Discord."
      >

        {/* Tabs */}
        <div className="relative flex mb-6 p-1 rounded-xl bg-white/[0.04] border border-white/10 backdrop-blur-sm">
          <span
            className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg transition-all duration-300 ease-out"
            style={{
              left: mode === "login" ? 4 : "calc(50%)",
              background: "linear-gradient(135deg, #ff2d2d 0%, #ff6b1a 50%, #ffb300 100%)",
              boxShadow: "0 4px 15px rgba(255,80,20,0.4)",
            }}
          />
          {(["login", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`relative z-10 flex-1 py-2 text-[12px] font-semibold tracking-[0.15em] uppercase rounded-lg transition-colors ${
                mode === m ? "text-white" : "text-white/60 hover:text-white/90"
              }`}
            >
              {m === "login" ? "Вход" : "Регистрация"}
            </button>
          ))}
        </div>

        {statusBanner && (
          <div className="mb-5 rounded-lg border border-red-400/40 bg-red-500/10 backdrop-blur-sm px-3 py-2.5 text-xs text-red-200" role="alert">
            <div className="font-semibold">{statusBanner.title}</div>
            {statusBanner.hint && <div className="opacity-80 mt-0.5">{statusBanner.hint}</div>}
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <div className="relative group">
            <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 group-focus-within:text-[#ffb300] transition-colors" />
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="Имя пользователя"
              className={inputCls}
            />
          </div>

          <div
            className="grid transition-all duration-300 ease-out"
            style={{ gridTemplateRows: mode === "signup" ? "1fr" : "0fr", opacity: mode === "signup" ? 1 : 0 }}
          >
            <div className="overflow-hidden">
              <div className="relative group">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 group-focus-within:text-[#ffb300] transition-colors" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email (необязательно)"
                  tabIndex={mode === "signup" ? 0 : -1}
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          <div className="relative group">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 group-focus-within:text-[#ffb300] transition-colors" />
            <input
              id="auth-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="Пароль"
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-[#ffb300] transition-colors"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="relative w-full py-3.5 mt-3 rounded-xl text-white text-sm font-bold tracking-[0.2em] uppercase transition-all disabled:opacity-60 flex items-center justify-center gap-2 overflow-hidden group shadow-[0_10px_30px_-5px_rgba(255,45,45,0.5)] hover:shadow-[0_15px_40px_-5px_rgba(255,80,20,0.7)] active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, #ff2d2d 0%, #ff6b1a 50%, #ffb300 100%)",
            }}
          >
            <span
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              style={{
                background: "linear-gradient(135deg, #ffb300 0%, #ff6b1a 50%, #ff2d2d 100%)",
              }}
            />
            <span className="relative flex items-center gap-2">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Выполняется вход…" : mode === "login" ? "Войти" : "Создать аккаунт"}
            </span>
          </button>
        </form>

        {/* Trust badges */}
        <div className="mt-6 grid grid-cols-3 gap-2 text-center">
          {[
            { icon: ShieldCheck, label: "Безопасно" },
            { icon: Zap, label: "Мгновенно" },
            { icon: BadgeCheck, label: "Проверено" },
          ].map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] py-2.5 backdrop-blur-sm"
            >
              <Icon className="h-4 w-4 text-[#ffb300]" />
              <span className="text-[10px] tracking-[0.12em] uppercase text-white/55">{label}</span>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-5 border-t border-white/10 text-center">
          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="text-[12px] text-white/60 hover:text-[#ffb300] transition tracking-wide"
          >
            {mode === "login" ? (
              <>Нет аккаунта? <span className="text-[#ffb300] font-semibold">Зарегистрироваться</span></>
            ) : (
              <>Уже есть аккаунт? <span className="text-[#ffb300] font-semibold">Войти</span></>
            )}
          </button>
        </div>
      </ScorpionAuthShell>
    </>
  );
};

export default Auth;
