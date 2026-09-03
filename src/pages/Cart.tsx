import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import Seo from "@/components/Seo";
import { toast } from "sonner";
import { Trash2, Loader2 } from "lucide-react";
import { getCart, removeFromCart, clearCart, onCartChange, type CartLine } from "@/lib/cart";
import { purchaseProduct, listChecksForOrders, type CardCheck } from "@/lib/store";
import { useAuth } from "@/hooks/useAuth";
import { BrandLogo, detectBrandFromBin, CountryFlagImg, countryCode } from "@/lib/brands";

const Cart = () => {
  const { profile, refresh } = useAuth();
  const nav = useNavigate();
  const [items, setItems] = useState<CartLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<CardCheck[] | null>(null);

  useEffect(() => {
    setItems(getCart());
    return onCartChange(() => setItems(getCart()));
  }, []);

  const total = items.reduce((s, i) => s + Number(i.price), 0);

  const buyNow = async () => {
    if (!items.length) return toast.error("Корзина пуста");
    if (Number(profile?.balance ?? 0) < total)
      return toast.error("Недостаточно средств. Пополните баланс.");
    setBusy(true);
    let ok = 0;
    const failed: string[] = [];
    const orderIds: string[] = [];
    try {
      for (const it of items) {
        try {
          const orderId = await purchaseProduct(it.id, 1);
          if (orderId) orderIds.push(orderId);
          removeFromCart(it.id);
          ok++;
        } catch (e) {
          failed.push(it.bin ?? it.title);
        }
      }
      const results = await listChecksForOrders(orderIds);
      void refresh?.();
      if (ok > 0) {
        toast.success(`Куплено: ${ok}`);
        if (results.length > 0) setChecks(results);
        else nav("/orders");
      }
      if (failed.length) toast.error(`Не удалось: ${failed.join(", ")}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <Seo title="Корзина | Zoru Shop" description="Ваша корзина покупок." path="/cart" />

      <div className="bg-white border border-[#e6e6e6] px-4 py-3 flex flex-wrap items-center gap-3 text-[13px]">
        <span className="font-medium text-[#333]">Корзина</span>
        <span className="text-[#888]">Позиций: {items.length}</span>
        <span className="text-[#888]">Итого: <span className="font-mono text-[#2e7d32]">${total.toFixed(2)}</span></span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => { clearCart(); toast.success("Корзина очищена"); }}
            disabled={!items.length || busy}
            className="h-8 px-4 border border-[#dcdcdc] text-[#555] hover:bg-[#f7f7f7] text-[13px] transition disabled:opacity-50"
          >
            Очистить
          </button>
          <button
            onClick={() => void buyNow()}
            disabled={!items.length || busy}
            className="h-8 px-5 bg-[#e8f5e9] hover:bg-[#dcedc8] border border-[#c8e6c9] text-[#2e7d32] text-[13px] transition disabled:opacity-60 inline-flex items-center gap-2"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Купить сейчас
          </button>
        </div>
      </div>

      <div className="mt-3 border border-[#e6e6e6] bg-white overflow-x-auto -mx-3 sm:mx-0">
        <table className="w-full min-w-[820px] text-[13px] border-collapse">

          <thead>
            <tr className="bg-[#fafafa] text-[#555] text-[12px]">
              {["BIN", "month", "year", "city", "state", "zip", "country", "prices", "base", "operation"].map((h) => (
                <th key={h} className="p-2 text-center font-normal border-b border-[#eee]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className="border-b border-[#f0f0f0] hover:bg-[#fafcff] transition">
                <td className="p-2 text-center font-mono text-[#333]">
                  <span className="inline-flex items-center gap-2">
                    <BrandLogo brand={c.brand || detectBrandFromBin(c.bin ?? "")} className="h-5 w-8 shrink-0" />
                    <span>{c.bin ?? "—"}<span className="text-[#bbb]">••••••</span></span>
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
                <td className="p-2 text-center font-mono">{Number(c.price).toFixed(2)}</td>
                <td className="p-2 text-center text-[11px] text-[#666] max-w-[180px]">
                  <span className="whitespace-pre-line break-words">{c.base ?? "—"}</span>
                </td>
                <td className="p-2 text-center">
                  <button
                    onClick={() => removeFromCart(c.id)}
                    disabled={busy}
                    className="text-[#f56c6c] hover:underline text-[12px] inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" /> Удалить
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={10} className="p-10 text-center text-[#888] text-[13px]">
                  Корзина пуста. <Link to="/shop" className="text-[#2196f3] hover:underline">Перейти в магазин</Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
};

export default Cart;
