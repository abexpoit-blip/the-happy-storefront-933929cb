import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import Seo from "@/components/Seo";
import { getMyReferralSummary, type ReferralSummary } from "@/lib/store";
import { Copy, Check, Users, Gift, Clock } from "lucide-react";
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

      <h1 className="text-lg font-semibold text-[#1f2d3d] mb-1">Реферальная программа</h1>
      <p className="text-[13px] text-[#666] mb-5">
        Пригласите друга по своей ссылке. Когда он <b>впервые пополнит баланс</b>, вы получите{" "}
        <b>${bonus}</b>, и он тоже получит <b>${bonus}</b>. Бонус выплачивается один раз за каждого
        приглашённого.
      </p>

      {loading ? (
        <div className="text-[13px] text-[#888]">Загрузка…</div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3 mb-5">
            <div className="bg-white border border-[#e6e6e6] p-4">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-[#888]">
                <Users className="h-3.5 w-3.5" /> Приглашено (оплатили)
              </div>
              <div className="text-2xl font-semibold text-[#1f2d3d] mt-1">{data?.paidCount ?? 0}</div>
            </div>
            <div className="bg-white border border-[#e6e6e6] p-4">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-[#888]">
                <Gift className="h-3.5 w-3.5" /> Заработано
              </div>
              <div className="text-2xl font-semibold text-[#2fb344] mt-1">${data?.earned.toFixed(2) ?? "0.00"}</div>
            </div>
            <div className="bg-white border border-[#e6e6e6] p-4">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-[#888]">
                <Clock className="h-3.5 w-3.5" /> Ждут пополнения
              </div>
              <div className="text-2xl font-semibold text-[#1f2d3d] mt-1">{data?.pendingCount ?? 0}</div>
            </div>
          </div>

          <div className="bg-white border border-[#e6e6e6] p-4 space-y-4 max-w-2xl">
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
                  className="px-3 py-2 border border-[#e6e6e6] text-sm text-[#1f2d3d] hover:bg-[#f7f7f7] transition inline-flex items-center gap-1.5"
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
                  className="px-3 py-2 border border-[#e6e6e6] text-sm text-[#1f2d3d] hover:bg-[#f7f7f7] transition inline-flex items-center gap-1.5"
                >
                  {copied === "link" ? <Check className="h-3.5 w-3.5 text-[#2fb344]" /> : <Copy className="h-3.5 w-3.5" />}
                  Копировать
                </button>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 max-w-4xl">
            <div className="bg-white border border-[#e6e6e6] p-4">
              <div className="text-[13px] font-semibold text-[#1f2d3d] mb-2">Как это работает</div>
              <ol className="list-decimal pl-4 space-y-1.5 text-[12.5px] text-[#555]">
                <li>Скопируйте свою ссылку или код выше.</li>
                <li>Друг регистрируется по ссылке (код подставляется автоматически).</li>
                <li>Друг делает <b>первое пополнение</b> — платёж должен быть подтверждён.</li>
                <li>Вы и друг сразу получаете по <b>${bonus}</b> на <b>бонусный баланс</b>.</li>
                <li>Бонус выплачивается <b>один раз</b> за каждого приглашённого.</li>
              </ol>
            </div>
            <div className="bg-white border border-[#e6e6e6] p-4">
              <div className="text-[13px] font-semibold text-[#1f2d3d] mb-2">Бонусный баланс</div>
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
