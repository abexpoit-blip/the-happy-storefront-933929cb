import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import Seo from "@/components/Seo";
import { toast } from "sonner";
import { Trash2, Loader2, ShieldCheck, ShieldOff, ShoppingCart, Wallet, CreditCard } from "lucide-react";
import { PageHero, StatCard } from "@/components/PageHero";
import { getCart, removeFromCart, clearCart, onCartChange, type CartLine } from "@/lib/cart";
import { purchaseProduct } from "@/lib/store";
import { useAuth } from "@/hooks/useAuth";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { publicBase } from "@/lib/baseLabel";
import { BrandLogo, detectBrandFromBin, CountryFlagImg, countryCode } from "@/lib/brands";

const Cart = () => {
  const { profile, refresh } = useAuth();
  const settings = useSiteSettings();
  const checkFee = Number(settings.check_fee ?? 0.03) || 0.03;
  const nav = useNavigate();
  const [items, setItems] = useState<CartLine[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sync = () => {
      const next = getCart();
      setItems(next);
      setSelected((prev) => {
        const ids = new Set(next.map((n) => n.id));
        const kept = prev.filter((id) => ids.has(id));
        return prev.length === 0 ? next.map((n) => n.id) : kept;
      });
    };
    sync();
    return onCartChange(sync);
  }, []);

  const chosen = useMemo(() => items.filter((i) => selected.includes(i.id)), [items, selected]);
  const total = chosen.reduce((s, i) => s + Number(i.price), 0);
  const refundables = useMemo(() => chosen.filter((i) => i.refundable), [chosen]);
  const allSelected = items.length > 0 && chosen.length === items.length;

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleAll = () => setSelected(allSelected ? [] : items.map((i) => i.id));

  const buyNow = async () => {
    if (!chosen.length) return toast.error("Select at least one card");
    const spendable = Number(profile?.balance ?? 0) + Number(profile?.bonus_balance ?? 0);
    if (spendable < total) return toast.error("Insufficient funds. Please top up your balance.");
    setBusy(true);
    try {
      await purchaseCart(chosen.map((i) => i.id));
      chosen.forEach((i) => removeFromCart(i.id));
      void refresh?.();
      toast.success(`Purchased ${chosen.length} card${chosen.length === 1 ? "" : "s"}. Opening your order…`);
      nav("/orders");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg, { duration: 8000 });
    } finally {
      setBusy(false);
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
        description={`Select the cards you want and buy them. After the purchase you are taken to the order page, where refund cards can be checked for $${checkFee.toFixed(2)} per card.`}
      />

      <div className="grid gap-3 sm:grid-cols-3 mb-4">
        <StatCard label="Selected cards" icon={CreditCard} tone="blue" value={chosen.length} hint={`${items.length} in cart`} />
        <StatCard label="Order total" icon={ShoppingCart} tone="green" value={`$${total.toFixed(2)}`} hint={`${refundables.length} refund card${refundables.length === 1 ? "" : "s"}`} />
        <StatCard label="Balance" icon={Wallet} tone="amber" value={`$${(Number(profile?.balance ?? 0) + Number(profile?.bonus_balance ?? 0)).toFixed(2)}`} hint="bonus balance is spent first" />
      </div>

      <div className="rounded-xl border border-[#e6e6e6] bg-gradient-to-r from-white via-[#fbfcff] to-[#f4f7ff] px-4 py-3 flex flex-wrap items-center gap-3 text-[13px] shadow-[0_2px_10px_rgba(20,30,60,0.06)]">
        <span className="font-semibold text-[#1f2d3d]">Cart</span>
        <span className="text-[#888]">Items: {items.length}</span>
        <span className="text-[#888]">Selected: {chosen.length}</span>
        <span className="text-[#1f2d3d] font-medium">
          Total: <span className="font-mono text-[#2e7d32]">${total.toFixed(2)}</span>
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
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShoppingCart className="h-3.5 w-3.5" />}
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
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f5e9] text-[#2e7d32] border border-[#c8e6c9] px-2 py-0.5 text-[11px]">
                        <ShieldCheck className="h-3 w-3" /> refund
                      </span>
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
        Checking is done on the <Link to="/orders" className="text-[#2196f3] hover:underline">order page</Link> after the purchase —
        only refund cards get a CHECK button, the fee is ${checkFee.toFixed(2)} per card and DEAD cards are refunded to your balance instantly.
      </p>
    </AppShell>
  );
};

export default Cart;
