import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import Seo from "@/components/Seo";
import { PageHero, StatCard } from "@/components/PageHero";
import { toast } from "sonner";
import { Loader2, Radar, ShieldCheck, ShieldOff, Wallet, CreditCard, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { selfCheckConfig, startSelfCheck, pollSelfCheck, type SelfCheckRow } from "@/lib/selfcheck.functions";
import { useAuth } from "@/hooks/useAuth";

const SCAN_STEPS = [
  "Opening secure checker session…",
  "Connecting to gateway node…",
  "Submitting cards…",
  "Reading live / dead response…",
  "Finalizing results…",
];

const Checker = () => {
  const { profile, refresh } = useAuth();
  const getConfig = useServerFn(selfCheckConfig);
  const start = useServerFn(startSelfCheck);
  const poll = useServerFn(pollSelfCheck);

  const [price, setPrice] = useState(0.2);
  const [gate, setGate] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [rows, setRows] = useState<SelfCheckRow[]>([]);

  useEffect(() => {
    void getConfig({}).then((c) => { setPrice(c.price); setGate(c.gate); }).catch(() => undefined);
  }, [getConfig]);

  useEffect(() => {
    if (!busy) { setStep(0); return; }
    const t = setInterval(() => setStep((s) => Math.min(s + 1, SCAN_STEPS.length - 1)), 1400);
    return () => clearInterval(t);
  }, [busy]);

  const lines = useMemo(
    () => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
    [text],
  );
  const cost = Math.round(lines.length * price * 100) / 100;
  const spendable = Number(profile?.balance ?? 0) + Number(profile?.bonus_balance ?? 0);

  const run = async () => {
    if (!lines.length) return toast.error("Paste at least one card (PAN|MM|YYYY|CVV)");
    if (lines.length > 500) return toast.error("Maximum 500 cards per run");
    if (spendable < cost) return toast.error("Insufficient balance. Please top up.");
    setBusy(true);
    setRows([]);
    try {
      const task = await start({ data: { cards: lines } });
      toast.success(`Charged $${task.cost.toFixed(2)} — checking ${task.total} card(s)`);
      void refresh?.();
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, i === 0 ? 5000 : 7000));
        const st = await poll({ data: { taskId: task.taskId } });
        if (st.rows.length) setRows(st.rows);
        if (st.done) break;
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      toast.error(
        m.includes("insufficient_balance") ? "Insufficient balance."
        : m.includes("no_valid_cards") ? "No valid cards found. Use PAN|MM|YYYY|CVV per line."
        : m.includes("checker_not_configured") ? "Checker gateway is not configured yet."
        : m,
        { duration: 8000 },
      );
    } finally {
      setBusy(false);
    }
  };

  const live = rows.filter((r) => r.status === "live").length;
  const dead = rows.filter((r) => r.status === "dead").length;

  return (
    <AppShell>
      <Seo
        title="Card Checker | Zoru Shop"
        description="Check your own cards live/dead with your balance."
        path="/checker"
      />

      <PageHero
        eyebrow="Checker"
        eyebrowIcon={Radar}
        title="Live / dead"
        highlight="card checker"
        description={`Paste your own cards and check them through our gateway. $${price.toFixed(2)} is charged per card from your balance (bonus balance is used first).`}
      />

      <div className="grid gap-3 sm:grid-cols-3 mb-4">
        <StatCard label="Cards to check" icon={CreditCard} tone="blue" value={lines.length} hint={gate ? `gate: ${gate}` : "—"} />
        <StatCard label="Total cost" icon={Sparkles} tone="green" value={`$${cost.toFixed(2)}`} hint={`$${price.toFixed(2)} per card`} />
        <StatCard label="Available balance" icon={Wallet} tone="amber" value={`$${spendable.toFixed(2)}`} hint="bonus is spent first" />
      </div>

      <div className="rounded-xl border border-[#e6e6e6] bg-white p-4 shadow-[0_2px_10px_rgba(20,30,60,0.05)]">
        <label className="text-[13px] font-semibold text-[#1f2d3d]">Your cards — one per line</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
          rows={9}
          spellCheck={false}
          placeholder={"4111111111111111|09|2028|123\n5555555555554444:12:2027:456"}
          className="mt-2 w-full rounded-lg border border-[#dcdcdc] bg-[#fbfcff] p-3 font-mono text-[12.5px] text-[#1f2d3d] outline-none focus:border-[#2196f3] disabled:opacity-60"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-[12px] text-[#777]">Format: <span className="font-mono">PAN|MM|YYYY|CVV</span></span>
          <button
            onClick={() => void run()}
            disabled={busy || !lines.length}
            className="ml-auto h-9 px-6 rounded-md bg-gradient-to-r from-[#2196f3] to-[#5ac8fa] text-white text-[13px] font-semibold shadow-[0_6px_18px_rgba(33,150,243,0.4)] hover:brightness-110 transition disabled:opacity-60 inline-flex items-center gap-2"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radar className="h-3.5 w-3.5" />}
            Check {lines.length || ""} card{lines.length === 1 ? "" : "s"} — ${cost.toFixed(2)}
          </button>
        </div>
      </div>

      {(rows.length > 0 || busy) && (
        <div className="mt-4 rounded-xl border border-[#e6e6e6] bg-white overflow-x-auto shadow-[0_2px_10px_rgba(20,30,60,0.05)]">
          <div className="flex flex-wrap items-center gap-3 border-b border-[#f0f0f0] px-4 py-3 text-[13px]">
            <span className="font-semibold text-[#1f2d3d]">Results</span>
            <span className="text-[#2e7d32]">LIVE {live}</span>
            <span className="text-[#f56c6c]">DEAD {dead}</span>
            <span className="text-[#888]">of {rows.length}</span>
          </div>
          <table className="w-full min-w-[560px] text-[13px]">
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.card}-${i}`} className="border-b border-[#f5f5f5]">
                  <td className="p-2.5 font-mono text-[#333]">{r.card}</td>
                  <td className="p-2.5 text-center">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border ${
                        r.status === "live"
                          ? "bg-[#e8f5e9] text-[#2e7d32] border-[#c8e6c9]"
                          : r.status === "dead"
                            ? "bg-[#fdecea] text-[#c62828] border-[#f5c6c3]"
                            : "bg-[#f6f6f6] text-[#999] border-[#e6e6e6]"
                      }`}
                    >
                      {r.status === "live" ? <ShieldCheck className="h-3 w-3" /> : <ShieldOff className="h-3 w-3" />}
                      {r.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-2.5 text-[12px] text-[#666]">{r.msg || r.category || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[12px] text-[#777]">
        The fee is charged per submitted card, whatever the result. Cards are sent to the gateway only — nothing is stored in plain form.
      </p>

      {busy && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#060b18]/80 backdrop-blur-xl p-4">
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/15 bg-white/[0.06] p-8 text-center shadow-[0_30px_80px_rgba(0,0,0,0.65)] backdrop-blur-2xl">
            <div className="pointer-events-none absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-[#2196f3]/30 blur-3xl" />
            <div className="relative mx-auto h-24 w-24">
              <span className="absolute inset-0 rounded-full border border-white/20 animate-ping" />
              <span className="absolute inset-4 rounded-full bg-white/10 backdrop-blur-md" />
              <span className="absolute inset-0 grid place-items-center">
                <Radar className="h-9 w-9 text-[#5ac8fa] animate-spin [animation-duration:2.4s]" />
              </span>
            </div>
            <div className="relative mt-6 text-[15.5px] font-semibold text-white">Checking {lines.length} card(s)…</div>
            <ul className="relative mt-5 space-y-1.5 text-left">
              {SCAN_STEPS.map((s, i) => (
                <li key={s} className={`flex items-center gap-2 text-[12px] ${i <= step ? "text-white/85" : "text-white/30"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${i < step ? "bg-[#7ee08a]" : i === step ? "bg-[#5ac8fa] animate-pulse" : "bg-white/25"}`} />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </AppShell>
  );
};

export default Checker;
