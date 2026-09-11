import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { listMyOrders, listChecksForOrders, type CardCheck } from "@/lib/store";
import { useAuth } from "@/hooks/useAuth";
import { useServerFn } from "@tanstack/react-start";
import { startOrderCardCheck, pollOrderCardCheck, CHECK_WINDOW_MS } from "@/lib/orderCheck.functions";
import { lookupBin, type BinInfo } from "@/lib/bin";
import {
  Search, RotateCcw, ChevronLeft, ChevronRight, Package, Receipt, CreditCard,
  Copy, Download, RefreshCw, Loader2, ShieldCheck, ArrowLeft,
} from "lucide-react";
import { PageHero, StatCard } from "@/components/PageHero";
import { toast } from "sonner";

/* ────────────────────────── types & parsing ────────────────────────── */

interface OrderItem {
  id?: string;
  price: number;
  product_id?: string;
  product_title?: string;
  content?: string;
}
interface Order { id: string; total: number; status: string; created_at: string; items: OrderItem[] }

interface ParsedCard {
  key: string;
  raw: string;
  pan: string;
  month: string;
  year: string;
  cvv: string;
  country: string;
  state: string;
  city: string;
  zip: string;
  price: number;
}

const d = (s: string) => s.replace(/\D/g, "");

/** delivered_content line → card. Supports `base|price|cc|mm|yy|cvv|…` and `cc|mm|yy|cvv|…`. */
function parseDelivered(line: string, fallbackPrice: number, index: number): ParsedCard | null {
  const p = line.split("|").map((x) => x.trim());
  let off = -1;
  if (d(p[2] ?? "").length >= 12) off = 2;
  else if (d(p[0] ?? "").length >= 12) off = 0;
  if (off < 0) return null;
  const pan = d(p[off] ?? "");
  let month = d(p[off + 1] ?? "");
  let year = d(p[off + 2] ?? "");
  const cvv = d(p[off + 3] ?? "");
  if (month.length === 1) month = `0${month}`;
  if (year.length === 4) year = year.slice(2);
  const rest = off === 2 ? p.slice(6) : p.slice(4);
  // name|addr|city|state|zip|country|…
  const price = off === 2 && p[1] ? Number(p[1]) || fallbackPrice : fallbackPrice;
  return {
    key: `${pan}-${index}`,
    raw: line,
    pan,
    month,
    year,
    cvv,
    city: rest[2] ?? "",
    state: rest[3] ?? "",
    zip: rest[4] ?? "",
    country: rest[5] ?? "",
    price,
  };
}

const cardsOfOrder = (o: Order): ParsedCard[] => {
  const out: ParsedCard[] = [];
  o.items.forEach((it) => {
    const lines = (it.content ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    lines.forEach((l) => {
      const parsed = parseDelivered(l, it.price, out.length);
      if (parsed) out.push(parsed);
    });
  });
  return out;
};

const fmtTime = (s: string) => {
  const dt = new Date(s);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
};
const dayOf = (s: string) => new Date(s).toISOString().slice(0, 10);
const orderNo = (id: string) => `ODE${id.replace(/-/g, "").slice(0, 16).toUpperCase()}`;

const downloadFile = (name: string, text: string, mime = "text/plain;charset=utf-8") => {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
};

const copy = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    toast.error("Copy failed — copy manually");
  }
};

/* ────────────────────────── page ────────────────────────── */

const Orders = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [day, setDay] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await listMyOrders();
      setOrders(
        data.map((o) => ({
          id: o.id,
          total: Number(o.total ?? 0),
          status: o.status,
          created_at: o.created_at,
          items: (o.order_items ?? []).map((it) => ({
            id: it.id,
            price: Number(it.unit_price ?? 0),
            product_id: it.product_id ?? undefined,
            product_title: it.title,
            content: it.delivered_content ?? undefined,
          })),
        })),
      );
    } catch (error) {
      setOrders([]);
      setLoadError(error instanceof Error ? error.message : "Orders could not be loaded");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (user) void load(); }, [user, load]);

  const filtered = useMemo(
    () => orders.filter((o) =>
      (orderNo(o.id) + o.id).toLowerCase().includes(query.toLowerCase())
      && (!day || dayOf(o.created_at) === day)),
    [orders, query, day],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const current = Math.min(page, totalPages);
  const rows = filtered.slice((current - 1) * perPage, current * perPage);

  const days = useMemo(
    () => [...new Set(orders.map((o) => dayOf(o.created_at)))].sort().reverse(),
    [orders],
  );

  const exportOrders = (list: Order[], name: string, csv: boolean) => {
    const cards = list.flatMap((o) => cardsOfOrder(o).map((c) => ({ o, c })));
    if (!cards.length) return toast.error("Nothing to download");
    if (csv) {
      const head = "order,date,card,month,year,cvv,city,state,zip,country,price";
      const body = cards.map(({ o, c }) =>
        [orderNo(o.id), fmtTime(o.created_at), c.pan, c.month, c.year, c.cvv, c.city, c.state, c.zip, c.country, c.price.toFixed(2)]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
      downloadFile(`${name}.csv`, [head, ...body].join("\n"), "text/csv;charset=utf-8");
    } else {
      downloadFile(`${name}.txt`, cards.map(({ c }) => c.raw).join("\n"));
    }
    toast.success("Downloaded");
  };

  const openOrder = orders.find((o) => o.id === openId) ?? null;

  if (openOrder) {
    return (
      <AppShell>
        <OrderDetail
          order={openOrder}
          onBack={() => setOpenId(null)}
          onRefresh={load}
          onExport={(csv) => exportOrders([openOrder], orderNo(openOrder.id), csv)}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHero
        eyebrow="My orders"
        eyebrowIcon={Package}
        title="Purchase"
        highlight="history"
        description="Every order, the delivered cards, live/dead checking and day-wise export in one place."
      />

      <div className="grid gap-3 sm:grid-cols-3 mb-4">
        <StatCard label="Total orders" icon={Package} tone="blue" value={orders.length} />
        <StatCard label="Cards bought" icon={CreditCard} tone="amber" value={orders.reduce((n, o) => n + cardsOfOrder(o).length, 0)} />
        <StatCard label="Spent" icon={Receipt} tone="green" value={`$${orders.reduce((n, o) => n + o.total, 0).toFixed(2)}`} />
      </div>

      <div className="text-[13px] text-[#333]">
        <div className="rounded-xl border border-[#e6e6e6] bg-white px-4 py-3 flex flex-wrap items-center gap-3">
          <label className="font-medium text-[#333]">Order number</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setQuery(q); setPage(1); } }}
            placeholder="Enter order number"
            className="h-8 w-[230px] rounded-md border border-[#dcdcdc] px-2 text-[13px] font-mono outline-none focus:border-[#4fc3f7]"
          />
          <button
            onClick={() => { setQuery(q); setPage(1); }}
            className="h-8 px-4 rounded-md bg-[#409eff] hover:bg-[#3a8ee6] text-white text-[13px] inline-flex items-center gap-1.5 transition"
          >
            <Search className="h-3.5 w-3.5" /> Search
          </button>
          <button
            onClick={() => { setQ(""); setQuery(""); setDay(""); setPage(1); }}
            className="h-8 px-4 rounded-md border border-[#dcdcdc] text-[#555] hover:bg-[#f7f7f7] text-[13px] inline-flex items-center gap-1.5 transition"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              value={day}
              onChange={(e) => { setDay(e.target.value); setPage(1); }}
              className="h-8 rounded-md border border-[#dcdcdc] px-2 bg-white text-[13px] outline-none"
            >
              <option value="">All days</option>
              {days.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <button
              onClick={() => exportOrders(filtered, day ? `cards-${day}` : "cards-all", false)}
              className="h-8 px-4 rounded-md border border-[#c8e6c9] bg-[#e8f5e9] hover:bg-[#dcedc8] text-[#2e7d32] text-[13px] inline-flex items-center gap-1.5 transition"
            >
              <Download className="h-3.5 w-3.5" /> Download TXT
            </button>
            <button
              onClick={() => exportOrders(filtered, day ? `cards-${day}` : "cards-all", true)}
              className="h-8 px-4 rounded-md border border-[#dcdcdc] text-[#555] hover:bg-[#f7f7f7] text-[13px] inline-flex items-center gap-1.5 transition"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-[#e6e6e6] bg-white overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead className="bg-[#fafafa] text-[#606266]">
              <tr>
                <th className="p-3 text-left font-normal border-b border-[#eee]">Order number</th>
                <th className="p-3 text-center font-normal border-b border-[#eee] w-[120px]">Cards</th>
                <th className="p-3 text-center font-normal border-b border-[#eee] w-[120px]">Total</th>
                <th className="p-3 text-center font-normal border-b border-[#eee] w-[200px]">Payment time</th>
                <th className="p-3 text-center font-normal border-b border-[#eee] w-[160px]">Operation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-b border-[#f0f0f0] hover:bg-[#fafcff] transition">
                  <td className="p-3 font-mono text-[#333]">{orderNo(o.id)}</td>
                  <td className="p-3 text-center">{cardsOfOrder(o).length}</td>
                  <td className="p-3 text-center font-mono">${o.total.toFixed(2)}</td>
                  <td className="p-3 text-center text-[#606266]">{fmtTime(o.created_at)}</td>
                  <td className="p-3 text-center">
                    <button onClick={() => setOpenId(o.id)} className="text-[#409eff] hover:underline">
                      Open
                    </button>
                  </td>
                </tr>
              ))}
              {loading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b border-[#f0f0f0]">
                  {Array.from({ length: 5 }).map((__, j) => (
                    <td key={j} className="p-3"><div className="h-3 w-full bg-[#f0f0f0] animate-pulse" /></td>
                  ))}
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={5} className="p-12 text-center text-[#909399]">
                  {loadError ? `Could not load orders: ${loadError}` : "No orders"}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 text-[13px] text-[#606266]">
          <span>Total {filtered.length}</span>
          <select
            value={perPage}
            onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
            className="h-7 border border-[#dcdcdc] rounded px-2 bg-white outline-none"
          >
            {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
          <button
            onClick={() => setPage(Math.max(1, current - 1))}
            disabled={current === 1}
            className="h-7 w-7 border border-[#dcdcdc] rounded bg-white inline-flex items-center justify-center disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="px-2">{current} / {totalPages}</span>
          <button
            onClick={() => setPage(Math.min(totalPages, current + 1))}
            disabled={current === totalPages}
            className="h-7 w-7 border border-[#dcdcdc] rounded bg-white inline-flex items-center justify-center disabled:opacity-40"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </AppShell>
  );
};

/* ────────────────────────── order detail ────────────────────────── */

const OrderDetail = ({
  order, onBack, onRefresh, onExport,
}: { order: Order; onBack: () => void; onRefresh: () => Promise<void>; onExport: (csv: boolean) => void }) => {
  const { refresh } = useAuth();
  const cards = useMemo(() => cardsOfOrder(order), [order]);
  const [checks, setChecks] = useState<CardCheck[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [bins, setBins] = useState<Record<string, BinInfo | null>>({});
  const [now, setNow] = useState(() => Date.now());
  const start = useServerFn(startOrderCardCheck);
  const poll = useServerFn(pollOrderCardCheck);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  /** milliseconds left in the 2 minute refund-check window (0 = expired) */
  const leftMs = useCallback((created: string) => {
    const t = new Date(created).getTime();
    if (!Number.isFinite(t)) return 0;
    return Math.max(0, CHECK_WINDOW_MS - (now - t));
  }, [now]);
  const fmtLeft = (ms: number) => {
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  const loadChecks = useCallback(async () => {
    try { setChecks(await listChecksForOrders([order.id])); } catch { /* ignore */ }
  }, [order.id]);
  useEffect(() => { void loadChecks(); }, [loadChecks]);

  useEffect(() => {
    const bins6 = [...new Set(cards.map((c) => c.pan.slice(0, 6)))];
    bins6.forEach((b) => {
      if (b in bins) return;
      void lookupBin(b).then((info) => setBins((prev) => ({ ...prev, [b]: info })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);

  /** card ↔ check row pairing: same BIN, in purchase order. */
  const pairs = useMemo(() => {
    const pool = [...checks];
    return cards.map((c) => {
      const bin = c.pan.slice(0, 6);
      let i = pool.findIndex((x) => (x.bin ?? "").startsWith(bin.slice(0, 6)));
      if (i < 0) i = pool.findIndex((x) => !x.bin);
      const check = i >= 0 ? pool.splice(i, 1)[0] : undefined;
      return { card: c, check };
    });
  }, [cards, checks]);

  const refundable = pairs.filter((p) => p.check);
  const deadCount = refundable.filter((p) => p.check?.status === "dead").length;
  const refundTotal = refundable.reduce((s, p) => s + Number(p.check?.refunded ?? 0), 0);
  const avg = cards.length ? cards.reduce((s, c) => s + c.price, 0) / cards.length : 0;

  const runCheck = async (checkId: string) => {
    setBusy(checkId);
    try {
      const { taskId } = await start({ data: { checkId } });
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, i === 0 ? 6000 : 11000));
        try {
          const st = await poll({ data: { taskId } });
          if (st.done) {
            await loadChecks();
            void refresh?.();
            if (st.status === "dead") toast.success(`DEAD — $${st.refunded.toFixed(2)} refunded to your balance`);
            else if (st.status === "live") toast.success("LIVE — card is valid");
            else toast.info("The gateway did not answer — your check fee was refunded");
            return;
          }
        } catch { /* transient gateway error — keep polling */ }
      }
      toast.info("Still checking — press CHECK again in a minute");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(
        msg.includes("insufficient_balance") ? "Not enough balance for the check fee"
        : msg.includes("check_window_expired") ? "Time expired — the 2 minute refund check window is over"
        : msg.includes("already_checked") ? "This card was already checked"
        : msg.includes("no_card_data") ? "Card data unavailable for this check"
        : msg,
        { duration: 8000 },
      );
    } finally {
      setBusy(null);
      await loadChecks();
    }
  };

  const checkAll = async () => {
    for (const p of pairs) {
      if (p.check && p.check.status === "pending" && leftMs(p.check.created_at) > 0) {
        await runCheck(p.check.id);
      }
    }
  };

  const pendingCount = refundable.filter(
    (p) => p.check?.status === "pending" && leftMs(p.check.created_at) > 0,
  ).length;
  const windowLeft = Math.max(
    0,
    ...refundable
      .filter((p) => p.check?.status === "pending")
      .map((p) => leftMs(p.check!.created_at)),
  );

  return (
    <div className="text-[13px]">
      <div className="rounded-xl border border-white/10 bg-gradient-to-r from-[#0f1a33] via-[#132244] to-[#0f1a33] p-5">
        <div className="text-[12px] uppercase tracking-wider text-white/50">Order detail</div>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-[22px] font-bold text-white font-mono">Order {orderNo(order.id)}</h1>
          <span className="rounded-full bg-[#2e7d32]/25 border border-[#2e7d32]/50 px-2.5 py-0.5 text-[11px] font-semibold text-[#7ee08a] uppercase">
            {order.status}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <button onClick={onBack} className="h-8 px-3 rounded-md border border-white/15 text-white/80 text-[12.5px] hover:bg-white/10 inline-flex items-center gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to list
            </button>
            <button onClick={() => void onRefresh().then(loadChecks)} className="h-8 px-3 rounded-md bg-[#409eff] text-white text-[12.5px] hover:brightness-110 inline-flex items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh data
            </button>
            <button onClick={() => onExport(false)} className="h-8 px-3 rounded-md border border-[#43a047]/60 text-[#7ee08a] text-[12.5px] hover:bg-[#43a047]/15 inline-flex items-center gap-1.5">
              <Download className="h-3.5 w-3.5" /> Download TXT
            </button>
            <button onClick={() => onExport(true)} className="h-8 px-3 rounded-md border border-white/15 text-white/80 text-[12.5px] hover:bg-white/10 inline-flex items-center gap-1.5">
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>

            <button
              onClick={() => void copy(cards.map((c) => c.raw).join("\n"))}
              className="h-8 px-3 rounded-md bg-gradient-to-r from-[#7b5cff] to-[#a06bff] text-white text-[12.5px] hover:brightness-110 inline-flex items-center gap-1.5"
            >
              <Copy className="h-3.5 w-3.5" /> Copy card info
            </button>
          </div>
        </div>
        <div className="mt-2 text-[12px] text-white/55">
          Order time: {fmtTime(order.created_at)} &nbsp;·&nbsp; Paid time: {fmtTime(order.created_at)}
        </div>
      </div>

      <div className="mt-4 grid gap-3 grid-cols-2 lg:grid-cols-5">
        {[
          { l: "Card count", v: String(cards.length) },
          { l: "Refunded cards", v: String(deadCount) },
          { l: "Avg card price", v: `$${avg.toFixed(2)}` },
          { l: "Total amount", v: `$${order.total.toFixed(2)}` },
          { l: "Refund amount", v: `$${refundTotal.toFixed(2)}` },
        ].map((s) => (
          <div key={s.l} className="rounded-xl border border-white/10 bg-[#0d1526] px-4 py-3.5">
            <div className="text-[11.5px] text-white/45">{s.l}</div>
            <div className="mt-1 text-[19px] font-semibold text-white font-mono">{s.v}</div>
          </div>
        ))}
      </div>

      {refundable.length > 0 && (
        <div className="mt-4 rounded-xl border border-[#2196f3]/30 bg-[#0f1a33] px-4 py-3 flex flex-wrap items-center gap-4">
          <div className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2">
            <div className="text-[11px] text-white/45">All checkable cards</div>
            <div className="text-[18px] font-semibold text-white font-mono">{refundable.length}</div>
          </div>
          <button
            onClick={() => void checkAll()}
            disabled={!pendingCount || !!busy}
            className="h-9 px-5 rounded-md bg-gradient-to-r from-[#2196f3] to-[#5ac8fa] text-white text-[13px] font-semibold hover:brightness-110 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            CHECK ALL
          </button>
          <span className="text-[12px] text-white/55">
            Dead cards are refunded automatically · {pendingCount} card{pendingCount === 1 ? "" : "s"} left to check
          </span>
          <span
            className={`rounded-md border px-3 py-1.5 text-[12px] font-semibold font-mono ${
              windowLeft > 0
                ? "border-[#ffb300]/40 bg-[#ffb300]/10 text-[#ffca62]"
                : "border-[#c62828]/40 bg-[#c62828]/10 text-[#ff8a80]"
            }`}
          >
            {windowLeft > 0 ? `Refund check time left: ${fmtLeft(windowLeft)}` : "Time expired"}
          </span>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-white/10 bg-[#0d1526] overflow-x-auto">
        <table className="w-full min-w-[980px] text-[12.5px]">
          <thead>
            <tr className="bg-white/[0.04] text-white/60 text-left">
              {["Card Info", "Raw Card Data", "BIN Info", "Region", "Unit Price", "Detection", "Refund", "Action"].map((h) => (
                <th key={h} className="px-4 py-3 font-medium border-b border-white/10">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="text-white/80">
            {pairs.map(({ card, check }) => {
              const info = bins[card.pan.slice(0, 6)];
              const status = check?.status ?? null;
              const dead = status === "dead";
              return (
                <tr key={card.key} className="border-b border-white/5 align-top">
                  <td className="px-4 py-4">
                    <div className="font-mono text-white">{card.pan}</div>
                    <div className="mt-1 text-[11.5px] text-white/45">
                      Expiry: {card.month}/{card.year} · CVV: {dead ? "•••" : card.cvv}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-black/25 px-2 py-1 font-mono text-[11.5px] text-white/70 max-w-[280px]">
                      <span className="truncate">{dead ? "—— refunded ——" : card.raw}</span>
                      {!dead && (
                        <button onClick={() => void copy(card.raw)} className="text-white/45 hover:text-white" aria-label="Copy raw card data">
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-[11.5px] text-white/55 leading-5">
                    <div className="text-white/85">BIN: {card.pan.slice(0, 6)}</div>
                    <div>Bank: {info?.bank ?? "—"}</div>
                    <div>Scheme: {info?.brand ?? "—"}</div>
                    <div>Type: {info?.type ?? "—"}</div>
                    <div>Level: {info?.level ?? "—"}</div>
                  </td>
                  <td className="px-4 py-4 text-[12px]">
                    <div>{info?.countryName ?? card.country ?? "—"}</div>
                    <div className="text-white/45">{[card.city, card.state].filter(Boolean).join(", ") || "—"}</div>
                  </td>
                  <td className="px-4 py-4 font-mono">${card.price.toFixed(2)}</td>
                  <td className="px-4 py-4">
                    {status === "live" && <span className="rounded-full bg-[#2e7d32]/20 text-[#7ee08a] border border-[#2e7d32]/40 px-2.5 py-0.5 text-[11px] font-semibold">LIVE</span>}
                    {status === "dead" && <span className="rounded-full bg-[#c62828]/20 text-[#ff8a80] border border-[#c62828]/40 px-2.5 py-0.5 text-[11px] font-semibold">DEAD</span>}
                    {status === "pending" && <span className="text-white/40">—</span>}
                    {!status && <span className="text-white/25">not refundable</span>}
                  </td>
                  <td className="px-4 py-4 font-mono text-[#7ee08a]">
                    {check && Number(check.refunded) > 0 ? `+$${Number(check.refunded).toFixed(2)}` : <span className="text-white/25">—</span>}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void copy(card.raw)}
                        disabled={dead}
                        title={dead ? "Dead cards cannot be copied" : "Copy card"}
                        className="rounded-md border border-white/15 px-2.5 py-1 text-[11.5px] text-white/70 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed inline-flex items-center gap-1"
                      >
                        <Copy className="h-3 w-3" /> Copy
                      </button>
                      {check && status === "pending" && leftMs(check.created_at) > 0 && (
                        <button
                          onClick={() => void runCheck(check.id)}
                          disabled={!!busy}
                          className="rounded-md bg-gradient-to-r from-[#2196f3] to-[#5ac8fa] px-3 py-1 text-[11.5px] font-semibold text-white hover:brightness-110 disabled:opacity-50 inline-flex items-center gap-1"
                        >
                          {busy === check.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null} CHECK
                          <span className="font-mono opacity-80">{fmtLeft(leftMs(check.created_at))}</span>
                        </button>
                      )}
                      {check && status === "pending" && leftMs(check.created_at) === 0 && (
                        <span className="rounded-md border border-[#c62828]/40 bg-[#c62828]/10 px-2.5 py-1 text-[11.5px] font-semibold text-[#ff8a80]">
                          Time expired
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {pairs.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-white/40">No card data in this order</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[12px] text-[#777]">
        Only refund cards show a CHECK button, and only for 2 minutes after the purchase. Checking always costs the
        per-card fee: DEAD is refunded to your balance, LIVE stays charged. After 2 minutes the button turns into
        “Time expired” and no refund is possible. The stand-alone Checker page only shows LIVE/DEAD — it never refunds.
      </p>
    </div>
  );
};

export default Orders;
