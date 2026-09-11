import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import Seo from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, FileArchive, Download, RotateCcw } from "lucide-react";
import { listSection, type SectionProduct } from "@/lib/sections";
import { purchaseProduct, translatePurchaseError } from "@/lib/store";
import { CountryFlagImg } from "@/lib/brands";

const PAGE_SIZES = [10, 25, 50, 100];

const Dumps = () => {
  const [rows, setRows] = useState<SectionProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("");
  const [perPage, setPerPage] = useState(25);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [delivered, setDelivered] = useState<{ name: string; content: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await listSection("dump"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load dumps");
    }
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const countries = useMemo(
    () => [...new Set(rows.map((p) => (p.country ?? "").trim()).filter(Boolean))].sort(),
    [rows],
  );

  const filtered = useMemo(
    () =>
      rows.filter((p) => {
        if (country && (p.country ?? "").toUpperCase() !== country.toUpperCase()) return false;
        const hay = `${p.title} ${p.file_name ?? ""} ${p.base ?? ""}`.toLowerCase();
        if (search && !hay.includes(search.toLowerCase())) return false;
        return true;
      }),
    [rows, search, country],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  useEffect(() => { setPage(1); }, [search, country, perPage]);
  const pageRows = filtered.slice((page - 1) * perPage, page * perPage);

  const buy = async (p: SectionProduct) => {
    setBusy(p.id);
    try {
      await purchaseProduct(p.id, 1);
      toast.success("Purchased — file is in Orders");
      void load();
      setDelivered({ name: p.file_name ?? `${p.title}.txt`, content: "Open ORDERS to download your file." });
    } catch (e) {
      toast.error(translatePurchaseError(e instanceof Error ? e.message : "Purchase failed"));
    }
    setBusy(null);
  };

  const expired = (p: SectionProduct) =>
    p.expires_on ? new Date(p.expires_on).getTime() < Date.now() : false;

  return (
    <AppShell>
      <Seo title="DUMP — bulk card files" description="Bulk remaining / expiring card files sold as ready-to-download packs." path="/dumps" />

      <PageHero
        eyebrow="Bulk files"
        eyebrowIcon={FileArchive}
        title="DUMP"
        highlight="card packs"
        description="Remaining / soon-expiring cards packed as files. Buy the pack and download the whole file from Orders."
      />

      <div className="grid gap-3 sm:grid-cols-3 mb-5">
        <StatCard label="Files" icon={FileArchive} tone="blue" value={rows.length} />
        <StatCard label="Cards inside" icon={Download} tone="amber" value={rows.reduce((s, p) => s + (p.file_lines ?? 0), 0)} />
        <StatCard label="Matching" icon={Download} tone="green" value={filtered.length} />
      </div>


      <div className="rounded-2xl border border-border/50 bg-card/60 p-4 mb-5 grid gap-3 md:grid-cols-4">
        <label className="text-xs uppercase tracking-wider text-muted-foreground md:col-span-2">
          Search file / base
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="File name or base..." className="mt-1 h-10" />
        </label>
        <label className="text-xs uppercase tracking-wider text-muted-foreground">
          Country
          <select value={country} onChange={(e) => setCountry(e.target.value)} className="mt-1 w-full h-10 rounded-lg bg-secondary/40 border border-border/50 px-3 text-sm text-foreground">
            <option value="">All countries</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <div className="flex items-end">
          <Button variant="outline" className="w-full" onClick={() => { setSearch(""); setCountry(""); void load(); }}>
            <RotateCcw className="h-4 w-4 mr-1" /> Reset
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
        <span>{filtered.length} file(s)</span>
      </div>

      <div className="rounded-2xl border border-border/50 overflow-x-auto bg-card/50">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-secondary/40 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">File</th>
              <th className="text-left px-4 py-3">Base</th>
              <th className="text-left px-4 py-3">Country</th>
              <th className="text-left px-4 py-3">Cards</th>
              <th className="text-left px-4 py-3">Expires</th>
              <th className="text-left px-4 py-3">Left</th>
              <th className="text-left px-4 py-3">Price</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
            )}
            {!loading && pageRows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No dump files available.</td></tr>
            )}
            {pageRows.map((p) => (
              <tr key={p.id} className="border-t border-border/40 hover:bg-secondary/20">
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-2 font-semibold">
                    <Download className="h-4 w-4 text-primary-glow" />
                    {p.file_name || p.title}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{p.base || "—"}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-2">
                    <CountryFlagImg code={p.country} />
                    <span className="text-xs font-semibold">{(p.country ?? "—").toUpperCase()}</span>
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-md bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 px-2 py-1 text-[11px] font-bold">
                    {p.file_lines ?? 0}
                  </span>
                </td>
                <td className={`px-4 py-3 text-xs font-semibold ${expired(p) ? "text-destructive" : "text-muted-foreground"}`}>
                  {p.expires_on ? new Date(p.expires_on).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3">{p.stock ?? 0}</td>
                <td className="px-4 py-3 font-bold text-primary-glow">${p.price.toFixed(2)}</td>
                <td className="px-4 py-3 text-right">
                  <Button size="sm" disabled={busy === p.id} onClick={() => buy(p)}>
                    {busy === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buy file"}
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
          <div className="w-full max-w-md rounded-2xl border border-primary/30 bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-bold mb-2">{delivered.name}</h3>
            <p className="text-sm text-muted-foreground">{delivered.content}</p>
            <div className="mt-4 flex justify-end"><Button onClick={() => setDelivered(null)}>OK</Button></div>
          </div>
        </div>
      )}
    </AppShell>
  );
};

export default Dumps;
