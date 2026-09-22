import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import Seo from "@/components/Seo";
import { toast } from "sonner";
import {
  Search,
  RotateCcw,
  Loader2,
  Copy,
  CheckCircle2,
  X,
  ShoppingCart,
  ChevronLeft,
  ChevronRight,
  CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { listSection, type SectionProduct } from "@/lib/sections";
import { purchaseProduct, translatePurchaseError } from "@/lib/store";
import { BrandLogo, detectBrandFromBin, CountryFlagImg, countryCode, countryName } from "@/lib/brands";
import { flagEmoji, resolveCountryName } from "@/lib/countries";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { cartCount, onCartChange } from "@/lib/cart";

const PAGE_SIZES = [10, 25, 50, 100];

const TypeBadge = ({ value }: { value: string | null | undefined }) => {
  const v = (value ?? "").toUpperCase();
  if (!v) return <span className="text-[#bbb]">—</span>;
  const credit = v.includes("CREDIT");
  const prepaid = v.includes("PREPAID");
  const cls = credit
    ? "from-[#66bb6a] to-[#2e7d32]"
    : prepaid
      ? "from-[#ab47bc] to-[#6a1b9a]"
      : "from-[#42a5f5] to-[#1565c0]";
  return (
    <span className={`inline-block rounded-md bg-gradient-to-b ${cls} px-2 py-1 text-[10.5px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_4px_10px_-7px_rgba(0,0,0,0.9)]`}>
      {v}
    </span>
  );
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[#888] text-[11px] tracking-wider shrink-0 w-[62px] lg:w-auto font-bold uppercase">{label}</span>
      {children}
    </div>
  );
}

function slidingPageNumbers(page: number, maxAvailable: number): number[] {
  const start = Math.max(1, page - 1);
  const end = Math.min(maxAvailable, page + 2);
  const list: number[] = [];
  for (let i = start; i <= end; i++) {
    list.push(i);
  }
  return list;
}

function maskBin(raw?: string | null): string {
  if (!raw) return "—";
  const clean = raw.trim();
  if (!clean) return "—";
  const prefix = clean.slice(0, 2);
  const starsCount = Math.max(4, clean.length - prefix.length);
  return `${prefix}${"*".repeat(starsCount)}`;
}

const Bins = () => {
  const { profile } = useAuth();
  const [rows, setRows] = useState<SectionProduct[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [bin, setBin] = useState("");
  const [country, setCountry] = useState("");
  const [type, setType] = useState("");
  const [level, setLevel] = useState("");
  const [category, setCategory] = useState("");

  const [perPage, setPerPage] = useState(25);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [delivered, setDelivered] = useState<{ title: string; content: string } | null>(null);

  // Cart count
  const [cartBadge, setCartBadge] = useState(0);
  useEffect(() => {
    setCartBadge(cartCount());
    return onCartChange(() => setCartBadge(cartCount()));
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listSection("bin");
      setRows(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load BINs");
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const uniq = (key: (p: SectionProduct) => string | null | undefined) =>
    [...new Set(rows.map((p) => (key(p) ?? "").trim()).filter(Boolean))].sort();

  const countries = useMemo(() => uniq((p) => p.country), [rows]);
  const types = useMemo(() => uniq((p) => p.card_type), [rows]);
  const levels = useMemo(() => uniq((p) => p.card_level), [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((p) => {
        if (bin && !`${p.bin ?? ""}`.includes(bin.trim())) return false;
        if (country && (p.country ?? "").toUpperCase() !== country.toUpperCase()) return false;
        if (type && (p.card_type ?? "").toUpperCase() !== type.toUpperCase()) return false;
        if (level && (p.card_level ?? "").toLowerCase() !== level.toLowerCase()) return false;
        if (category && !`${p.bin_category ?? ""}`.toLowerCase().includes(category.toLowerCase())) return false;
        return true;
      }),
    [rows, bin, country, type, level, category],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));

  useEffect(() => {
    setPage(1);
  }, [bin, country, type, level, category, perPage]);

  const pageRows = filtered.slice((page - 1) * perPage, page * perPage);

  const resetFilters = () => {
    setBin("");
    setCountry("");
    setType("");
    setLevel("");
    setCategory("");
    setPage(1);
  };

  const buy = async (p: SectionProduct) => {
    setBusy(p.id);
    try {
      await purchaseProduct(p.id, 1);
      setDelivered({
        title: `Unlocked BIN: ${p.bin || ""}`.trim(),
        content: p.instant_content || p.bin || "Delivered — see Orders",
      });
      toast.success("Purchased & Unlocked successfully");
      void load();
    } catch (e) {
      toast.error(translatePurchaseError(e instanceof Error ? e.message : "Purchase failed"));
    }
    setBusy(null);
  };

  return (
    <AppShell wide>
      <Seo
        title="BIN Shop | Zoru"
        description="Verified BIN market. Filter by BIN, country, card type, level, brand, and category."
        path="/bins"
      />

      {/* FILTER BAR - MATCHING SHOP.TSX */}
      <div className="rounded-xl bg-white border border-[#e6e6e6] shadow-[0_10px_30px_-18px_rgba(31,45,61,0.55)] px-3 sm:px-4 py-3 grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center gap-x-6 gap-y-3 text-[13px]">
        <Field label="BIN">
          <input
            value={bin}
            onChange={(e) => setBin(e.target.value.replace(/\D/g, "").slice(0, 16))}
            placeholder="Filter BIN..."
            className="h-8 w-full min-w-0 lg:w-[150px] rounded-md border border-[#dcdcdc] px-2 text-[13px] font-mono outline-none bg-white focus:border-[#2196f3] focus:ring-2 focus:ring-[#2196f3]/15 transition"
          />
        </Field>

        <Field label="COUNTRY">
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="h-8 w-full min-w-0 lg:w-[180px] rounded-md border border-[#dcdcdc] px-2 text-[13px] outline-none bg-white focus:border-[#2196f3] focus:ring-2 focus:ring-[#2196f3]/15 transition"
          >
            <option value="">All countries</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {flagEmoji(c)} {resolveCountryName(c)} ({c.toUpperCase()})
              </option>
            ))}
          </select>
        </Field>

        <Field label="TYPE">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="h-8 w-full min-w-0 lg:w-[140px] rounded-md border border-[#dcdcdc] px-2 text-[13px] outline-none bg-white focus:border-[#2196f3] focus:ring-2 focus:ring-[#2196f3]/15 transition"
          >
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>

        <Field label="LEVEL">
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="h-8 w-full min-w-0 lg:w-[140px] rounded-md border border-[#dcdcdc] px-2 text-[13px] outline-none bg-white focus:border-[#2196f3] focus:ring-2 focus:ring-[#2196f3]/15 transition"
          >
            <option value="">All levels</option>
            {levels.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </Field>

        <Field label="CATEGORY">
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Shopify, Netflix, Ads..."
            className="h-8 w-full min-w-0 lg:w-[170px] rounded-md border border-[#dcdcdc] px-2 text-[13px] outline-none bg-white focus:border-[#2196f3] focus:ring-2 focus:ring-[#2196f3]/15 transition"
          />
        </Field>

        <div className="flex items-center gap-2 sm:col-span-2 lg:col-auto lg:ml-auto">
          <button
            onClick={() => setPage(1)}
            className="h-8 flex-1 lg:flex-none px-4 rounded-md bg-gradient-to-b from-[#42a5f5] to-[#1976d2] hover:from-[#2196f3] hover:to-[#1565c0] text-white text-[13px] inline-flex items-center justify-center gap-1.5 shadow-[0_6px_14px_-6px_rgba(25,118,210,0.9)] active:translate-y-px transition"
          >
            <Search className="h-3.5 w-3.5" /> search
          </button>
          <button
            onClick={resetFilters}
            className="h-8 flex-1 lg:flex-none px-4 rounded-md border border-[#dcdcdc] bg-gradient-to-b from-white to-[#f4f6f8] text-[#555] hover:border-[#bbb] text-[13px] inline-flex items-center justify-center gap-1.5 active:translate-y-px transition"
          >
            <RotateCcw className="h-3.5 w-3.5" /> reset
          </button>
        </div>
      </div>

      {/* ACTION BAR - MATCHING SHOP.TSX */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-semibold text-[#1f2d3d] bg-white border border-[#dcdcdc] rounded-md px-2.5 h-8 inline-flex items-center gap-1.5 shadow-sm">
            <CreditCard className="h-3.5 w-3.5 text-[#1976d2]" />
            Total BINs: {rows.length}
          </span>
          {filtered.length !== rows.length && (
            <span className="text-[12px] font-semibold text-[#2e7d32] bg-[#e8f5e9] border border-[#c8e6c9] rounded-md px-2.5 h-8 inline-flex items-center">
              Matching: {filtered.length}
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
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          {filtered.length > 0 ? (
            <span>
              Page {page} of {totalPages}
            </span>
          ) : null}
          <Link to="/cart" className="text-[#2196f3] hover:underline">
            Cart{cartBadge > 0 ? ` (${cartBadge})` : ""}
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

      {/* TABLE CONTAINER - MATCHING SHOP.TSX */}
      <div className="mt-3 rounded-xl border border-[#e6e6e6] bg-white overflow-x-auto shadow-[0_14px_40px_-26px_rgba(31,45,61,0.6)]">
        <table className="w-full min-w-[1000px] text-[13px] border-collapse">
          <thead>
            <tr className="bg-gradient-to-b from-[#37474f] to-[#1f2d3d] text-white text-[11.5px]">
              {["BIN", "BRAND", "TYPE", "LEVEL", "COUNTRY", "CATEGORY", "PRICE", "ACTION"].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2.5 text-left font-bold uppercase tracking-wide border-b border-[#e0e0e0] whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-[#f0f0f0]">
                  <td colSpan={8} className="p-3">
                    <div className="h-4 rounded bg-[#f1f4f6] animate-pulse" />
                  </td>
                </tr>
              ))}

            {!loading && pageRows.length === 0 && (
              <tr>
                <td colSpan={8} className="p-10 text-center text-[#888] text-[13px]">
                  No BINs match your filters.
                  <div className="mt-2">
                    <button onClick={resetFilters} className="text-[#2196f3] hover:underline">
                      Clear filters
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {!loading &&
              pageRows.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-[#eef1f4] odd:bg-white even:bg-[#fafbfc] hover:bg-[#f2f8ff] transition"
                >
                  {/* BIN CHIP (MASKED: 1-2 DIGITS + ASTERISKS) */}
                  <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                    <span className="inline-block rounded-lg bg-gradient-to-b from-[#455a64] to-[#1f2d3d] px-2.5 py-1 font-mono text-[12px] font-bold tracking-wider text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_5px_12px_-7px_rgba(31,45,61,1)]">
                      {maskBin(p.bin)}
                    </span>
                  </td>

                  {/* BRAND LOGO */}
                  <td className="px-3 py-2.5 align-middle">
                    <BrandLogo
                      brand={p.brand || detectBrandFromBin(p.bin ?? "")}
                      className="h-6 w-9 drop-shadow-[0_3px_6px_rgba(31,45,61,0.35)]"
                    />
                  </td>

                  {/* CARD TYPE */}
                  <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                    <TypeBadge value={p.card_type} />
                  </td>

                  {/* CARD LEVEL */}
                  <td className="px-3 py-2.5 align-middle">
                    {p.card_level ? (
                      <span
                        title={p.card_level}
                        className="inline-block max-w-full truncate rounded-md border border-[#ffd54f] bg-gradient-to-b from-[#fff6d6] to-[#ffe082] px-2 py-1 text-[10.5px] font-extrabold uppercase tracking-wide text-[#6d4c00] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
                      >
                        {p.card_level}
                      </span>
                    ) : (
                      <span className="text-[#bbb]">—</span>
                    )}
                  </td>

                  {/* COUNTRY */}
                  <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                    {p.country ? (
                      <span className="inline-flex items-center gap-2">
                        <CountryFlagImg code={p.country} className="h-5 w-7" />
                        <span className="flex flex-col leading-tight">
                          <span className="text-[12px] font-bold text-[#1f2d3d]">{countryCode(p.country)}</span>
                          <span className="text-[11px] text-[#78909c] max-w-[130px] truncate">
                            {countryName(p.country)}
                          </span>
                        </span>
                      </span>
                    ) : (
                      <span className="text-[#bbb]">—</span>
                    )}
                  </td>

                  {/* CATEGORY */}
                  <td className="px-3 py-2.5 align-middle max-w-[220px]">
                    {p.bin_category ? (
                      <span
                        title={p.bin_category}
                        className="inline-block max-w-full truncate rounded-lg border border-[#a5d6a7] bg-gradient-to-b from-[#f1fbf2] to-[#dff3e2] px-2.5 py-1 text-[11.5px] font-semibold text-[#1b5e20] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_3px_8px_-6px_rgba(27,94,32,0.8)]"
                      >
                        {p.bin_category}
                      </span>
                    ) : (
                      <span className="text-[#bbb]">—</span>
                    )}
                  </td>

                  {/* PRICE */}
                  <td className="px-3 py-2.5 align-middle font-mono text-[14px] font-extrabold text-[#1f2d3d] whitespace-nowrap">
                    ${Number(p.price).toFixed(2)}
                  </td>

                  {/* ACTION BUY */}
                  <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                    <button
                      onClick={() => buy(p)}
                      disabled={busy === p.id}
                      className="h-8 px-3.5 rounded-lg bg-gradient-to-b from-[#7bd17f] to-[#2e7d32] text-white text-[12px] font-bold inline-flex items-center gap-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_8px_16px_-9px_rgba(46,125,50,1)] hover:from-[#66bb6a] hover:to-[#256a29] active:translate-y-px transition disabled:opacity-50"
                    >
                      {busy === p.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ShoppingCart className="h-3.5 w-3.5" />
                      )}
                      Buy
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* PAGINATION - MATCHING SHOP.TSX */}
      {!loading && filtered.length > 0 && (
        <nav aria-label="BIN pages" className="mt-4 mb-2 flex w-full flex-wrap items-center justify-center gap-2 text-[13px]">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="h-9 min-w-[92px] border-[#dcdcdc] bg-white text-[#37474f] hover:bg-[#f2f8ff]"
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          {slidingPageNumbers(page, totalPages).map((n) => (
            <Button
              type="button"
              variant="outline"
              size="icon"
              key={n}
              onClick={() => setPage(n)}
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
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="h-9 min-w-[92px] border-[#dcdcdc] bg-white text-[#37474f] hover:bg-[#f2f8ff]"
          >
            Next <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="basis-full text-center text-[12px] text-[#777]">
            Page {page} of {totalPages}
          </span>
        </nav>
      )}

      {/* DELIVERED MODAL - MATCHING SHOP.TSX */}
      {delivered && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDelivered(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white border border-[#e6e6e6] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#f0f0f0] px-4 py-3">
              <div className="flex items-center gap-2 text-[14px] font-semibold text-[#303133]">
                <CheckCircle2 className="h-4 w-4 text-[#4caf50]" /> {delivered.title}
              </div>
              <button
                onClick={() => setDelivered(null)}
                className="text-[#909399] hover:text-[#303133]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap break-all p-4 font-mono text-[12px] text-[#303133] bg-[#fafbfc]">
              {delivered.content}
            </pre>
            <div className="border-t border-[#f0f0f0] px-4 py-3 text-right">
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(delivered.content);
                  toast.success("Copied to clipboard");
                }}
                className="h-8 px-4 rounded-md bg-gradient-to-b from-[#42a5f5] to-[#1976d2] text-white text-[13px] inline-flex items-center gap-1.5 active:translate-y-px transition shadow-sm"
              >
                <Copy className="h-3.5 w-3.5" /> Copy
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
};

export default Bins;
