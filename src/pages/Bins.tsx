import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import Seo from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Search, Loader2, CreditCard, RotateCcw } from "lucide-react";
import { listSection, type SectionProduct } from "@/lib/sections";
import { purchaseProduct, translatePurchaseError } from "@/lib/store";
import { CountryFlagImg } from "@/lib/brands";
import { resolveCountryName as resolveLabel } from "@/lib/countries";

const PAGE_SIZES = [10, 25, 50, 100];

const Bins = () => {
  const [rows, setRows] = useState<SectionProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [country, setCountry] = useState("");
  const [type, setType] = useState("");
  const [level, setLevel] = useState("");
  const [category, setCategory] = useState("");
  const [perPage, setPerPage] = useState(25);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [delivered, setDelivered] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await listSection("bin"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load BINs");
    }
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const uniq = (key: (p: SectionProduct) => string | null | undefined) =>
    [...new Set(rows.map((p) => (key(p) ?? "").trim()).filter(Boolean))].sort();

  const countries = useMemo(() => uniq((p) => p.country), [rows]);
  const types = useMemo(() => uniq((p) => p.card_type), [rows]);
  const levels = useMemo(() => uniq((p) => p.card_level), [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((p) => {
        if (country && (p.country ?? "").toUpperCase() !== country.toUpperCase()) return false;
        if (type && (p.card_type ?? "").toUpperCase() !== type.toUpperCase()) return false;
        if (level && (p.card_level ?? "").toLowerCase() !== level.toLowerCase()) return false;
        if (category && !`${p.bin_category ?? ""}`.toLowerCase().includes(category.toLowerCase())) return false;
        return true;
      }),
    [rows, country, type, level, category],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  useEffect(() => { setPage(1); }, [country, type, level, category, perPage]);
  const pageRows = filtered.slice((page - 1) * perPage, page * perPage);

  const buy = async (p: SectionProduct) => {
    setBusy(p.id);
    try {
      await purchaseProduct(p.id, 1);
      setDelivered(p.instant_content ?? "Delivered — see Orders");
      toast.success("Purchased");
      void load();
    } catch (e) {
      toast.error(translatePurchaseError(e instanceof Error ? e.message : "Purchase failed"));
    }
    setBusy(null);
  };

  return (
    <AppShell>
      <Seo title="BIN Shop — Zoru" description="Verified BIN list with card type, level, brand and category." />

      <div className="rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent p-6 mb-6">
        <div className="flex items-center gap-3">
          <span className="h-11 w-11 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center">
            <CreditCard className="h-5 w-5 text-primary-glow" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-black neon-text">BIN Shop</h1>
            <p className="text-sm text-muted-foreground">Verified BIN numbers — buy instantly from your balance.</p>
          </div>
        </div>
        <div className="mt-4 flex gap-3">
          <div className="rounded-xl border border-border/50 bg-secondary/30 px-4 py-2">
            <div className="text-lg font-black">{rows.length}</div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Total BINs</div>
          </div>
          <div className="rounded-xl border border-border/50 bg-secondary/30 px-4 py-2">
            <div className="text-lg font-black">{filtered.length}</div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Matching</div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/50 bg-card/60 p-4 mb-5 grid gap-3 md:grid-cols-5">
        <label className="text-xs uppercase tracking-wider text-muted-foreground md:col-span-1">
          Country
          <select value={country} onChange={(e) => setCountry(e.target.value)} className="mt-1 w-full h-10 rounded-lg bg-secondary/40 border border-border/50 px-3 text-sm text-foreground">
            <option value="">All countries</option>
            {countries.map((c) => <option key={c} value={c}>{resolveLabel(c)}</option>)}
          </select>
        </label>
        <label className="text-xs uppercase tracking-wider text-muted-foreground">
          Card type
          <select value={type} onChange={(e) => setType(e.target.value)} className="mt-1 w-full h-10 rounded-lg bg-secondary/40 border border-border/50 px-3 text-sm text-foreground">
            <option value="">All types</option>
            {types.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="text-xs uppercase tracking-wider text-muted-foreground">
          Card level
          <select value={level} onChange={(e) => setLevel(e.target.value)} className="mt-1 w-full h-10 rounded-lg bg-secondary/40 border border-border/50 px-3 text-sm text-foreground">
            <option value="">All levels</option>
            {levels.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="text-xs uppercase tracking-wider text-muted-foreground md:col-span-1">
          Category
          <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Shopify, Netflix..." className="mt-1 h-10" />
        </label>
        <div className="flex items-end gap-2">
          <Button className="flex-1" onClick={() => setPage(1)}><Search className="h-4 w-4 mr-1" /> Search</Button>
          <Button variant="outline" onClick={() => { setCountry(""); setType(""); setLevel(""); setCategory(""); void load(); }}>
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3 text-sm text-muted-foreground">
        <label className="flex items-center gap-2">
          Rows per page:
          <select value={perPage} onChange={(e) => setPerPage(Number(e.target.value))} className="h-9 rounded-lg bg-secondary/40 border border-border/50 px-2 text-foreground">
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span>{filtered.length} result(s)</span>
      </div>

      <div className="rounded-2xl border border-border/50 overflow-x-auto bg-card/50">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-secondary/40 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">BIN</th>
              <th className="text-left px-4 py-3">Country</th>
              <th className="text-left px-4 py-3">Card type</th>
              <th className="text-left px-4 py-3">Card level</th>
              <th className="text-left px-4 py-3">Card brand</th>
              <th className="text-left px-4 py-3">Category</th>
              <th className="text-left px-4 py-3">Price</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
            )}
            {!loading && pageRows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No BINs available.</td></tr>
            )}
            {pageRows.map((p) => (
              <tr key={p.id} className="border-t border-border/40 hover:bg-secondary/20">
                <td className="px-4 py-3">
                  <span className="rounded-md bg-secondary/60 px-2 py-1 font-mono text-xs tracking-widest">
                    {(p.bin ?? "").slice(0, 1)}*****
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-2">
                    <CountryFlagImg code={p.country} />
                    <span className="text-xs font-semibold">{(p.country ?? "—").toUpperCase()}</span>
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-md bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 px-2 py-1 text-[11px] font-bold uppercase">
                    {p.card_type || "—"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-md bg-amber-500/20 text-amber-300 border border-amber-400/30 px-2 py-1 text-[11px] font-bold">
                    {p.card_level || "—"}
                  </span>
                </td>
                <td className="px-4 py-3 font-semibold">{p.brand || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{p.bin_category || "—"}</td>
                <td className="px-4 py-3 font-bold text-primary-glow">${p.price.toFixed(2)}</td>
                <td className="px-4 py-3 text-right">
                  <Button size="sm" disabled={busy === p.id} onClick={() => buy(p)}>
                    {busy === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buy"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}

      {delivered && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setDelivered(null)}>
          <div className="w-full max-w-lg rounded-2xl border border-primary/30 bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-bold mb-3">Purchased BIN</h3>
            <pre className="whitespace-pre-wrap break-all rounded-xl bg-secondary/40 p-4 text-sm">{delivered}</pre>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => { void navigator.clipboard.writeText(delivered); toast.success("Copied"); }}>Copy</Button>
              <Button onClick={() => setDelivered(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
};

export default Bins;
