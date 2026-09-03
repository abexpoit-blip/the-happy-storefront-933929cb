import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { createCryptoInvoice, checkDepositStatus } from "@/lib/plisio.functions";
import { useAuth } from "@/hooks/useAuth";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import {
  CheckCircle2, Copy, Clock, XCircle, Loader2,
  AlertCircle, ArrowDownLeft, ArrowUpRight, TimerReset, Receipt, ShieldCheck, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { PageHero, StatCard } from "@/components/PageHero";

interface Deposit { id: string; amount: number; method: string; txid: string | null; status: string; created_at: string; crypto_currency?: string; plisio_wallet?: string; confirmations?: number; }
interface Transaction { id: string; type: string; amount: number; note?: string; method?: string; ref_id?: string; meta?: string; created_at: string; }

const INVOICE_TTL_SEC = 30 * 60;
const STORAGE_KEY = "zoru.activeInvoice";

const formatCountdown = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const Recharge = () => {
  const { profile } = useAuth();
  const settings = useSiteSettings();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isActivation = searchParams.get("activate") === "1";
  const urlAmount = searchParams.get("amount");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Deposit[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [activeInvoice, setActiveInvoiceRaw] = useState<{
    deposit_id: string; wallet_address: string; crypto_amount: string;
    currency: string; qr_data: string; status: string;
    confirmations: number; usd_amount: number; expires_ms: number;
    fee_amount?: number; charged_amount?: number;
  } | null>(() => {

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      if (!parsed?.expires_ms || Date.now() > parsed.expires_ms) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return parsed;
    } catch { return null; }
  });

  const setActiveInvoice = useCallback((val: typeof activeInvoice | ((prev: typeof activeInvoice) => typeof activeInvoice)) => {
    setActiveInvoiceRaw((prev) => {
      const next = typeof val === "function" ? (val as (p: typeof activeInvoice) => typeof activeInvoice)(prev) : val;
      if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else localStorage.removeItem(STORAGE_KEY);
      return next;
    });
  }, []);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [countdown, setCountdown] = useState<number>(-1);

  const loadHistory = async () => {
    try {
      const { data } = await supabase.from("deposits").select("*").order("created_at", { ascending: false }).limit(20);
      setHistory((data ?? []) as unknown as Deposit[]);
    } catch { /* ignore */ }
  };
  const loadTransactions = async () => {
    try {
      const { data } = await supabase.from("balance_transactions").select("*").order("created_at", { ascending: false }).limit(20);
      setTransactions(((data ?? []) as Array<{ id: string; kind: string; amount: number; description: string | null; created_at: string }>)
        .map((t) => ({ id: t.id, type: t.kind, amount: Number(t.amount), note: t.description ?? undefined, created_at: t.created_at })));
    } catch { /* ignore */ }
  };

  const startPolling = useCallback((depositId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const s = await checkDepositStatus({ data: { deposit_id: depositId } });
        setActiveInvoice(prev => prev ? { ...prev, status: s.status, confirmations: s.confirmations ?? 0 } : prev);
        if (s.status === "approved") {
          toast.success(`$${s.amount} зачислено на баланс!`);
          setActiveInvoice(null);
          if (pollRef.current) clearInterval(pollRef.current);
          loadHistory(); loadTransactions();
          if (isActivation) setTimeout(() => navigate("/shop"), 1200);
        } else if (s.status === "rejected") {
          toast.error("Заявка отменена или истекла.");
          setActiveInvoice(null);
          if (pollRef.current) clearInterval(pollRef.current);
          loadHistory();
        }
      } catch { /* continue polling */ }
    }, 10_000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadHistory(); loadTransactions();
    const returned = searchParams.get("payment");
    if (activeInvoice?.deposit_id && activeInvoice.status === "pending") {
      // instant check when the user comes back from the payment page
      if (returned) {
        checkDepositStatus({ data: { deposit_id: activeInvoice.deposit_id } })
          .then((s) => {
            if (s.status === "approved") {
              toast.success(`$${s.amount} зачислено на баланс!`);
              setActiveInvoice(null);
              loadHistory(); loadTransactions();
            } else if (s.status === "rejected") {
              toast.error("Платёж не завершён или истёк.");
              setActiveInvoice(null);
              loadHistory();
            }
          })
          .catch(() => { /* ignore */ });
      }
      startPolling(activeInvoice.deposit_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
    if (amount) return;
    if (urlAmount && Number(urlAmount) > 0) setAmount(String(Number(urlAmount)));
    else if (isActivation) {
      const min = Number(settings.min_deposit ?? 20);
      if (min > 0) setAmount(String(min));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.min_deposit, urlAmount, isActivation]);

  // 30-minute countdown
  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (!activeInvoice?.expires_ms) { setCountdown(-1); return; }
    const calc = () => Math.max(0, Math.floor((activeInvoice.expires_ms - Date.now()) / 1000));
    setCountdown(calc());
    countdownRef.current = setInterval(() => {
      const remaining = calc();
      setCountdown(remaining);
      if (remaining <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [activeInvoice?.expires_ms]);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  const isExpired = !!activeInvoice && countdown === 0;
  const MIN_DEPOSIT = Math.max(20, settings.min_deposit || 20);
  const amtNum = Number(amount) || 0;

  const createInvoice = async () => {
    if (!amtNum || amtNum < MIN_DEPOSIT) return toast.error(`Минимальная сумма пополнения — $${MIN_DEPOSIT}.`);
    setBusy(true);
    try {
      const inv = await createCryptoInvoice({ data: { amount: amtNum } });
      setActiveInvoice({
        deposit_id: inv.deposit_id,
        wallet_address: inv.wallet_address || "",
        crypto_amount: inv.crypto_amount,
        currency: "LTC",
        qr_data: inv.wallet_address || "",
        status: "pending",
        confirmations: 0,
        usd_amount: inv.usd_amount ?? amtNum,
        fee_amount: inv.fee_amount,
        charged_amount: inv.charged_amount,
        expires_ms: inv.expires_ms || Date.now() + INVOICE_TTL_SEC * 1000,

      });
      startPolling(inv.deposit_id);
      toast.success("Заявка создана — отправьте LTC на адрес ниже.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Не удалось создать заявку");
    } finally { setBusy(false); }
  };

  const copyField = async (txt: string, field: string) => {
    if (isExpired) return;
    try {
      await navigator.clipboard.writeText(txt);
      setCopiedField(field);
      toast.success("Скопировано");
      setTimeout(() => setCopiedField(null), 2000);
    } catch { toast.error("Не удалось скопировать — скопируйте вручную"); }
  };

  const qrValue = activeInvoice
    ? (activeInvoice.crypto_amount
      ? `litecoin:${activeInvoice.qr_data || activeInvoice.wallet_address}?amount=${activeInvoice.crypto_amount}`
      : (activeInvoice.qr_data || activeInvoice.wallet_address))
    : "";

  const txnIcon = (type: string) => {
    if (type === "deposit") return <ArrowDownLeft className="h-4 w-4 text-[#2fb344]" />;
    if (type === "purchase") return <ArrowUpRight className="h-4 w-4 text-[#c0392b]" />;
    if (type === "refund") return <ArrowDownLeft className="h-4 w-4 text-[#2196f3]" />;
    return <Receipt className="h-4 w-4 text-[#888]" />;
  };

  const cancelInvoice = () => {
    setActiveInvoice(null);
    setCountdown(-1);
    if (pollRef.current) clearInterval(pollRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  };

  const progress = activeInvoice ? Math.max(0, Math.min(100, (countdown / INVOICE_TTL_SEC) * 100)) : 0;

  return (
    <AppShell>
      <div className="space-y-4 max-w-6xl">
        <PageHero
          eyebrow="Пополнение баланса"
          eyebrowIcon={Wallet}
          title="Пополняй счёт в"
          highlight="Litecoin (LTC)"
          description={
            <>
              Создайте счёт, оплатите на указанный адрес — баланс зачисляется автоматически после
              подтверждения сети. Средства сразу доступны для покупки карт.
            </>
          }
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Основной баланс" icon={Wallet} tone="green" value={`$${Number(profile?.balance ?? 0).toFixed(2)}`} />
          <StatCard label="Бонусный баланс" icon={ShieldCheck} tone="amber" value={`$${Number(profile?.bonus_balance ?? 0).toFixed(2)}`} hint="Списывается первым при покупке" />
          <StatCard label="Всего пополнений" icon={Receipt} tone="blue" value={history.filter((h) => h.status === "approved").length} />
        </div>

        {isActivation && (
          <div className="bg-white border border-[#e6e6e6] px-4 py-3 flex items-start gap-3 text-[13px]">
            <div className="shrink-0 h-8 w-8 bg-[#2196f3] text-white flex items-center justify-center text-sm font-bold">$</div>
            <div>
              <div className="text-[12px] font-semibold text-[#2196f3] uppercase tracking-wider">Активация аккаунта</div>
              <div className="text-[#333] mt-0.5">
                Пополните счёт на ${Number(settings.min_deposit ?? MIN_DEPOSIT).toFixed(2)}, чтобы открыть магазин.
              </div>
            </div>
          </div>
        )}

        {activeInvoice ? (
          // ---- ACTIVE INVOICE ----
          <section className="bg-white border border-[#e6e6e6]">
            <div className="px-4 h-11 flex items-center justify-between border-b border-[#eee]">
              <span className="text-[13px] text-[#555] uppercase tracking-wider">Оплата · Litecoin (LTC)</span>
              <span className="text-[11px] font-mono text-[#888]">#{activeInvoice.deposit_id.slice(0, 8).toUpperCase()}</span>
            </div>

            {/* countdown bar */}
            <div className="px-4 pt-4">
              <div className={`flex items-center justify-between h-11 px-4 border text-[13px] ${
                isExpired ? "bg-[#fdecea] border-[#f5c6cb] text-[#c0392b]"
                  : countdown <= 300 ? "bg-[#fff8e1] border-[#ffe0a0] text-[#b26a00]"
                  : "bg-[#e8f4ff] border-[#bcdcfa] text-[#1976d2]"
              }`}>
                <span className="inline-flex items-center gap-2">
                  <TimerReset className="h-4 w-4" />
                  {isExpired ? "Время истекло" : "Оплатите в течение"}
                </span>
                <span className="font-mono text-[18px] font-semibold tracking-widest">
                  {isExpired ? "00:00" : formatCountdown(countdown)}
                </span>
              </div>
              <div className="h-1 bg-[#f0f0f0] mt-[-1px]">
                <div
                  className={`h-1 transition-all duration-1000 ${isExpired ? "bg-[#c0392b]" : countdown <= 300 ? "bg-[#b26a00]" : "bg-[#2196f3]"}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* QR */}
              <div className="space-y-3">
                <div className="text-center border border-[#e6e6e6] bg-[#fafafa] p-3">
                  <p className="text-[11px] uppercase tracking-wider text-[#888]">Сумма пополнения</p>
                  <p className="text-[24px] font-semibold text-[#2196f3] font-mono">${activeInvoice.usd_amount.toFixed(2)}</p>
                  {activeInvoice.charged_amount ? (
                    <p className="text-[11px] text-[#888] font-mono">
                      к оплате ${activeInvoice.charged_amount.toFixed(2)} (комиссия 2%)
                    </p>
                  ) : null}

                </div>
                <div className={`flex justify-center ${isExpired ? "opacity-25 pointer-events-none" : ""}`}>
                  <div className="p-3 bg-white border border-[#e6e6e6]">
                    <QRCodeSVG value={qrValue} size={190} level="M" includeMargin={false} />
                  </div>
                </div>
                <p className="text-[11px] text-center text-[#888]">
                  {isExpired ? "QR-код больше не действителен" : "Отсканируйте QR в вашем LTC-кошельке"}
                </p>
              </div>

              {/* Details */}
              <div className="space-y-3">
                <div className={`border border-[#e6e6e6] bg-[#fafafa] p-3 ${isExpired ? "opacity-40" : ""}`}>
                  <p className="text-[10px] uppercase tracking-wider text-[#888]">Отправьте точно</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-[16px] font-semibold text-[#1f2d3d] flex-1 break-all">
                      {activeInvoice.crypto_amount} LTC
                    </span>
                    <button onClick={() => copyField(activeInvoice.crypto_amount, "amount")} disabled={isExpired}
                      className="shrink-0 h-8 w-8 border border-[#dcdcdc] bg-white hover:bg-[#f5faff] text-[#2196f3] flex items-center justify-center disabled:opacity-30">
                      {copiedField === "amount" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                <div className={`border border-[#e6e6e6] bg-[#fafafa] p-3 ${isExpired ? "opacity-40" : ""}`}>
                  <p className="text-[10px] uppercase tracking-wider text-[#888]">LTC-адрес для оплаты</p>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-[12px] text-[#333] break-all flex-1 font-mono leading-relaxed">
                      {activeInvoice.wallet_address}
                    </code>
                    <button onClick={() => copyField(activeInvoice.wallet_address, "address")} disabled={isExpired}
                      className="shrink-0 h-8 w-8 border border-[#dcdcdc] bg-white hover:bg-[#f5faff] text-[#2196f3] flex items-center justify-center disabled:opacity-30">
                      {copiedField === "address" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-start gap-2 p-3 border border-[#ffe0a0] bg-[#fff8e1] text-[12px] text-[#b26a00]">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>Отправляйте <strong>только LTC</strong> на этот адрес. Другие монеты будут утеряны безвозвратно.</p>
                </div>

                {!isExpired ? (
                  <div className="border border-[#e6e6e6] bg-white p-3 space-y-2 text-[12px]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[#333]">
                        <Loader2 className="h-4 w-4 animate-spin text-[#2196f3]" />
                        <span className="uppercase tracking-wider">Ожидание оплаты</span>
                      </div>
                      <span className="text-[11px] font-mono text-[#2196f3]">
                        {activeInvoice.confirmations ?? 0}/2 подтверждений
                      </span>
                    </div>
                    <p className="text-[11px] text-center text-[#888] pt-1">
                      Статус проверяется автоматически каждые 10 секунд — не закрывайте вкладку.
                    </p>
                  </div>
                ) : (
                  <div className="border border-[#f5c6cb] bg-[#fdecea] p-3 text-[12px] text-[#c0392b]">
                    Заявка истекла — оплата по этому адресу больше не засчитывается. Создайте новую заявку.
                  </div>
                )}

                <button onClick={cancelInvoice}
                  className={`w-full h-10 text-[13px] transition ${
                    isExpired ? "bg-[#2196f3] hover:bg-[#1e88e5] text-white"
                      : "border border-[#dcdcdc] text-[#555] hover:bg-[#f7f7f7]"
                  }`}>
                  {isExpired ? "Создать новую заявку" : "Отменить"}
                </button>
              </div>
            </div>
          </section>
        ) : (
          // ---- FORM ----
          <section className="bg-white border border-[#e6e6e6]">
            <div className="px-4 h-11 flex items-center border-b border-[#eee] text-[13px] text-[#555] uppercase tracking-wider">
              Пополнение баланса
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="border border-[#e6e6e6] bg-[#fafafa] p-4">
                  <div className="flex items-center gap-2 text-[13px] text-[#1f2d3d] font-semibold">
                    <Wallet className="h-4 w-4 text-[#2196f3]" /> Приём только в Litecoin (LTC)
                  </div>
                  <p className="text-[12px] text-[#666] mt-1.5 leading-[1.7]">
                    Быстрые подтверждения и минимальная комиссия сети. Другие монеты не принимаются.
                  </p>
                </div>

                <ul className="text-[13px] text-[#333] leading-[1.9] list-disc pl-5">
                  <li>Минимальная сумма пополнения — <strong>${MIN_DEPOSIT}</strong>.</li>
                  <li>Адрес и сумма действительны <strong>30 минут</strong>, затем заявка истекает.</li>
                  <li>Отправляйте точную сумму — иначе средства могут не зачислиться.</li>
                  <li>Баланс пополняется автоматически после 2 подтверждений сети.</li>
                </ul>

                <div className="flex items-start gap-2 p-3 border border-[#d7ecd9] bg-[#f2faf3] text-[12px] text-[#2e7d32]">
                  <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>Каждая заявка получает уникальный адрес. Никогда не переиспользуйте старые адреса.</p>
                </div>
              </div>

              <div className="md:border-l md:border-[#e6e6e6] md:pl-8">
                <label className="text-[12px] uppercase tracking-wider text-[#888]">Сумма в USD</label>
                <div className="flex items-center gap-2 mt-2">
                  <span className="h-11 w-11 border border-[#dcdcdc] bg-[#fafafa] flex items-center justify-center text-[#888] font-mono">$</span>
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    type="number"
                    min={MIN_DEPOSIT}
                    placeholder={`Минимум ${MIN_DEPOSIT}`}
                    className="flex-1 h-11 px-3 border border-[#dcdcdc] text-[14px] font-mono outline-none focus:border-[#2196f3]"
                  />
                </div>

                <div className="flex flex-wrap gap-2 mt-3">
                  {[50, 100, 250, 500, 1000].map((v) => (
                    <button key={v} onClick={() => setAmount(String(v))}
                      className={`px-3 h-8 text-[12px] border transition ${
                        amount === String(v) ? "border-[#2196f3] text-[#2196f3] bg-[#f0f8ff]" : "border-[#dcdcdc] text-[#555] hover:bg-[#f7f7f7]"
                      }`}>
                      ${v}
                    </button>
                  ))}
                </div>

                <div className="text-[12px] text-[#666] mt-4 pt-4 border-t border-[#eee] space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span>Комиссия сети (2%)</span>
                    <span className="font-mono text-[#1f2d3d]">${(amtNum * 0.02).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>К оплате</span>
                    <span className="font-mono font-semibold text-[#2196f3]">${(amtNum * 1.02).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Текущий баланс</span>
                    <span className="font-mono font-semibold text-[#1f2d3d]">${Number(profile?.balance ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Бонусный баланс (рефералы)</span>
                    <span className="font-mono font-semibold text-[#f9a825]">${Number(profile?.bonus_balance ?? 0).toFixed(2)}</span>
                  </div>
                </div>


                <button
                  onClick={createInvoice}
                  disabled={busy || amtNum < MIN_DEPOSIT}
                  className="w-full h-11 mt-4 bg-[#2196f3] hover:bg-[#1e88e5] disabled:opacity-50 text-white text-[13px] uppercase tracking-wider inline-flex items-center justify-center gap-2"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                  Пополнить через LTC
                </button>
                <p className="text-[11px] text-[#888] mt-2 text-center">
                  После нажатия появится QR-код и адрес. Таймер — 30 минут.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Transactions */}
        {transactions.length > 0 && (
          <section className="bg-white border border-[#e6e6e6]">
            <div className="px-4 h-10 flex items-center border-b border-[#eee] text-[13px] text-[#555] uppercase tracking-wider">
              <Receipt className="h-4 w-4 mr-2 text-[#2196f3]" /> История операций
            </div>
            <div className="p-3">
              <div className="divide-y divide-[#eee]">
                {transactions.slice(0, 20).map((t) => (
                  <div key={t.id} className="flex items-center justify-between px-2 py-2 text-[13px]">
                    <div className="flex items-center gap-3">
                      {txnIcon(t.type)}
                      <div>
                        <p className="capitalize text-[#333]">{t.type}</p>
                        <p className="text-[11px] text-[#888]">
                          {new Date(t.created_at).toLocaleDateString()} {new Date(t.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                    <span className={`font-mono font-semibold ${Number(t.amount) >= 0 ? "text-[#2fb344]" : "text-[#c0392b]"}`}>
                      {Number(t.amount) >= 0 ? "+" : ""}${Math.abs(Number(t.amount)).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Deposits */}
        {history.length > 0 && (
          <section className="bg-white border border-[#e6e6e6]">
            <div className="px-4 h-10 flex items-center border-b border-[#eee] text-[13px] text-[#555] uppercase tracking-wider">
              Последние пополнения
            </div>
            <div className="p-3">
              <div className="divide-y divide-[#eee]">
                {history.map((d) => {
                  const expired = d.status === "pending" && (Date.now() - new Date(d.created_at).getTime() > INVOICE_TTL_SEC * 1000);
                  const st = expired ? "expired" : d.status;
                  return (
                    <div key={d.id} className="flex items-center justify-between px-2 py-2 text-[13px]">
                      <div>
                        <p className="text-[#333]">
                          <span className="font-mono font-semibold">${Number(d.amount).toFixed(2)}</span>
                          <span className="text-[11px] text-[#888] ml-2">· LTC</span>
                        </p>
                        {d.txid && <p className="text-[10px] font-mono text-[#888] truncate max-w-[260px] sm:max-w-md">{d.txid}</p>}
                        <p className="text-[11px] text-[#888] mt-0.5">
                          {new Date(d.created_at).toLocaleDateString()} {new Date(d.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <span className={`text-[11px] px-2 py-0.5 border inline-flex items-center gap-1 ${
                        st === "approved" ? "bg-[#e8f5e9] border-[#c8e6c9] text-[#2e7d32]" :
                        st === "rejected" || st === "expired" ? "bg-[#fdecea] border-[#f5c6cb] text-[#c0392b]" :
                        "bg-[#fff8e1] border-[#ffe0a0] text-[#b26a00]"
                      }`}>
                        {st === "approved" ? <CheckCircle2 className="h-3 w-3" /> :
                         st === "rejected" || st === "expired" ? <XCircle className="h-3 w-3" /> :
                         <Clock className="h-3 w-3" />}
                        {st}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
};

export default Recharge;
