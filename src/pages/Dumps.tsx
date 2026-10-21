import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import Seo from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, FileArchive, Download, RotateCcw, Lock, Coins, ShieldCheck } from "lucide-react";
import { listSection, checkHasDeposited, type SectionProduct } from "@/lib/sections";
import { purchaseProduct, translatePurchaseError } from "@/lib/store";
import { CountryFlagImg } from "@/lib/brands";
import { PageHero, StatCard } from "@/components/PageHero";
import { useAuth } from "@/hooks/useAuth";

const PAGE_SIZES = [10, 25, 50, 100];

const Dumps = () => {
  const { user, loading: authLoading } = useAuth();
  const [hasDeposited, setHasDeposited] = useState<boolean | null>(null);
  const [checkingDeposit, setCheckingDeposit] = useState(true);

  const [rows, setRows] = useState<SectionProduct[]>([]);
  const [loading, setLoading] = useState(false);
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

  useEffect(() => {
    let active = true;
    const verify = async () => {
      if (authLoading) return;
      if (!user) {
        if (active) {
          setHasDeposited(false);
          setCheckingDeposit(false);
        }
        return;
      }
      try {
        const ok = await checkHasDeposited();
        if (active) {
          setHasDeposited(ok);
          setCheckingDeposit(false);
          if (ok) {
            void load();
          }
        }
      } catch {
        if (active) {
          setHasDeposited(false);
          setCheckingDeposit(false);
        }
      }
    };
    void verify();
    return () => {
      active = false;
    };
  }, [user, authLoading]);

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
      toast.success("Purchased — file is ready in Orders");
      // Hide this purchased dump immediately for the current buyer so it is not shown to them anymore
      setRows((prev) => prev.filter((item) => item.id !== p.id));
      setDelivered({
        name: p.file_name ?? `${p.title}.txt`,
        content: "File purchased successfully! Open ORDERS to download your complete file.",
      });
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

      {checkingDeposit ? (
        <div className="py-20 text-center text-muted-foreground flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-sm">Verifying access...</span>
        </div>
      ) : !hasDeposited ? (
        /* Locked screen for users who have never deposited */
        <div className="mx-auto max-w-xl my-10 rounded-3xl border border-amber-500/30 bg-gradient-to-b from-[#181a24] to-[#0d0f15] p-8 text-center shadow-2xl relative overflow-hidden">
          <div className="absolute inset-0 bg-amber-500/5 backdrop-blur-3xl -z-10" />
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border border-amber-500/40 bg-amber-500/10 text-amber-400 shadow-inner">
            <Lock className="h-10 w-10 animate-pulse" />
          </div>
          <span className="inline-block rounded-full bg-amber-500/15 border border-amber-500/30 px-3 py-1 text-xs font-semibold text-amber-300 uppercase tracking-wider mb-3">
            Deposit Required to Unlock
          </span>
          <h2 className="text-2xl font-bold font-display text-white tracking-tight">
            DUMP Section is Locked
          </h2>
          <p className="mt-3 text-sm text-white/70 leading-relaxed max-w-md mx-auto">
            Access to bulk DUMP files is reserved exclusively for funded accounts. You must make at least 1 deposit on your account to unlock and purchase files from this section.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {!user ? (
              <Button onClick={() => { window.location.href = "/auth"; }} className="bg-primary hover:bg-primary/90 text-white font-semibold px-6 h-11">
                Sign In / Register
              </Button>
            ) : (
              <Button
                onClick={() => { window.location.href = "/recharge"; }}
                className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-bold px-6 h-11 shadow-lg shadow-amber-500/20"
              >
                <Coins className="h-4 w-4 mr-2" /> Make a Deposit to Unlock
              </Button>
            )}
          </div>
          <div className="mt-6 text-xs text-white/40 flex items-center justify-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            Once your deposit is confirmed, this section unlocks automatically.
          </div>
        </div>
      ) : (
        /* Unlocked Dumps view for deposited users */
        <>
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
        </>
      )}

      {delivered && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setDelivered(null)}>
          <div className="w-full max-w-md rounded-2xl border border-primary/30 bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-bold mb-2">{delivered.name}</h3>
            <p className="text-sm text-muted-foreground">{delivered.content}</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDelivered(null)}>Close</Button>
              <Button onClick={() => { window.location.href = "/orders"; }}>Go to Orders</Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
};

export default Dumps;
