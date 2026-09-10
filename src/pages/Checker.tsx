import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import Seo from "@/components/Seo";
import { toast } from "sonner";
import {
  Loader2, Radar, CreditCard, ChevronDown, ListChecks, History, Copy, Download,
  CheckCircle2, XCircle, AlertTriangle, SkipForward, Wallet, Gauge, ShieldCheck, Zap,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { PageHero } from "@/components/PageHero";
import {
  selfCheckConfig, startSelfCheck, pollSelfCheck, checkerGates, checkerCredit,
  type SelfCheckRow, type SelfCheckStatus,
} from "@/lib/selfcheck.functions";
import { useAuth } from "@/hooks/useAuth";
import { buyCheckCredits } from "@/lib/store";
import { SystemStatusPanel } from "@/components/SystemStatus";

type Tab = SelfCheckStatus;

interface Gate { id: string; description: string; credit: number }

const TABS: { key: Tab; label: string; icon: typeof CheckCircle2; on: string }[] = [
  { key: "live", label: "Live", icon: CheckCircle2, on: "bg-[#12351d] text-[#7ee08a] border-[#2e7d32]" },
  { key: "dead", label: "Dead", icon: XCircle, on: "bg-[#3a1414] text-[#ff8a80] border-[#c62828]" },
  { key: "error", label: "Error", icon: AlertTriangle, on: "bg-[#3a2f10] text-[#f9d27a] border-[#f9a825]" },
  { key: "skipped", label: "Skipped", icon: SkipForward, on: "bg-[#1b2438] text-[#9fb4d8] border-[#33507f]" },
];

const Panel = ({ title, icon: Icon, right, children, className = "" }: {
  title: string; icon: typeof Radar; right?: React.ReactNode; children: React.ReactNode; className?: string;
}) => (
  <section className={`rounded-2xl border border-white/10 bg-gradient-to-b from-[#111c33] to-[#0b1224] shadow-[0_18px_50px_rgba(4,10,24,0.55)] overflow-hidden ${className}`}>
    <header className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
      <Icon className="h-4 w-4 text-[#5ac8fa]" />
      <h2 className="text-[12.5px] font-semibold uppercase tracking-[0.14em] text-white/85">{title}</h2>
      <div className="ml-auto flex items-center gap-2">{right}</div>
    </header>
    {children}
  </section>
);

const Checker = () => {
  const { profile, refresh } = useAuth();
  const getConfig = useServerFn(selfCheckConfig);
  const getGates = useServerFn(checkerGates);
  const getCredit = useServerFn(checkerCredit);
  const start = useServerFn(startSelfCheck);
  const poll = useServerFn(pollSelfCheck);

  const [price, setPrice] = useState(0.03);
  const [creditCost, setCreditCost] = useState(30);
  const [creditsPerUsd, setCreditsPerUsd] = useState(1000);
  const [buyUsd, setBuyUsd] = useState(5);
  const [buying, setBuying] = useState(false);
  const [gates, setGates] = useState<Gate[]>([]);
  const [gate, setGate] = useState("");
  const [gateOpen, setGateOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<SelfCheckRow[]>([]);
  const [tab, setTab] = useState<Tab>("live");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [credit, setCredit] = useState<{ credit: number; ok: boolean; error?: string } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void getConfig({}).then((c) => {
      setPrice(c.price); setCreditCost(c.creditCost); setCreditsPerUsd(c.creditsPerUsd);
      setGate((g) => g || c.gate);
    }).catch(() => undefined);
    void getGates({}).then((g) => setGates(g as Gate[])).catch(() => undefined);
    void getCredit({})
      .then((c) => setCredit({ credit: c.credit, ok: c.ok, error: "error" in c ? c.error : undefined }))
      .catch((e) => setCredit({ credit: 0, ok: false, error: e instanceof Error ? e.message : "unreachable" }));
  }, [getConfig, getGates, getCredit]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setGateOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const lines = useMemo(() => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean), [text]);
  const needCredits = lines.length * creditCost;
  const cost = Math.round((needCredits / creditsPerUsd) * 100) / 100;
  const spendable = Number(profile?.balance ?? 0) + Number(profile?.bonus_balance ?? 0);
  const myCredits = Number(profile?.check_credits ?? 0);

  const buyCredits = async () => {
    if (!(buyUsd >= 1)) return toast.error("Minimum $1");
    if (spendable < buyUsd) return toast.error("Insufficient balance. Please top up.");
    setBuying(true);
    try {
      const got = await buyCheckCredits(buyUsd);
      toast.success(`+${got} credits added`);
      await refresh?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBuying(false);
    }
  };

  const counts = useMemo(() => ({
    live: rows.filter((r) => r.status === "live").length,
    dead: rows.filter((r) => r.status === "dead").length,
    error: rows.filter((r) => r.status === "error").length,
    skipped: rows.filter((r) => r.status === "skipped").length,
  }), [rows]);

  const total = busy || rows.length ? Math.max(lines.length, rows.length) : lines.length;
  const progress = total ? Math.round((rows.length / total) * 100) : 0;
  const hitRate = rows.length ? Math.round((counts.live / rows.length) * 100) : 0;
  const visible = rows.filter((r) => r.status === tab);

  const gateLabel = gates.find((g) => g.id === gate)?.description || gate || "Select gate";

  const run = async () => {
    if (!lines.length) return toast.error("Paste at least one card (PAN|MM|YYYY|CVV)");
    if (lines.length > 500) return toast.error("Maximum 500 cards per run");
    if (myCredits < needCredits) return toast.error(`Not enough credits — you need ${needCredits}, you have ${myCredits}. Buy credits first.`);
    setBusy(true); setRows([]); setStartedAt(Date.now());
    try {
      const task = await start({ data: { cards: lines, gate: gate || undefined } });
      setTaskId(task.taskId);
      toast.success(`Charged ${task.credits} credits ($${task.cost.toFixed(2)}) — checking ${task.total} card(s)`);
      void refresh?.();
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, i === 0 ? 5000 : 6000));
        const st = await poll({ data: { taskId: task.taskId } });
        if (st.rows.length) setRows(st.rows);
        if (st.done) break;
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      toast.error(
        m.includes("insufficient_credits") ? "Not enough check credits. Buy credits first."
        : m.includes("insufficient_balance") ? "Insufficient balance."
        : m.includes("no_valid_cards") ? "No valid cards. Use PAN|MM|YYYY|CVV per line."
        : m.includes("checker_not_configured") ? "Checker gateway is not configured yet."
        : m,
        { duration: 8000 },
      );
    } finally {
      setBusy(false);
    }
  };

  const exportText = visible.map((r) => `${r.card} | ${r.status.toUpperCase()} | ${r.msg || r.category}`).join("\n");
  const copyOut = async () => {
    if (!exportText) return toast.error("Nothing to copy");
    await navigator.clipboard.writeText(exportText);
    toast.success("Copied");
  };
  const download = () => {
    if (!exportText) return toast.error("Nothing to export");
    const url = URL.createObjectURL(new Blob([exportText], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url; a.download = `check-${tab}-${Date.now()}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  const eta = !busy ? "Done" : startedAt && rows.length
    ? `${Math.max(1, Math.round(((Date.now() - startedAt) / 1000 / rows.length) * (total - rows.length)))}s`
    : "…";

  return (
    <AppShell>
      <Seo title="Card Checker | Zoru Shop" description="Check your own cards live/dead with your balance." path="/checker" />

      <PageHero
        eyebrow="Card checker"
        eyebrowIcon={Radar}
        title="Check your cards"
        highlight="live or dead"
        description={`Paste your cards, pick a gate and pay with credits — ${creditCost} credits ($${price.toFixed(2)}) per card. $1 = ${creditsPerUsd} credits.`}
        right={
          <div className="flex flex-wrap gap-2">
            <div className="rounded-xl border border-white/12 bg-white/[0.06] px-4 py-3 text-right">
              <div className="flex items-center justify-end gap-1.5 text-[11px] uppercase tracking-wider text-white/55">
                <Wallet className="h-3 w-3" /> Your balance
              </div>
              <div className="font-mono text-xl text-white">${spendable.toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-[#f9a825]/35 bg-[#f9a825]/10 px-4 py-3 text-right">
              <div className="flex items-center justify-end gap-1.5 text-[11px] uppercase tracking-wider text-white/60">
                <Zap className="h-3 w-3" /> Your credits
              </div>
              <div className="font-mono text-xl text-[#f9d27a]">{myCredits}</div>
            </div>
            <div className="rounded-xl border border-white/12 bg-white/[0.06] px-4 py-3 text-right">
              <div className="flex items-center justify-end gap-1.5 text-[11px] uppercase tracking-wider text-white/55">
                <Zap className="h-3 w-3" /> Gateway credit
              </div>
              <div className={`font-mono text-xl ${credit?.ok ? "text-[#7ee08a]" : "text-[#ff8a80]"}`}>
                {credit ? (credit.ok ? credit.credit.toFixed(2) : "offline") : "…"}
              </div>
            </div>
          </div>
        }
      />

      <SystemStatusPanel className="mb-4" />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
        {/* LIST CARD */}
        <Panel
          title="List card"
          icon={CreditCard}
          right={<span className="rounded-md border border-[#c62828]/40 bg-[#c62828]/15 px-2 py-0.5 text-[11px] text-[#ff8a80]">{creditCost} credits (${price.toFixed(2)}) per card</span>}
        >
          <div className="p-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={busy}
              rows={11}
              spellCheck={false}
              placeholder="Enter card details here (format: XXXXXXXXXXXXXXXX|MM|YYYY|CVV)…"
              className="w-full resize-y rounded-xl border border-white/10 bg-[#0a1222] p-3 font-mono text-[12.5px] text-white/90 placeholder:text-white/25 outline-none focus:border-[#2196f3]/60 disabled:opacity-60"
            />
            <div className="mt-2 flex items-center justify-between text-[11.5px] text-white/45">
              <span>Duplicates are removed automatically</span>
              <span className="font-mono">{lines.length}/500</span>
            </div>
          </div>
        </Panel>

        {/* GATE */}
        <Panel title="Gate" icon={Gauge}>
          <div className="p-3" ref={boxRef}>
            <button
              onClick={() => setGateOpen((o) => !o)}
              disabled={busy}
              className="flex w-full items-center gap-2 rounded-xl border border-white/12 bg-[#0a1222] px-3.5 py-3 text-left text-[13px] text-white/90 hover:border-[#2196f3]/50 transition disabled:opacity-60"
            >
              <span className="truncate">{gateLabel}</span>
              <ChevronDown className={`ml-auto h-4 w-4 text-white/50 transition ${gateOpen ? "rotate-180" : ""}`} />
            </button>
            {gateOpen && (
              <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-white/12 bg-[#0a1222] shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
                {gates.length === 0 && <div className="px-3.5 py-3 text-[12.5px] text-white/45">No gates available</div>}
                {gates.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => { setGate(g.id); setGateOpen(false); }}
                    className={`flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[12.5px] transition hover:bg-white/[0.06] ${g.id === gate ? "text-[#5ac8fa]" : "text-white/80"}`}
                  >
                    <span className="truncate">{g.description}</span>
                    {g.credit > 0 && <span className="ml-auto shrink-0 font-mono text-[11px] text-white/40">{g.credit}cr</span>}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <div className="text-white/45">Total cost</div>
                <div className="font-mono text-[15px] text-[#7ee08a]">{needCredits} cr</div>
                <div className="font-mono text-[11px] text-white/40">${cost.toFixed(2)}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <div className="flex items-center gap-1 text-white/45"><Wallet className="h-3 w-3" /> Your credits</div>
                <div className={`font-mono text-[15px] ${myCredits >= needCredits ? "text-white/90" : "text-[#ff8a80]"}`}>{myCredits} cr</div>
                <div className="font-mono text-[11px] text-white/40">${spendable.toFixed(2)} balance</div>
              </div>
            </div>

            <button
              onClick={() => void run()}
              disabled={busy || !lines.length}
              className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#2196f3] to-[#5ac8fa] text-[13.5px] font-semibold text-white shadow-[0_10px_26px_rgba(33,150,243,0.4)] transition hover:brightness-110 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
              {busy ? "Checking…" : `Start check${lines.length ? ` (${lines.length})` : ""}`}
            </button>

            {/* buy credits with balance */}
            <div className="mt-3 rounded-xl border border-[#f9a825]/30 bg-[#f9a825]/[0.07] p-3">
              <div className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#f9d27a]">
                <Zap className="h-3.5 w-3.5" /> Buy credits
              </div>
              <p className="mt-1 text-[11.5px] text-white/50">
                $1 = {creditsPerUsd} credits · 1 check = {creditCost} credits (${price.toFixed(2)})
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  type="number" min={1} step={1} value={buyUsd}
                  onChange={(e) => setBuyUsd(Number(e.target.value))}
                  disabled={buying}
                  className="h-10 w-24 rounded-lg border border-white/12 bg-[#0a1222] px-3 font-mono text-[13px] text-white/90 outline-none focus:border-[#f9a825]/60"
                />
                <button
                  onClick={() => void buyCredits()}
                  disabled={buying}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#f9a825] to-[#ffca28] text-[13px] font-semibold text-[#231a00] transition hover:brightness-110 disabled:opacity-50"
                >
                  {buying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Buy {Math.max(0, Math.floor(buyUsd * creditsPerUsd))} cr
                </button>
              </div>
            </div>
          </div>
        </Panel>

        {/* TASK & HISTORY */}
        <Panel title="Task & history" icon={History}>
          <div className="p-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${busy ? "bg-[#2196f3]/15 text-[#5ac8fa]" : "bg-white/10 text-white/60"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${busy ? "bg-[#5ac8fa] animate-pulse" : "bg-white/40"}`} />
                  {busy ? "RUNNING" : "READY"}
                </span>
                <span className="font-mono text-[11px] text-white/35">{taskId ? taskId.slice(-8) : "--------"}</span>
              </div>

              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-[#2196f3] to-[#43a047] transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="mt-1 text-right font-mono text-[11px] text-white/45">{progress}%</div>

              <div className="mt-3 grid grid-cols-4 gap-1.5 text-center text-[11.5px]">
                <div className="rounded-lg bg-[#12351d] py-1.5 font-mono text-[#7ee08a]">{counts.live}</div>
                <div className="rounded-lg bg-[#3a1414] py-1.5 font-mono text-[#ff8a80]">{counts.dead}</div>
                <div className="rounded-lg bg-[#3a2f10] py-1.5 font-mono text-[#f9d27a]">{counts.error}</div>
                <div className="rounded-lg bg-white/[0.06] py-1.5 font-mono text-white/60">{counts.skipped}</div>
              </div>

              <dl className="mt-3 space-y-1.5 text-[12px]">
                <div className="flex justify-between"><dt className="text-white/45">Progress</dt><dd className="font-mono text-white/80">{rows.length}/{total}</dd></div>
                <div className="flex justify-between"><dt className="text-white/45">ETA</dt><dd className="font-mono text-white/80">{eta}</dd></div>
                <div className="flex justify-between"><dt className="text-white/45">Hit rate</dt><dd className="font-mono text-[#7ee08a]">{hitRate}%</dd></div>
                <div className="flex justify-between"><dt className="text-white/45">Charged</dt><dd className="font-mono text-white/80">{needCredits} cr (${cost.toFixed(2)})</dd></div>
              </dl>
            </div>
          </div>
        </Panel>
      </div>

      {/* RESULT */}
      <div className="mt-4">
        <Panel
          title="Result"
          icon={ListChecks}
          right={
            <>
              <button onClick={() => void copyOut()} className="inline-flex items-center gap-1 rounded-md border border-white/12 px-2.5 py-1 text-[11.5px] text-white/70 hover:bg-white/[0.06]">
                <Copy className="h-3 w-3" /> Copy
              </button>
              <button onClick={download} className="inline-flex items-center gap-1 rounded-md border border-white/12 px-2.5 py-1 text-[11.5px] text-white/70 hover:bg-white/[0.06]">
                <Download className="h-3 w-3" /> Export
              </button>
            </>
          }
        >
          <div className="flex flex-wrap gap-2 px-3 pt-3">
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-[12.5px] font-semibold transition ${
                    active ? t.on : "border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.06]"
                  }`}
                >
                  <t.icon className="h-3.5 w-3.5" />
                  {t.label}
                  <span className="rounded-full bg-black/30 px-1.5 py-0.5 font-mono text-[11px]">{counts[t.key]}</span>
                </button>
              );
            })}
          </div>

          <div className="p-3">
            <div className="min-h-[220px] rounded-xl border-l-2 border-[#2e7d32] bg-[#0a1222] p-3">
              {visible.length === 0 ? (
                <p className="font-mono text-[12.5px] italic text-white/30">
                  {busy ? "Waiting for gateway results…" : `No ${tab} cards yet`}
                </p>
              ) : (
                <ul className="space-y-1">
                  {visible.map((r, i) => (
                    <li key={`${r.card}-${i}`} className="flex flex-wrap items-center gap-2 font-mono text-[12.5px] text-white/85">
                      <span>{r.card}</span>
                      <span className="text-white/25">|</span>
                      <span className={
                        r.status === "live" ? "text-[#7ee08a]"
                        : r.status === "dead" ? "text-[#ff8a80]"
                        : r.status === "error" ? "text-[#f9d27a]" : "text-white/50"
                      }>{r.status.toUpperCase()}</span>
                      <span className="text-white/25">|</span>
                      <span className="text-white/50">{r.msg || r.category || "—"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Panel>
      </div>

      {credit && !credit.ok ? (
        <p className="mt-3 flex items-center gap-2 rounded-xl border border-[#c62828]/35 bg-[#c62828]/10 px-3.5 py-2.5 text-[12.5px] text-[#ff8a80]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            The checking gateway is unreachable right now — checks will fail until it is back.
            {credit.error ? <span className="ml-1 font-mono text-white/55">({credit.error})</span> : null}
            {credit.error?.includes("not_configured")
              ? " The gateway key is missing on the server."
              : credit.error?.toLowerCase().includes("ip")
                ? " The server IP is not whitelisted on the gateway."
                : ""}
          </span>
        </p>
      ) : null}

      <p className="mt-3 flex items-center gap-2 text-[12px] text-white/45">
        <ShieldCheck className="h-3.5 w-3.5 text-[#7ee08a]" />
Credits are charged per submitted card whatever the result — no credits, no checking. Cards go straight to the gateway — nothing is stored in plain form.
      </p>
    </AppShell>
  );
};

export default Checker;
