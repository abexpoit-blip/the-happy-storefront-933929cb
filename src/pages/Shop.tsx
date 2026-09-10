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
import { publicBase } from "@/lib/baseLabel";
import { BrandLogo, detectBrandFromBin, CountryFlagImg, countryCode, countryName } from "@/lib/brands";

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const load = async (force = false) => {
    if (!force && Date.now() - lastLoad.current < 60_000) return;
    lastLoad.current = Date.now();
    setLoading(true);
    // Two silent retries — flaky first requests were showing "try again" to users.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const rows = await listProducts();
        setAll(rows);
        setLoadError(null);
        setLoading(false);
        return;
      } catch (e) {
        if (attempt === 2) {
          const msg = e instanceof Error ? e.message : "Loading error";
          setLoadError(msg);
          toast.error(msg);
        } else {
          await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        }
      }
    }
    setLoading(false);
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
            {bases.map((b) => <option key={b} value={b}>{publicBase(b)}</option>)}
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
          {selected.size > 0 && (
            <span className="text-[12px] font-semibold text-[#2e7d32] bg-[#e8f5e9] border border-[#c8e6c9] rounded-md px-2.5 h-8 inline-flex items-center">
              Selected total: {selectedTotal.toFixed(2)}$
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[13px] text-[#607d8b]">
          <label className="inline-flex items-center gap-1.5">
            Rows
            <select
              value={perPage}
              onChange={(e) => setPerPage(Number(e.target.value))}
              className="h-8 rounded-md border border-[#dcdcdc] bg-white px-2 text-[13px] outline-none focus:border-[#2196f3]"
            >
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          {cards.length > 0 ? (
            <span>{cards.length} results · page {page}/{totalPages} · stock value {resultsTotal.toFixed(2)}$</span>
          ) : null}
          <Link to="/cart" className="text-[#2196f3] hover:underline">
            Cart{count > 0 ? ` (${count})` : ""}
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

      {loadError && !loading && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#ffcdd2] bg-gradient-to-b from-[#fff5f5] to-[#ffe6e4] px-4 py-3 text-[13px] text-[#b71c1c]">
          <span>Could not load the stock: {loadError}</span>
          <button
            onClick={() => void load(true)}
            className="h-8 px-3 rounded-md bg-gradient-to-b from-[#ef5350] to-[#c62828] text-white text-[12px] font-semibold"
          >
            Try again
          </button>
        </div>
      )}

      {/* TABLE */}
      <div className="mt-3 rounded-xl border border-[#e6e6e6] bg-white overflow-x-auto shadow-[0_14px_40px_-26px_rgba(31,45,61,0.6)] -mx-3 sm:mx-0">
        <table className="w-full min-w-[1220px] text-[15px] border-collapse">
          <thead>
            <tr className="bg-gradient-to-b from-[#37474f] to-[#1f2d3d] text-white text-[13px]">
              <th className="p-2 w-8 border-b border-[#e0e0e0]">
                <input
                  type="checkbox"
                  checked={pageCards.length > 0 && selected.size === pageCards.length}
                  onChange={toggleAll}
                  className="cursor-pointer accent-[#2196f3]"
                />
              </th>
              {["BASE","BIN","BRAND","EXPIRY","CVV","COUNTRY","REGION","INFO","ZIP","REFUND","PRICE","ACTIONS"].map((h) => (
                <th key={h} className="p-3 text-left font-bold uppercase tracking-wide border-b border-[#e0e0e0] whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-[#f0f0f0]">
                <td colSpan={13} className="p-3"><div className="h-4 rounded bg-[#f1f4f6] animate-pulse" /></td>
              </tr>
            ))}
            {!loading && pageCards.map((c) => (
              <tr key={c.id} className="border-b border-[#eef1f4] odd:bg-white even:bg-[#fafbfc] hover:bg-[#f2f8ff] transition">
                <td className="p-2 text-center align-middle">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                    className="cursor-pointer accent-[#2196f3]"
                  />
                </td>
                <td className="p-3 align-middle max-w-[240px]">
                  <span
                    title={publicBase(c.base) || ""}
                    className="inline-block max-w-full truncate rounded-lg border border-[#a5d6a7] bg-gradient-to-b from-[#f1fbf2] to-[#dff3e2] px-2.5 py-1.5 text-[13px] font-semibold text-[#1b5e20] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_3px_8px_-6px_rgba(27,94,32,0.8)]"
                  >
                    {publicBase(c.base) || "—"}
                  </span>
                </td>
                <td className="p-3 align-middle">
                  <span className="inline-block rounded-lg bg-gradient-to-b from-[#455a64] to-[#1f2d3d] px-2.5 py-1.5 font-mono text-[13px] font-bold tracking-wide text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_5px_12px_-7px_rgba(31,45,61,1)]">
                    {c.bin ?? "—"}
                  </span>
                  {c.last_digits ? (
                    <span className="ml-1.5 font-mono text-[13px] font-semibold text-[#78909c]">••{c.last_digits}</span>
                  ) : null}
                </td>
                <td className="p-3 align-middle">
                  <BrandLogo brand={c.brand || detectBrandFromBin(c.bin ?? "")} className="h-7 w-11 drop-shadow-[0_3px_6px_rgba(31,45,61,0.35)]" />
                </td>
                <td className="p-3 align-middle font-mono text-[14px] font-semibold text-[#263238] whitespace-nowrap">
                  {(c.exp_month ?? "--")}/{(c.exp_year ?? "--")}
                </td>
                <td className="p-3 align-middle">
                  <CheckCircle2 className="h-5 w-5 text-[#2e7d32] drop-shadow-[0_2px_4px_rgba(46,125,50,0.45)]" />
                </td>
                <td className="p-3 align-middle whitespace-nowrap">
                  {c.country ? (
                    <span className="inline-flex items-center gap-2">
                      <CountryFlagImg code={c.country} className="h-6 w-9" />
                      <span className="flex flex-col leading-tight">
                        <span className="text-[13px] font-bold text-[#1f2d3d]">{countryCode(c.country)}</span>
                        <span className="text-[11px] text-[#78909c] max-w-[120px] truncate">{countryName(c.country)}</span>
                      </span>
                    </span>
                  ) : <span className="text-[#bbb]">—</span>}
                </td>
                <td className="p-3 align-middle max-w-[200px]">
                  {c.city || c.state ? (
                    <span
                      title={[c.city, c.state, c.zip].filter(Boolean).join(", ")}
                      className="inline-block max-w-full truncate rounded-lg border border-[#ffd280] bg-gradient-to-b from-[#fffaf0] to-[#ffeec9] px-2.5 py-1.5 text-[13px] font-semibold uppercase text-[#8d6e00] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
                    >
                      {[c.city, c.state].filter(Boolean).join(", ")}
                    </span>
                  ) : <span className="text-[#bbb]">—</span>}
                </td>
                <td className="p-3 align-middle min-w-[160px]">
                  <span className="flex flex-wrap gap-1.5">
                    {c.zip ? <InfoChip>+zip</InfoChip> : null}
                    {c.city ? <InfoChip>+city</InfoChip> : null}
                    {c.state ? <InfoChip>+state</InfoChip> : null}
                    {c.has_phone ? <InfoChip>+phone</InfoChip> : null}
                    {c.has_email ? <InfoChip>+email</InfoChip> : null}
                    {!c.zip && !c.city && !c.state && !c.has_phone && !c.has_email ? (
                      <span className="text-[12px] text-[#bbb]">none</span>
                    ) : null}
                  </span>
                </td>
                <td className="p-3 align-middle font-mono text-[14px] font-semibold text-[#c62828]">{c.zip ?? "N/A"}</td>
                <td className="p-3 align-middle">
                  <span className={`inline-block rounded-full px-3 py-1 text-[12px] font-bold uppercase tracking-wide shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ${
                    c.refundable
                      ? "bg-gradient-to-b from-[#eaf7ec] to-[#c8e6c9] text-[#1b5e20] border border-[#a5d6a7]"
                      : "bg-gradient-to-b from-[#fdecea] to-[#f9d3cf] text-[#b71c1c] border border-[#ef9a9a]"
                  }`}>
                    {c.refundable ? "Yes" : "No"}
                  </span>
                </td>
                <td className="p-3 align-middle font-mono text-[16px] font-extrabold text-[#1f2d3d] whitespace-nowrap">
                  ${Number(c.price).toFixed(2)}
                </td>
                <td className="p-3 align-middle">
                  {c.delivery_type === "key" && c.stock <= 0 ? (
                    <span className="text-[#bbb] text-[13px]">sold</span>
                  ) : (
                    <button
                      onClick={() => buyMany([c.id])}
                      disabled={buying}
                      className="h-9 px-4 rounded-lg bg-gradient-to-b from-[#7bd17f] to-[#2e7d32] text-white text-[13px] font-bold inline-flex items-center gap-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_8px_16px_-9px_rgba(46,125,50,1)] hover:from-[#66bb6a] hover:to-[#256a29] active:translate-y-px transition disabled:opacity-50"
                    >
                      <ShoppingCart className="h-4 w-4" /> Buy
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!loading && noResults && (
              <tr>
                <td colSpan={13} className="p-10 text-center text-[#888] text-[13px]">
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

function InfoChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-[#bbdefb] bg-gradient-to-b from-[#f3f9ff] to-[#dceeff] px-2 py-[3px] text-[12px] font-semibold text-[#0d47a1] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
      {children}
    </span>
  );
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
