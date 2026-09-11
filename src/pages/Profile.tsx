import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import Seo from "@/components/Seo";
import { PageHero, StatCard } from "@/components/PageHero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/lib/i18n";
import { toast } from "sonner";
import { CreditCard, Lock, ShoppingBag, User, Wallet } from "lucide-react";

interface Stats {
  deposited: number;
  deposits_count: number;
  cards_bought: number;
  orders_count: number;
  spent: number;
}

const Profile = () => {
  const { profile, user } = useAuth();
  const { lang } = useLanguage();
  const en = lang === "en";

  const [stats, setStats] = useState<Stats | null>(null);
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("my_profile_stats");
    if (error) return;
    const row = Array.isArray(data) ? data[0] : data;
    if (row) {
      setStats({
        deposited: Number(row.deposited ?? 0),
        deposits_count: Number(row.deposits_count ?? 0),
        cards_bought: Number(row.cards_bought ?? 0),
        orders_count: Number(row.orders_count ?? 0),
        spent: Number(row.spent ?? 0),
      });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const changePassword = async () => {
    if (pwd.length < 8) return toast.error(en ? "Password must be at least 8 characters" : "Пароль минимум 8 символов");
    if (pwd !== confirm) return toast.error(en ? "Passwords don't match" : "Пароли не совпадают");
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw error;
      setPwd(""); setConfirm("");
      toast.success(en ? "Password updated" : "Пароль обновлён");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
    setBusy(false);
  };

  const uname = profile?.username ?? "user";
  const avatarUrl =
    profile?.avatar_url ||
    `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(uname)}&backgroundType=gradientLinear&radius=50`;

  return (
    <AppShell>
      <Seo title="Profile | Zoru Shop" description="Your account, deposits, purchases and password." path="/profile" />
      <PageHero
        eyebrow={en ? "Account" : "Аккаунт"}
        eyebrowIcon={User}
        title={en ? "My" : "Мой"}
        highlight={en ? "Profile" : "Профиль"}
        description={en ? "Your activity summary and account security." : "Сводка активности и безопасность аккаунта."}
      />

      <div className="rounded-2xl border border-[#e6e6e6] bg-white p-5 flex items-center gap-4 mb-5">
        <span className="h-16 w-16 rounded-full p-[3px] bg-[conic-gradient(from_180deg,#42a5f5,#7e57c2,#f9a825,#42a5f5)] shadow-[0_10px_24px_-14px_rgba(31,45,61,0.9)]">
          <img src={avatarUrl} alt={uname} className="h-full w-full rounded-full bg-white object-cover" />
        </span>
        <div className="min-w-0">
          <div className="text-lg font-semibold text-[#1f2d3d] truncate">{uname}</div>
          <div className="text-[13px] text-[#777] truncate">{user?.email}</div>
          <div className="text-[11px] uppercase tracking-wide text-[#8a97a5]">
            {profile?.role === "admin" ? "ADMIN" : "PREMIUM"}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-5">
        <StatCard
          label={en ? "Total deposited" : "Всего пополнено"}
          value={`$${(stats?.deposited ?? 0).toFixed(2)}`}
          icon={Wallet} tone="green"
          hint={`${stats?.deposits_count ?? 0} ${en ? "deposits" : "пополнений"}`}
        />
        <StatCard
          label={en ? "Cards bought" : "Куплено карт"}
          value={String(stats?.cards_bought ?? 0)}
          icon={CreditCard}
          hint={`${stats?.orders_count ?? 0} ${en ? "orders" : "заказов"}`}
        />
        <StatCard
          label={en ? "Total spent" : "Всего потрачено"}
          value={`$${(stats?.spent ?? 0).toFixed(2)}`}
          icon={ShoppingBag} tone="amber"
        />
        <StatCard
          label={en ? "Balance" : "Баланс"}
          value={`$${Number(profile?.balance ?? 0).toFixed(2)}`}
          icon={Wallet}
          hint={`${en ? "Bonus" : "Бонус"}: $${Number(profile?.bonus_balance ?? 0).toFixed(2)}`}
        />
      </div>

      <div className="rounded-2xl border border-[#e6e6e6] bg-white p-5 space-y-3 max-w-lg">
        <div className="flex items-center gap-2 font-semibold"><Lock className="h-4 w-4" /> {en ? "Change password" : "Смена пароля"}</div>
        <Input
          type="password" value={pwd} onChange={(e) => setPwd(e.target.value)}
          placeholder={en ? "New password (min 8 characters)" : "Новый пароль (мин. 8 символов)"}
        />
        <Input
          type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
          placeholder={en ? "Repeat new password" : "Повторите пароль"}
        />
        <Button onClick={changePassword} disabled={busy}>
          {busy ? (en ? "Saving…" : "Сохранение…") : (en ? "Update password" : "Обновить пароль")}
        </Button>
      </div>
    </AppShell>
  );
};

export default Profile;
