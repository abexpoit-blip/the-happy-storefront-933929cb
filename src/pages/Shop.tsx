import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import Seo from "@/components/Seo";
import { toast } from "sonner";
import { Search, RotateCcw, Loader2, Copy, CheckCircle2, X, ShoppingCart, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listProducts, type Product } from "@/lib/store";
import { addToCart, cartCount, onCartChange } from "@/lib/cart";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { BrandLogo, detectBrandFromBin, CountryFlagImg, countryCode } from "@/lib/brands";

const PAGE_SIZES = [10, 20, 50, 100];

const Shop = () => {
  const { profile } = useAuth();
  const [all, setAll] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searched, setSearched] = useState(true);
  const [buying] = useState(false);
  const [delivered, setDelivered] = useState<{ title: string; content: string } | null>(null);

  const [bin, setBin] = useState("");
  const [base, setBase] = useState("all");
  const [country, setCountry] = useState("");
  const [zip, setZip] = useState("");
  const [refund, setRefund] = useState<"all" | "yes" | "no">("all");
  const [lastBin, setLastBin] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [q, setQ] = useState({ bin: "", base: "all", country: "", zip: "", refund: "all" as "all" | "yes" | "no" });

  const lastLoad = useRef(0);
  const load = async (force = false) => {
    if (!force && Date.now() - lastLoad.current < 60_000) return;
    lastLoad.current = Date.now();
    setLoading(true);
    try {
      setAll(await listProducts());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка загрузки");
      setAll([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(true);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const bases = useMemo(
    () => [...new Set(all.map((p) => p.base).filter(Boolean) as string[])].sort(),
    [all],
  );

  const cards = useMemo(() => {
    if (!searched) return [];
    return all.filter((p) => {
      if (q.bin && !(p.bin ?? "").startsWith(q.bin)) return false;
      if (q.base !== "all" && (p.base ?? "") !== q.base) return false;
      if (q.country && !(p.country ?? "").toUpperCase().includes(q.country.toUpperCase())) return false;
      if (q.zip && !(p.zip ?? "").startsWith(q.zip)) return false;
      if (q.refund === "yes" && !p.refundable) return false;
      if (q.refund === "no" && p.refundable) return false;
      return true;
    });
  }, [all, q, searched]);

  const [perPage, setPerPage] = useState(10);
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(cards.length / perPage));
  useEffect(() => { setPage(1); }, [q, all.length, perPage]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);
  const pageCards = useMemo(
    () => cards.slice((page - 1) * perPage, page * perPage),
    [cards, page, perPage],
  );

  const runSearch = () => {
    setQ({ bin, base, country, zip, refund });
    setLastBin(bin);
    setSearched(true);
    setSelected(new Set());
  };

  const reset = () => {
    setBin(""); setBase("all"); setCountry(""); setZip(""); setRefund("all");
    setQ({ bin: "", base: "all", country: "", zip: "", refund: "all" });
    setSearched(true); setLastBin(""); setSelected(new Set());
    void load(true);
  };

  useEffect(() => {
    if (bin.length >= 6) {
      const t = setTimeout(() => { setQ({ bin, base, country, zip, refund }); setLastBin(bin); setSearched(true); }, 350);
      return () => clearTimeout(t);
    }
  }, [bin]); // eslint-disable-line react-hooks/exhaustive-deps

  const [count, setCount] = useState(0);
  useEffect(() => {
    setCount(cartCount());
    return onCartChange(() => setCount(cartCount()));
  }, []);

  const toggle = (id: string) =>
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () =>
    setSelected((s) => (s.size === pageCards.length ? new Set() : new Set(pageCards.map((c) => c.id))));
  const selectAllResults = () => setSelected(new Set(cards.map((c) => c.id)));

  const selectedTotal = useMemo(
    () => cards.filter((c) => selected.has(c.id)).reduce((s, c) => s + Number(c.price), 0),
    [cards, selected],
  );
  const resultsTotal = useMemo(
    () => cards.reduce((s, c) => s + Number(c.price), 0),
    [cards],
  );

  const buyMany = (ids: string[]) => {
    if (!ids.length) return toast.error("Выберите карты");
    const items = all.filter((p) => ids.includes(p.id));
    const added = addToCart(items);
    setSelected(new Set());
    if (added === 0) toast.info("Уже в корзине");
    else toast.success(`Добавлено в корзину: ${added}`);
  };

  const noResults = !loading && searched && cards.length === 0;

  return (
    <AppShell>
      <Seo
        title="Магазин | Zoru Shop"
        description="Живой сток. Поиск по BIN, базе, стране, ZIP и возврату."
        path="/shop"
      />

      {/* FILTER BAR */}
      <div className="rounded-xl bg-white border border-[#e6e6e6] shadow-[0_10px_30px_-18px_rgba(31,45,61,0.55)] px-3 sm:px-4 py-3 grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center gap-x-6 gap-y-3 text-[13px]">
        <Field label="BIN">
          <input
            value={bin}
            onChange={(e) => setBin(e.target.value.replace(/\D/g, "").slice(0, 16))}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Please enter the card number"
            className="h-8 w-full min-w-0 lg:w-[180px] rounded-md border border-[#dcdcdc] px-2 text-[13px] font-mono outline-none focus:border-[#2196f3] focus:ring-2 focus:ring-[#2196f3]/15 transition"
          />
        </Field>
        <Field label="BASE">
          <select
            value={base}
            onChange={(e) => setBase(e.target.value)}
            className="h-8 w-full min-w-0 lg:w-[160px] rounded-md border border-[#dcdcdc] px-2 text-[13px] outline-none bg-white focus:border-[#2196f3] focus:ring-2 focus:ring-[#2196f3]/15 transition"
          >
            <option value="all">base</option>
            {bases.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </Field>
        <Field label="REFUND">
          <select
            value={refund}
            onChange={(e) => setRefund(e.target.value as "all" | "yes" | "no")}
            className="h-8 w-full min-w-0 lg:w-[120px] rounded-md border border-[#dcdcdc] px-2 text-[13px] outline-none bg-white focus:border-[#2196f3] focus:ring-2 focus:ring-[#2196f3]/15 transition"
          >
            <option value="all">all</option>
            <option value="yes">refund: YES</option>
            <option value="no">refund: NO</option>
          </select>
        </Field>
        <Field label="COUNTRY">
          <input
            value={country}
            onChange={(e) => setCountry(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Please enter country"
            className="h-8 w-full min-w-0 lg:w-[150px] rounded-md border border-[#dcdcdc] px-2 text-[13px] outline-none focus:border-[#2196f3] focus:ring-2 focus:ring-[#2196f3]/15 transition"
          />
        </Field>
        <Field label="ZIP">
          <input
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Please enter your zip code"
            className="h-8 w-full min-w-0 lg:w-[140px] rounded-md border border-[#dcdcdc] px-2 text-[13px] outline-none focus:border-[#2196f3] focus:ring-2 focus:ring-[#2196f3]/15 transition"
          />
        </Field>
        <div className="flex items-center gap-2 sm:col-span-2 lg:col-auto lg:ml-auto">
          <button
            onClick={runSearch}
            className="h-8 flex-1 lg:flex-none px-4 rounded-md bg-gradient-to-b from-[#42a5f5] to-[#1976d2] hover:from-[#2196f3] hover:to-[#1565c0] text-white text-[13px] inline-flex items-center justify-center gap-1.5 shadow-[0_6px_14px_-6px_rgba(25,118,210,0.9)] active:translate-y-px transition"
          >
            <Search className="h-3.5 w-3.5" /> search
          </button>
          <button
            onClick={reset}
            className="h-8 flex-1 lg:flex-none px-4 rounded-md border border-[#dcdcdc] bg-gradient-to-b from-white to-[#f4f6f8] text-[#555] hover:border-[#bbb] text-[13px] inline-flex items-center justify-center gap-1.5 active:translate-y-px transition"
          >
            <RotateCcw className="h-3.5 w-3.5" /> reset
          </button>
        </div>
      </div>

      {/* ACTION BAR */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => buyMany(Array.from(selected))}
            disabled={selected.size === 0 || buying}
            className="h-8 px-3 rounded-md bg-gradient-to-b from-[#66bb6a] to-[#2e7d32] text-white text-[12px] inline-flex items-center gap-1.5 shadow-[0_6px_14px_-7px_rgba(46,125,50,0.9)] active:translate-y-px transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            Add selected{selected.size > 0 ? ` (${selected.size})` : ""}
          </button>
          <button
            onClick={selectAllResults}
            disabled={cards.length === 0}
            className="h-8 px-3 rounded-md border border-[#dcdcdc] bg-gradient-to-b from-white to-[#f4f6f8] text-[#37474f] text-[12px] hover:border-[#2196f3] active:translate-y-px transition disabled:opacity-50"
          >
            Select all results ({cards.length})
          </button>
          <button
            onClick={() => buyMany(cards.map((c) => c.id))}
            disabled={cards.length === 0 || buying}
            className="h-8 px-3 rounded-md bg-gradient-to-b from-[#455a64] to-[#1f2d3d] text-white text-[12px] shadow-[0_6px_14px_-7px_rgba(31,45,61,0.9)] active:translate-y-px transition disabled:opacity-50"
          >
            Buy all · {resultsTotal.toFixed(2)}$
          </button>
          {selected.size > 0 && (
            <span className="text-[12px] font-semibold text-[#2e7d32] bg-[#e8f5e9] border border-[#c8e6c9] rounded-md px-2.5 h-8 inline-flex items-center">
              Selected total: {selectedTotal.toFixed(2)}$
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[12px] text-[#777]">
          <label className="inline-flex items-center gap-1.5">
            Rows
            <select
              value={perPage}
              onChange={(e) => setPerPage(Number(e.target.value))}
              className="h-8 rounded-md border border-[#dcdcdc] bg-white px-2 text-[12px] outline-none focus:border-[#2196f3]"
            >
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          {cards.length > 0 ? <span>{cards.length} results · стр. {page}/{totalPages}</span> : null}
          <Link to="/cart" className="text-[#2196f3] hover:underline">
            Корзина{count > 0 ? ` (${count})` : ""}
          </Link>
          {profile ? (
            <span className="hidden sm:inline font-semibold text-[#1f2d3d]">
              Balance: {Number(profile.balance ?? 0).toFixed(2)}$
              {Number(profile.bonus_balance ?? 0) > 0 ? (
                <span className="ml-2 text-[#f9a825]">Bonus: {Number(profile.bonus_balance ?? 0).toFixed(2)}$</span>
              ) : null}
            </span>
          ) : null}
        </div>
      </div>

      {/* TABLE */}
      <div className="mt-3 rounded-xl border border-[#e6e6e6] bg-white overflow-x-auto shadow-[0_14px_40px_-26px_rgba(31,45,61,0.6)] -mx-3 sm:mx-0">
        <table className="w-full min-w-[1040px] text-[13px] border-collapse">
          <thead>
            <tr className="bg-gradient-to-b from-[#f7f9fb] to-[#eceff1] text-[#455a64] text-[12px]">
              <th className="p-2 w-8 border-b border-[#e0e0e0]">
                <input
                  type="checkbox"
                  checked={pageCards.length > 0 && selected.size === pageCards.length}
                  onChange={toggleAll}
                  className="cursor-pointer accent-[#2196f3]"
                />
              </th>
              {["CARD","refund","month","year","city","state","zip","country","tel","email","prices","base","operation"].map((h) => (
                <th key={h} className="p-2 text-center font-semibold uppercase tracking-wide border-b border-[#e0e0e0]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-[#f0f0f0]">
                <td colSpan={14} className="p-3"><div className="h-4 rounded bg-[#f1f4f6] animate-pulse" /></td>
              </tr>
            ))}
            {!loading && pageCards.map((c) => (
              <tr key={c.id} className="border-b border-[#f2f4f6] odd:bg-white even:bg-[#fcfdfe] hover:bg-[#f2f8ff] transition">
                <td className="p-2 text-center">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                    className="cursor-pointer accent-[#2196f3]"
                  />
                </td>
                <td className="p-2 text-center font-mono text-[#263238]">
                  <span className="inline-flex items-center gap-2">
                    <BrandLogo brand={c.brand || detectBrandFromBin(c.bin ?? "")} className="h-5 w-8 shrink-0 drop-shadow-sm" />
                    <span>
                      {c.bin ?? "—"}
                      <span className="text-[#bbb]">••••</span>
                      <span className="text-[#1f2d3d] font-semibold">{c.last_digits ?? "•••"}</span>
                    </span>
                  </span>
                </td>
                <td className="p-2 text-center">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    c.refundable
                      ? "bg-[#e8f5e9] text-[#2e7d32] border border-[#c8e6c9]"
                      : "bg-[#fdecea] text-[#c62828] border border-[#f5c6c2]"
                  }`}>
                    {c.refundable ? "YES" : "NO"}
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
                <td className="p-2 text-center">{c.has_phone ? "yes" : "no"}</td>
                <td className="p-2 text-center">{c.has_email ? "yes" : "no"}</td>
                <td className="p-2 text-center font-mono font-semibold text-[#1f2d3d]">{Number(c.price).toFixed(2)}</td>
                <td className="p-2 text-center text-[11px] text-[#666] max-w-[180px]">
                  <span className="whitespace-pre-line break-words">{c.base ?? "—"}</span>
                </td>
                <td className="p-2 text-center">
                  {c.delivery_type === "key" && c.stock <= 0 ? (
                    <span className="text-[#bbb] text-[12px]">out of stock</span>
                  ) : (
                    <button
                      onClick={() => buyMany([c.id])}
                      disabled={buying}
                      className="h-7 px-2.5 rounded-md border border-[#bbdefb] bg-gradient-to-b from-[#e3f2fd] to-[#d3e8fb] text-[#1565c0] text-[12px] hover:border-[#2196f3] active:translate-y-px transition disabled:opacity-50"
                    >
                      Add to cart
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!loading && noResults && (
              <tr>
                <td colSpan={14} className="p-10 text-center text-[#888] text-[13px]">
                  {lastBin
                    ? <>No cards match BIN prefix <code className="px-1 bg-[#f5f5f5] font-mono">{lastBin}</code>.</>
                    : "No cards match your filters."}
                  <div className="mt-2">
                    <button onClick={reset} className="text-[#2196f3] hover:underline">Clear search</button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* PAGINATION */}
      {!loading && cards.length > 0 && (
        <nav aria-label="Shop pages" className="mt-4 mb-2 flex w-full flex-wrap items-center justify-center gap-2 text-[13px]">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="h-9 min-w-[92px] border-[#dcdcdc] bg-white text-[#37474f] hover:bg-[#f2f8ff]"
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          {pageNumbers(page, totalPages).map((n, i) =>
            n === "…" ? (
              <span key={`e${i}`} className="px-2 text-[#aaa]">…</span>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="icon"
                key={n}
                onClick={() => setPage(n as number)}
                aria-current={n === page ? "page" : undefined}
                aria-label={`Page ${n}`}
                className={`h-9 w-9 rounded-md border transition ${
                  n === page
                    ? "border-[#1976d2] bg-gradient-to-b from-[#42a5f5] to-[#1976d2] text-white shadow-[0_4px_10px_-5px_rgba(25,118,210,0.9)]"
                    : "border-[#dcdcdc] bg-white text-[#555] hover:bg-[#f7f7f7]"
                }`}
              >
                {n}
              </Button>
            ),
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="h-9 min-w-[92px] border-[#dcdcdc] bg-white text-[#37474f] hover:bg-[#f2f8ff]"
          >
            Next <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="basis-full text-center text-[12px] text-[#777]">
            Page {page} of {totalPages} · {cards.length} cards
          </span>
        </nav>
      )}

      {buying && (
        <div className="mt-3 text-[12px] text-[#888] inline-flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Обработка…
        </div>
      )}

      {delivered && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDelivered(null)}>
          <div className="w-full max-w-lg rounded-xl bg-white border border-[#e6e6e6] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[#f0f0f0] px-4 py-3">
              <div className="flex items-center gap-2 text-[14px] text-[#303133]">
                <CheckCircle2 className="h-4 w-4 text-[#4caf50]" /> {delivered.title}
              </div>
              <button onClick={() => setDelivered(null)} className="text-[#909399] hover:text-[#303133]"><X className="h-4 w-4" /></button>
            </div>
            <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap break-all p-4 font-mono text-[12px] text-[#303133]">{delivered.content}</pre>
            <div className="border-t border-[#f0f0f0] px-4 py-3 text-right">
              <button
                onClick={() => { void navigator.clipboard.writeText(delivered.content); toast.success("Скопировано"); }}
                className="h-8 px-4 rounded-md bg-gradient-to-b from-[#42a5f5] to-[#1976d2] text-white text-[13px] inline-flex items-center gap-1.5"
              >
                <Copy className="h-3.5 w-3.5" /> Копировать
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
};

function pageNumbers(page: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(total - 1, page + 1);
  if (start > 2) out.push("…");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push("…");
  out.push(total);
  return out;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[#888] text-[11px] tracking-wider shrink-0 w-[62px] lg:w-auto">{label}</span>
      {children}
    </div>
  );
}

export default Shop;
