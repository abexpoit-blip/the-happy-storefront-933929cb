import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import Seo from "@/components/Seo";
import { getMyReferralSummary, type ReferralSummary } from "@/lib/store";
import { Copy, Check, Users, Gift, Clock, Share2, Wallet, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

const Referrals = () => {
  const { profile } = useAuth();
  const [data, setData] = useState<ReferralSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setData(await getMyReferralSummary());
      } catch {
        toast.error("Не удалось загрузить реферальные данные");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const link = data?.code
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/auth?ref=${data.code}`
    : "";

  const copy = async (value: string, what: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      toast.success("Скопировано");
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Не удалось скопировать");
    }
  };

  const bonus = data?.bonus ?? 5;

  return (
    <AppShell>
      <Seo
        title="Реферальная программа | Zoru Shop"
        description="Приглашайте друзей в Zoru Shop и получайте бонус на баланс после их первого пополнения."
        path="/referrals"
      />

      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#101a33] via-[#132145] to-[#0a1122] p-6 sm:p-8 mb-5 shadow-[0_18px_50px_rgba(10,17,34,0.35)]">
        <div className="pointer-events-none absolute -top-20 -right-16 h-56 w-56 rounded-full bg-[#2196f3]/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-[#f9a825]/20 blur-3xl" />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-wider text-white/80">
            <Share2 className="h-3 w-3" /> Партнёрская программа
          </span>
          <h1 className="mt-3 text-2xl sm:text-3xl font-semibold text-white">
            Приглашай друзей — получай{" "}
            <span className="bg-gradient-to-r from-[#f9a825] to-[#ffd54f] bg-clip-text text-transparent">${bonus}</span>{" "}
            за каждого
          </h1>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-white/70">
            Отправьте свою ссылку. Как только приглашённый <b className="text-white">впервые пополнит баланс</b>,
            вы получаете <b className="text-white">${bonus}</b> и он тоже получает <b className="text-white">${bonus}</b> на
            бонусный баланс. Выплата — <b className="text-white">один раз</b> за каждого приглашённого, без лимита
            на количество друзей.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-[13px] text-[#888]">Загрузка…</div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3 mb-5">
            <div className="rounded-xl border border-[#e6e6e6] bg-gradient-to-br from-white to-[#f3f7ff] p-4 shadow-[0_4px_16px_rgba(20,30,60,0.06)]">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-[#888]">
                <Users className="h-3.5 w-3.5 text-[#2196f3]" /> Приглашено (оплатили)
              </div>
              <div className="text-3xl font-semibold text-[#1f2d3d] mt-1">{data?.paidCount ?? 0}</div>
            </div>
            <div className="rounded-xl border border-[#c8e6c9] bg-gradient-to-br from-white to-[#eaf7ec] p-4 shadow-[0_4px_16px_rgba(46,125,50,0.10)]">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-[#888]">
                <Gift className="h-3.5 w-3.5 text-[#2fb344]" /> Заработано
              </div>
              <div className="text-3xl font-semibold text-[#2fb344] mt-1">${data?.earned.toFixed(2) ?? "0.00"}</div>
            </div>
            <div className="rounded-xl border border-[#ffe0b2] bg-gradient-to-br from-white to-[#fff6e5] p-4 shadow-[0_4px_16px_rgba(249,168,37,0.12)]">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-[#888]">
                <Clock className="h-3.5 w-3.5 text-[#f9a825]" /> Ждут пополнения
              </div>
              <div className="text-3xl font-semibold text-[#1f2d3d] mt-1">{data?.pendingCount ?? 0}</div>
            </div>
          </div>

          <div className="rounded-xl border border-[#e6e6e6] bg-white p-4 space-y-4 max-w-2xl shadow-[0_4px_16px_rgba(20,30,60,0.05)]">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[#888] mb-1.5">Ваш код</div>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={data?.code ?? ""}
                  className="flex-1 border border-[#e6e6e6] px-3 py-2 text-sm font-mono text-[#1f2d3d] bg-[#fafafa]"
                />
                <button
                  onClick={() => copy(data?.code ?? "", "code")}
                  className="px-3 py-2 rounded-md border border-[#dbe6ff] bg-gradient-to-r from-[#f4f8ff] to-[#e9f1ff] text-sm text-[#1f2d3d] hover:brightness-105 transition inline-flex items-center gap-1.5"
                >
                  {copied === "code" ? <Check className="h-3.5 w-3.5 text-[#2fb344]" /> : <Copy className="h-3.5 w-3.5" />}
                  Копировать
                </button>
              </div>
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-wide text-[#888] mb-1.5">Ссылка для приглашения</div>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={link}
                  className="flex-1 border border-[#e6e6e6] px-3 py-2 text-sm text-[#1f2d3d] bg-[#fafafa]"
                />
                <button
                  onClick={() => copy(link, "link")}
                  className="px-3 py-2 rounded-md border border-[#dbe6ff] bg-gradient-to-r from-[#f4f8ff] to-[#e9f1ff] text-sm text-[#1f2d3d] hover:brightness-105 transition inline-flex items-center gap-1.5"
                >
                  {copied === "link" ? <Check className="h-3.5 w-3.5 text-[#2fb344]" /> : <Copy className="h-3.5 w-3.5" />}
                  Копировать
                </button>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 max-w-4xl">
            <div className="rounded-xl border border-[#e6e6e6] bg-gradient-to-br from-white to-[#f7f9ff] p-4 shadow-[0_4px_16px_rgba(20,30,60,0.05)]">
              <div className="text-[13px] font-semibold text-[#1f2d3d] mb-2 inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-[#2196f3]" /> Как это работает</div>
              <ol className="list-decimal pl-4 space-y-1.5 text-[12.5px] text-[#555]">
                <li>Скопируйте свою ссылку или код выше.</li>
                <li>Друг регистрируется по ссылке (код подставляется автоматически).</li>
                <li>Друг делает <b>первое пополнение</b> — платёж должен быть подтверждён.</li>
                <li>Вы и друг сразу получаете по <b>${bonus}</b> на <b>бонусный баланс</b>.</li>
                <li>Бонус выплачивается <b>один раз</b> за каждого приглашённого.</li>
              </ol>
            </div>
            <div className="rounded-xl border border-[#ffe0b2] bg-gradient-to-br from-white to-[#fff8ec] p-4 shadow-[0_4px_16px_rgba(249,168,37,0.10)]">
              <div className="text-[13px] font-semibold text-[#1f2d3d] mb-2 inline-flex items-center gap-1.5"><Wallet className="h-4 w-4 text-[#f9a825]" /> Бонусный баланс</div>
              <div className="text-2xl font-semibold text-[#f9a825]">
                ${Number(profile?.bonus_balance ?? 0).toFixed(2)}
              </div>
              <ul className="list-disc pl-4 mt-2 space-y-1.5 text-[12.5px] text-[#555]">
                <li>Бонусные деньги отображаются отдельно от основного баланса.</li>
                <li>Ими <b>можно покупать карты</b> — при покупке бонус списывается первым.</li>
                <li>Вывод бонусов недоступен, только покупки.</li>
                <li>Проверка refund-карты стоит <b>$0.03</b> за карту (сверх цены карты).</li>
              </ul>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
};

export default Referrals;
