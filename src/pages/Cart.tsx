import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import Seo from "@/components/Seo";
import { toast } from "sonner";
import { Trash2, Loader2, ShieldCheck, ShieldOff, Radar, Sparkles, ShoppingCart, Wallet, CreditCard } from "lucide-react";
import { PageHero, StatCard } from "@/components/PageHero";
import { getCart, removeFromCart, clearCart, onCartChange, type CartLine } from "@/lib/cart";
import { purchaseProduct, listChecksForOrders, listPendingChecks, runCardChecks, type CardCheck } from "@/lib/store";
import { useAuth } from "@/hooks/useAuth";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { publicBase } from "@/lib/baseLabel";
import { BrandLogo, detectBrandFromBin, CountryFlagImg, countryCode } from "@/lib/brands";

const Cart = () => {
  const { profile, refresh } = useAuth();
  const settings = useSiteSettings();
  const checkFee = Number(settings.check_fee ?? 0.03);
  const nav = useNavigate();
  const [items, setItems] = useState<CartLine[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<CardCheck[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [pending, setPending] = useState<CardCheck[]>([]);

  const loadPending = async () => {
    try { setPending(await listPendingChecks()); } catch { /* ignore */ }
  };
  useEffect(() => { void loadPending(); }, []);

  useEffect(() => {
    const sync = () => {
      const next = getCart();
      setItems(next);
      setSelected((prev) => {
        const ids = new Set(next.map((n) => n.id));
        const kept = prev.filter((id) => ids.has(id));
        // default: everything selected
        return prev.length === 0 ? next.map((n) => n.id) : kept;
      });
    };
    sync();
    return onCartChange(sync);
  }, []);

  const chosen = useMemo(
    () => items.filter((i) => selected.includes(i.id)),
    [items, selected],
  );
  const total = chosen.reduce((s, i) => s + Number(i.price), 0);
  const refundables = useMemo(() => chosen.filter((i) => i.refundable), [chosen]);
  const fees = refundables.length * checkFee;
  const allSelected = items.length > 0 && chosen.length === items.length;

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleAll = () => setSelected(allSelected ? [] : items.map((i) => i.id));

  const buyNow = async () => {
    if (!chosen.length) return toast.error("Select at least one card");
    const spendable = Number(profile?.balance ?? 0) + Number(profile?.bonus_balance ?? 0);
    if (spendable < total + fees) return toast.error("Insufficient funds. Please top up your balance.");
    setBusy(true);
    let ok = 0;
    const failed: string[] = [];
    let hadRefundable = false;
    try {
      for (const it of chosen) {
        try {
          await purchaseProduct(it.id, 1);
          if (it.refundable) hadRefundable = true;
          removeFromCart(it.id);
          ok++;
        } catch {
          failed.push(it.bin ?? it.title);
        }
      }
      void refresh?.();
      await loadPending();
      if (ok > 0) {
        toast.success(
          hadRefundable
            ? `Purchased: ${ok}. Refund cards are ready — press "Check cards" to run the checker.`
            : `Purchased: ${ok}`,
        );
        if (!hadRefundable) nav("/orders");
      }
      if (failed.length) toast.error(`Failed: ${failed.join(", ")}`);
    } finally {
      setBusy(false);
    }
  };

  /** Manual checker — only refund cards, started by the buyer. */
  const runChecker = async () => {
    if (!pending.length) return toast.error("No refund cards waiting for a check");
    const orderIds = [...new Set(pending.map((p) => p.order_id).filter(Boolean) as string[])];
    setScanning(true);
    try {
      await runCardChecks(orderIds);
      await new Promise((r) => setTimeout(r, 3200));
      const results = await listChecksForOrders(orderIds);
      void refresh?.();
      await loadPending();
      setScanning(false);
      setChecks(results.filter((r) => r.status !== "pending"));
    } catch (e) {
      setScanning(false);
      toast.error(e instanceof Error ? e.message : "Check failed");
    } finally {
      setScanning(false);
    }
  };


  return (
    <AppShell>
      <Seo title="Cart | Zoru Shop" description="Your shopping cart." path="/cart" />

      <PageHero
        eyebrow="Checkout"
        eyebrowIcon={ShoppingCart}
        title="Your"
        highlight="cart"
        description={`Only refund cards can be checked — the $${checkFee.toFixed(2)} per-card fee is charged at purchase and you start the checker yourself with the "Check cards" button. DEAD cards are refunded to your main balance instantly.`}
      />

      <div className="grid gap-3 sm:grid-cols-3 mb-4">
        <StatCard label="Selected cards" icon={CreditCard} tone="blue" value={chosen.length} hint={`${items.length} in cart`} />
        <StatCard label="Order total" icon={ShoppingCart} tone="green" value={`$${(total + fees).toFixed(2)}`} hint={`cards $${total.toFixed(2)} + checking $${fees.toFixed(2)}`} />
        <StatCard label="Available balance" icon={Wallet} tone="amber" value={`$${(Number(profile?.balance ?? 0) + Number(profile?.bonus_balance ?? 0)).toFixed(2)}`} hint="bonus is spent first" />
      </div>

      {pending.length > 0 && (
        <div className="mb-4 rounded-xl border border-[#2196f3]/30 bg-gradient-to-r from-[#0f1a33] via-[#132244] to-[#0f1a33] px-4 py-3.5 flex flex-wrap items-center gap-3 shadow-[0_10px_30px_rgba(15,26,51,0.35)]">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#2196f3]/15 border border-[#2196f3]/30">
            <Radar className="h-4.5 w-4.5 text-[#5ac8fa]" />
          </span>
          <div className="min-w-[200px]">
            <div className="text-[13.5px] font-semibold text-white">
              {pending.length} refund card{pending.length === 1 ? "" : "s"} waiting for a check
            </div>
            <div className="text-[12px] text-white/60">
              Checking is manual — press the button to open the checker. DEAD cards are refunded instantly.
            </div>
          </div>
          <button
            onClick={() => void runChecker()}
            disabled={scanning}
            className="ml-auto h-9 px-5 rounded-md bg-gradient-to-r from-[#2196f3] to-[#5ac8fa] text-white text-[13px] font-semibold shadow-[0_6px_18px_rgba(33,150,243,0.4)] hover:brightness-110 transition disabled:opacity-60 inline-flex items-center gap-2"
          >
            {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radar className="h-3.5 w-3.5" />}
            Check cards
          </button>
        </div>
      )}


      <div className="rounded-xl border border-[#e6e6e6] bg-gradient-to-r from-white via-[#fbfcff] to-[#f4f7ff] px-4 py-3 flex flex-wrap items-center gap-3 text-[13px] shadow-[0_2px_10px_rgba(20,30,60,0.06)]">
        <span className="font-semibold text-[#1f2d3d]">Cart</span>
        <span className="text-[#888]">Items: {items.length}</span>
        <span className="text-[#888]">Selected: {chosen.length}</span>
        <span className="text-[#888]">
          Cards: <span className="font-mono text-[#2e7d32]">${total.toFixed(2)}</span>
        </span>
        <span className="text-[#888]">
          Checking: <span className="font-mono text-[#f56c6c]">${fees.toFixed(2)}</span>{" "}
          ({refundables.length} × ${checkFee.toFixed(2)}, refund cards only)
        </span>
        <span className="text-[#1f2d3d] font-medium">
          Total: <span className="font-mono">${(total + fees).toFixed(2)}</span>
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={toggleAll}
            disabled={!items.length || busy}
            className="h-8 px-4 rounded-md border border-[#dcdcdc] text-[#555] hover:bg-[#f7f7f7] text-[13px] transition disabled:opacity-50"
          >
            {allSelected ? "Deselect all" : "Select all"}
          </button>
          <button
            onClick={() => { clearCart(); setSelected([]); toast.success("Cart cleared"); }}
            disabled={!items.length || busy}
            className="h-8 px-4 rounded-md border border-[#dcdcdc] text-[#555] hover:bg-[#f7f7f7] text-[13px] transition disabled:opacity-50"
          >
            Clear
          </button>
          <button
            onClick={() => void buyNow()}
            disabled={!chosen.length || busy}
            className="h-8 px-5 rounded-md bg-gradient-to-r from-[#2e7d32] to-[#43a047] text-white text-[13px] shadow-[0_4px_14px_rgba(46,125,50,0.35)] hover:brightness-110 transition disabled:opacity-60 inline-flex items-center gap-2"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radar className="h-3.5 w-3.5" />}
            Buy {chosen.length || ""} now
          </button>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-[#e6e6e6] bg-white overflow-x-auto -mx-3 sm:mx-0 shadow-[0_2px_10px_rgba(20,30,60,0.05)]">
        <table className="w-full min-w-[900px] text-[13px] border-collapse">
          <thead>
            <tr className="bg-gradient-to-r from-[#f7f9fc] to-[#eef2fa] text-[#555] text-[12px]">
              <th className="p-2 text-center font-normal border-b border-[#eee] w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={!items.length || busy}
                  className="h-3.5 w-3.5 accent-[#2e7d32] cursor-pointer"
                  aria-label="Select all cards"
                />
              </th>
              {["BIN", "month", "year", "city", "state", "zip", "country", "refund", "price", "base", "action"].map((h) => (
                <th key={h} className="p-2 text-center font-normal border-b border-[#eee]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((c) => {
              const isOn = selected.includes(c.id);
              return (
              <tr
                key={c.id}
                className={`border-b border-[#f0f0f0] transition ${isOn ? "bg-[#f4fbf5]" : "hover:bg-[#fafcff]"}`}
              >
                <td className="p-2 text-center">
                  <input
                    type="checkbox"
                    checked={isOn}
                    onChange={() => toggle(c.id)}
                    disabled={busy}
                    className="h-3.5 w-3.5 accent-[#2e7d32] cursor-pointer"
                    aria-label={`Select card ${c.bin ?? c.title}`}
                  />
                </td>
                <td className="p-2 text-center font-mono text-[#333]">
                  <span className="inline-flex items-center gap-2">
                    <BrandLogo brand={c.brand || detectBrandFromBin(c.bin ?? "")} className="h-5 w-8 shrink-0" />
                    <span>{c.bin ?? "—"}<span className="text-[#bbb]">••••</span>{c.last_digits ?? "••"}</span>
                  </span>
                </td>
                <td className="p-2 text-center font-mono">{c.exp_month ?? "—"}</td>
                <td className="p-2 text-center font-mono">{c.exp_year ?? "—"}</td>
                <td className="p-2 text-center max-w-[140px] truncate" title={c.city ?? ""}>{c.city ?? "—"}</td>
                <td className="p-2 text-center">{c.state ?? "—"}</td>
                <td className="p-2 text-center font-mono">{c.zip ?? "—"}</td>
                <td className="p-2 text-center">
                  {c.country ? (
                    <span className="inline-flex items-center gap-1.5">
                      <CountryFlagImg code={c.country} className="h-3.5 w-5" />
                      <span>{countryCode(c.country)}</span>
                    </span>
                  ) : "—"}
                </td>
                <td className="p-2 text-center">
                  {c.refundable ? (
                    <div className="inline-flex flex-col items-center gap-1">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f5e9] text-[#2e7d32] border border-[#c8e6c9] px-2 py-0.5 text-[11px]">
                        <ShieldCheck className="h-3 w-3" /> refund
                      </span>
                      <button
                        onClick={() => void runChecker()}
                        disabled={scanning || !pending.length}
                        title={pending.length ? "Run live/dead check" : "Buy this card first — then the checker unlocks"}
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white bg-gradient-to-r from-[#2196f3] to-[#5ac8fa] shadow-[0_4px_12px_rgba(33,150,243,0.35)] hover:brightness-110 transition disabled:opacity-45 disabled:shadow-none"
                      >
                        {scanning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Radar className="h-3 w-3" />} Check
                      </button>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#f6f6f6] text-[#999] border border-[#e6e6e6] px-2 py-0.5 text-[11px]">
                      <ShieldOff className="h-3 w-3" /> no
                    </span>
                  )}
                </td>

                <td className="p-2 text-center font-mono">{Number(c.price).toFixed(2)}</td>
                <td className="p-2 text-center text-[11px] text-[#666] max-w-[180px]">
                  <span className="whitespace-pre-line break-words">{publicBase(c.base) || "—"}</span>
                </td>
                <td className="p-2 text-center">
                  <button
                    onClick={() => removeFromCart(c.id)}
                    disabled={busy}
                    className="text-[#f56c6c] hover:underline text-[12px] inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                </td>
              </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={12} className="p-10 text-center text-[#888] text-[13px]">
                  Your cart is empty. <Link to="/shop" className="text-[#2196f3] hover:underline">Go to shop</Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[12px] text-[#777]">
        Checking is <b>manual and only for refund cards</b> — the ${checkFee.toFixed(2)} per-card fee is taken at purchase, then you
        start the checker from the "Check cards" panel above. DEAD cards are instantly refunded to your main balance.
        Non-refund cards are never checked and never refunded.
      </p>

      {scanning && <ScanOverlay count={pending.length} />}
      {checks && <CheckResultDialog checks={checks} onClose={() => { setChecks(null); void loadPending(); }} />}
    </AppShell>
  );
};


const SCAN_STEPS = [
  "Opening secure checker session…",
  "Connecting to gateway node…",
  "Authorizing refund cards…",
  "Reading live / dead response…",
  "Finalizing results…",
];

const ScanOverlay = ({ count }: { count: number }) => {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, SCAN_STEPS.length - 1)), 700);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#060b18]/80 backdrop-blur-xl p-4">
      <div className="relative w-full max-w-md rounded-3xl border border-white/15 bg-white/[0.06] p-8 text-center shadow-[0_30px_80px_rgba(0,0,0,0.65)] overflow-hidden backdrop-blur-2xl">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-[#2196f3]/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 right-0 h-48 w-48 rounded-full bg-[#43a047]/25 blur-3xl" />

        <div className="relative mx-auto h-24 w-24">
          <span className="absolute inset-0 rounded-full border border-white/20 animate-ping" />
          <span className="absolute inset-2 rounded-full border border-[#5ac8fa]/40 animate-ping [animation-delay:400ms]" />
          <span className="absolute inset-4 rounded-full bg-white/10 backdrop-blur-md" />
          <span className="absolute inset-0 grid place-items-center">
            <Radar className="h-9 w-9 text-[#5ac8fa] animate-spin [animation-duration:2.4s]" />
          </span>
        </div>

        <div className="relative mt-6 text-white text-[15.5px] font-semibold tracking-wide">Checking cards…</div>
        <div className="relative mt-1 text-[12.5px] text-white/65">
          Live check running on {count} refund card{count === 1 ? "" : "s"}. Please don't close this window.
        </div>

        <div className="relative mt-5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-[#2196f3] via-[#5ac8fa] to-[#43a047]" style={{ animation: "cartScan 1.4s ease-in-out infinite" }} />
        </div>

        <ul className="relative mt-5 space-y-1.5 text-left">
          {SCAN_STEPS.map((s, i) => (
            <li
              key={s}
              className={`flex items-center gap-2 text-[12px] transition ${i <= step ? "text-white/85" : "text-white/30"}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${i < step ? "bg-[#7ee08a]" : i === step ? "bg-[#5ac8fa] animate-pulse" : "bg-white/25"}`}
              />
              {s}
            </li>
          ))}
        </ul>
        <style>{`@keyframes cartScan{0%{transform:translateX(-100%)}100%{transform:translateX(320%)}}`}</style>
      </div>
    </div>
  );
};


const CheckResultDialog = ({ checks, onClose }: { checks: CardCheck[]; onClose: () => void }) => {
  const live = checks.filter((c) => c.status === "live");
  const dead = checks.filter((c) => c.status === "dead");
  const refunded = dead.reduce((s, c) => s + Number(c.refunded), 0);
  const rate = checks.length ? Math.round((live.length / checks.length) * 100) : 0;
  const fee = checks.reduce((s, c) => s + Number(c.fee ?? 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#060b18]/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-[#101a33] to-[#0a1122] shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
        <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between">
          <span className="text-[14px] font-semibold text-white inline-flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#f9a825]" /> Check result (refund cards)
          </span>
          <span className="rounded-full bg-[#2e7d32]/20 text-[#7ee08a] border border-[#2e7d32]/40 px-2.5 py-0.5 text-[11.5px] font-mono">
            LIVE {rate}%
          </span>
        </div>

        <div className="grid grid-cols-3 text-center text-[13px] border-b border-white/10">
          <div className="p-3.5 border-r border-white/5">
            <div className="text-[11px] text-white/50">Checked</div>
            <div className="font-mono text-white text-lg">{checks.length}</div>
          </div>
          <div className="p-3.5 border-r border-white/5">
            <div className="text-[11px] text-white/50">Live / Dead</div>
            <div className="font-mono text-lg">
              <span className="text-[#7ee08a]">{live.length}</span>
              <span className="text-white/30"> / </span>
              <span className="text-[#ff8a80]">{dead.length}</span>
            </div>
          </div>
          <div className="p-3.5">
            <div className="text-[11px] text-white/50">Refunded</div>
            <div className="font-mono text-[#7ee08a] text-lg">${refunded.toFixed(2)}</div>
          </div>
        </div>

        <div className="max-h-[280px] overflow-y-auto">
          <table className="w-full text-[12px]">
            <tbody>
              {checks.map((c) => (
                <tr key={c.id} className="border-b border-white/5">
                  <td className="p-2.5 font-mono text-white/85">
                    {c.bin ?? "—"}<span className="text-white/30">••••</span>{c.last_digits ?? ""}
                  </td>
                  <td className="p-2.5 text-center font-mono text-white/60">${Number(c.price).toFixed(2)}</td>
                  <td className="p-2.5 text-center">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold border ${
                        c.status === "live"
                          ? "bg-[#2e7d32]/20 text-[#7ee08a] border-[#2e7d32]/40"
                          : "bg-[#c62828]/20 text-[#ff8a80] border-[#c62828]/40"
                      }`}
                    >
                      {c.status === "live" ? "LIVE" : "DEAD"}
                    </span>
                  </td>
                  <td className="p-2.5 text-right font-mono text-[#7ee08a]">
                    {c.status === "dead" ? `+$${Number(c.refunded).toFixed(2)}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3.5 border-t border-white/10 flex items-center justify-between gap-3">
          <span className="text-[11px] text-white/50">
            DEAD cards were refunded to your main balance. Checking fee: ${fee.toFixed(2)}
          </span>
          <button
            onClick={onClose}
            className="h-8 px-5 rounded-md bg-gradient-to-r from-[#2e7d32] to-[#43a047] text-white text-[13px] shadow-[0_4px_14px_rgba(46,125,50,0.35)] hover:brightness-110"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default Cart;
