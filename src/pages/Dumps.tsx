import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import Seo from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Loader2, Download, RotateCcw, Lock, Coins, ShieldCheck,
  Crown, Sparkles, Gem, Flame, Zap, FileText, LayoutGrid, List
} from "lucide-react";
import { listSection, checkHasDeposited, type SectionProduct } from "@/lib/sections";
import { purchaseProduct, translatePurchaseError } from "@/lib/store";
import { CountryFlagImg } from "@/lib/brands";
import { PageHero, StatCard } from "@/components/PageHero";
import { useAuth } from "@/hooks/useAuth";

const PAGE_SIZES = [12, 24, 48, 96];

const Dumps = () => {
  const { user, loading: authLoading } = useAuth();
  const [hasDeposited, setHasDeposited] = useState<boolean | null>(null);
  const [checkingDeposit, setCheckingDeposit] = useState(true);

  const [rows, setRows] = useState<SectionProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("");
  const [perPage, setPerPage] = useState(24);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [delivered, setDelivered] = useState<{ name: string; content: string } | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

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
      <Seo title="PREMIUM DUMP — Exclusive Bulk Card Files" description="High quality remaining and fresh database dump packs available for instant download." path="/dumps" />

      <PageHero
        eyebrow="VIP Bulk Vault"
        eyebrowIcon={Crown}
        title="PREMIUM"
        highlight="DUMP PACKS"
        description="Verified bulk card packs & fresh database dumps with full archives. Purchase and download instantly from Orders."
      />

      {checkingDeposit ? (
        <div className="py-24 text-center text-muted-foreground flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-9 w-9 animate-spin text-amber-400" />
          <span className="text-sm font-medium tracking-wide text-white/70">Verifying VIP access...</span>
        </div>
      ) : !hasDeposited ? (
        /* Locked screen for users who have never deposited */
        <div className="mx-auto max-w-xl my-12 rounded-3xl border border-amber-500/30 bg-gradient-to-b from-[#181a24] to-[#0d0f15] p-8 text-center shadow-2xl relative overflow-hidden">
          <div className="absolute inset-0 bg-amber-500/5 backdrop-blur-3xl -z-10" />
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border border-amber-500/40 bg-amber-500/10 text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.25)]">
            <Lock className="h-10 w-10 animate-pulse" />
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-3.5 py-1 text-xs font-black text-amber-300 uppercase tracking-wider mb-3">
            <Crown className="h-3.5 w-3.5 text-amber-400 fill-amber-400/20" /> Deposit Required to Unlock
          </span>
          <h2 className="text-2xl font-bold font-display text-white tracking-tight">
            VIP DUMP Vault is Locked
          </h2>
          <p className="mt-3 text-sm text-white/70 leading-relaxed max-w-md mx-auto">
            Access to bulk DUMP files is reserved exclusively for funded accounts. You must make at least 1 deposit on your account to unlock and purchase files from this section.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {!user ? (
              <Button onClick={() => { window.location.href = "/auth"; }} className="bg-primary hover:bg-primary/90 text-white font-bold px-6 h-11 rounded-xl">
                Sign In / Register
              </Button>
            ) : (
              <Button
                onClick={() => { window.location.href = "/recharge"; }}
                className="bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:brightness-110 text-black font-black px-7 h-11 rounded-xl shadow-lg shadow-amber-500/25 transition-all hover:scale-105 active:scale-95"
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
          <div className="grid gap-3 sm:grid-cols-3 mb-6">
            <StatCard label="VIP Files" icon={Crown} tone="amber" value={rows.length} />
            <StatCard label="Cards Inside Vault" icon={Zap} tone="green" value={rows.reduce((s, p) => s + (p.file_lines ?? 0), 0)} />
            <StatCard label="Available Packs" icon={Gem} tone="blue" value={filtered.length} />
          </div>

          {/* Filter Bar */}
          <div className="rounded-2xl border border-border/50 bg-card/60 p-4 mb-5 grid gap-3 md:grid-cols-4 shadow-sm">
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
              <Button variant="outline" className="w-full h-10 rounded-lg" onClick={() => { setSearch(""); setCountry(""); void load(); }}>
                <RotateCcw className="h-4 w-4 mr-1" /> Reset
              </Button>
            </div>
          </div>

          {/* Controls Bar: Rows & View Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2">
                Show:
                <select value={perPage} onChange={(e) => setPerPage(Number(e.target.value))} className="h-8 rounded-lg bg-secondary/40 border border-border/50 px-2 text-foreground text-xs">
                  {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} packs</option>)}
                </select>
              </label>
              <span className="text-xs font-semibold text-white/60">{filtered.length} pack(s) available</span>
            </div>

            {/* View Mode Toggle: Grid Cards vs Table */}
            <div className="flex items-center gap-1 bg-secondary/50 p-1 rounded-xl border border-border/50">
              <button
                onClick={() => setViewMode("grid")}
                className={`h-7 px-3 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition ${
                  viewMode === "grid"
                    ? "bg-gradient-to-r from-amber-500 to-amber-600 text-black shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Grid Cards
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`h-7 px-3 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition ${
                  viewMode === "table"
                    ? "bg-gradient-to-r from-amber-500 to-amber-600 text-black shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <List className="h-3.5 w-3.5" /> Table List
              </button>
            </div>
          </div>

          {loading ? (
            <div className="py-20 text-center text-muted-foreground flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
              <span className="text-sm">Loading premium dumps...</span>
            </div>
          ) : pageRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/60 p-12 text-center text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-2 text-muted-foreground/50" />
              <p className="text-base font-semibold text-white/70">No dump files available right now.</p>
              <p className="text-xs text-muted-foreground mt-1">Check back later for new base updates.</p>
            </div>
          ) : viewMode === "grid" ? (
            /* ──────────────── PREMIUM GRID CARDS VIEW ──────────────── */
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pageRows.map((p) => (
                <div
                  key={p.id}
                  className="group relative rounded-2xl border border-amber-500/20 bg-gradient-to-b from-[#131722]/95 via-[#0e111a]/95 to-[#080a0e] p-5 shadow-xl transition-all duration-300 hover:border-amber-500/50 hover:shadow-2xl hover:shadow-amber-500/10 hover:-translate-y-1 flex flex-col justify-between overflow-hidden"
                >
                  {/* Subtle golden ambient glow */}
                  <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-amber-500/10 blur-3xl group-hover:bg-amber-500/20 transition-all pointer-events-none" />

                  <div>
                    {/* Header: Crown Badge, VIP Pill, Country Flag */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-400/25 via-amber-500/15 to-transparent border border-amber-500/35 flex items-center justify-center text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.25)]">
                          <Crown className="h-5 w-5 fill-amber-400/25 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]" />
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-amber-500/25 to-yellow-500/10 border border-amber-500/40 text-amber-300 inline-flex items-center gap-1 shadow-sm">
                          <Sparkles className="h-3 w-3 text-amber-400 animate-pulse" /> VIP DUMP
                        </span>
                      </div>

                      <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1">
                        <CountryFlagImg code={p.country} />
                        <span className="text-xs font-bold text-white/90">{(p.country ?? "GL").toUpperCase()}</span>
                      </div>
                    </div>

                    {/* Title & File Name */}
                    <div className="mt-2">
                      <h3 className="font-display text-base font-bold text-white group-hover:text-amber-300 transition-colors line-clamp-1">
                        {p.title || p.file_name}
                      </h3>
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-white/50 font-mono">
                        <FileText className="h-3.5 w-3.5 text-amber-400/80" />
                        <span className="truncate">{p.file_name || `${(p.title || "dump").toLowerCase()}.txt`}</span>
                      </div>
                    </div>

                    {/* Meta stats pills */}
                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl border border-white/5 bg-white/[0.03] p-2.5">
                        <div className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Cards Inside</div>
                        <div className="mt-0.5 font-mono font-bold text-emerald-400 flex items-center gap-1">
                          <Zap className="h-3.5 w-3.5 text-emerald-400" />
                          {p.file_lines ?? 0} Cards
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/5 bg-white/[0.03] p-2.5">
                        <div className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Upload Base</div>
                        <div className="mt-0.5 font-semibold text-white/85 truncate">
                          {p.base || "VIP Base"}
                        </div>
                      </div>
                    </div>

                    {/* Expiry & Stock info */}
                    <div className="mt-3 flex items-center justify-between text-[11px] px-0.5">
                      <span className={expired(p) ? "text-destructive font-medium" : "text-white/45"}>
                        {p.expires_on ? `Expires: ${new Date(p.expires_on).toLocaleDateString()}` : "Lifetime archive"}
                      </span>
                      <span className={`font-mono font-semibold ${
                        (p.stock ?? 0) <= 2 ? "text-amber-400 flex items-center gap-1" : "text-white/50"
                      }`}>
                        {(p.stock ?? 0) <= 2 ? <Flame className="h-3.5 w-3.5 text-amber-400 animate-bounce" /> : null}
                        {p.stock ?? 0} copies left
                      </span>
                    </div>
                  </div>

                  {/* Card Bottom / Purchase Action */}
                  <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">Price</div>
                      <div className="font-mono text-xl font-black text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.3)]">
                        ${p.price.toFixed(2)}
                      </div>
                    </div>

                    <Button
                      disabled={busy === p.id}
                      onClick={() => buy(p)}
                      className="bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-black text-xs uppercase tracking-wider px-5 h-10 rounded-xl shadow-lg shadow-amber-500/25 transition-all hover:scale-105 active:scale-95"
                    >
                      {busy === p.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-black" />
                      ) : (
                        <>
                          <Crown className="h-3.5 w-3.5 fill-black/30 mr-1" /> Buy Dump Pack
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* ──────────────── PREMIUM TABLE VIEW ──────────────── */
            <div className="rounded-2xl border border-amber-500/20 overflow-x-auto bg-[#0e111a]/95 shadow-xl">
              <table className="w-full text-sm min-w-[920px]">
                <thead className="bg-[#141824] text-[11px] uppercase tracking-wider text-amber-300/70 border-b border-amber-500/20">
                  <tr>
                    <th className="text-left px-4 py-3.5">Premium File</th>
                    <th className="text-left px-4 py-3.5">Base</th>
                    <th className="text-left px-4 py-3.5">Country</th>
                    <th className="text-left px-4 py-3.5">Cards</th>
                    <th className="text-left px-4 py-3.5">Expires</th>
                    <th className="text-left px-4 py-3.5">Left</th>
                    <th className="text-left px-4 py-3.5">Price</th>
                    <th className="px-4 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {pageRows.map((p) => (
                    <tr key={p.id} className="hover:bg-amber-500/[0.04] transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="inline-flex items-center gap-3 font-semibold">
                          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-400/20 to-amber-600/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.2)] shrink-0">
                            <Crown className="h-4 w-4 fill-amber-400/20" />
                          </div>
                          <div>
                            <div className="text-white font-bold flex items-center gap-2">
                              {p.title || p.file_name}
                              <span className="px-1.5 py-0.2 rounded text-[9.5px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                VIP
                              </span>
                            </div>
                            <div className="text-[11px] text-white/45 font-mono mt-0.5 flex items-center gap-1">
                              <FileText className="h-3 w-3 text-amber-400/70" />
                              {p.file_name || `${(p.title || "dump").toLowerCase()}.txt`}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-white/70 font-medium">{p.base || "VIP Base"}</td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-2">
                          <CountryFlagImg code={p.country} />
                          <span className="text-xs font-semibold text-white/90">{(p.country ?? "—").toUpperCase()}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 text-xs font-mono font-bold inline-flex items-center gap-1">
                          <Zap className="h-3 w-3 text-emerald-400" /> {p.file_lines ?? 0}
                        </span>
                      </td>
                      <td className={`px-4 py-3.5 text-xs font-semibold ${expired(p) ? "text-destructive" : "text-white/45"}`}>
                        {p.expires_on ? new Date(p.expires_on).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-3.5 font-mono font-semibold text-white/80">
                        {p.stock ?? 0}
                      </td>
                      <td className="px-4 py-3.5 font-mono font-black text-base text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.25)]">
                        ${p.price.toFixed(2)}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Button
                          size="sm"
                          disabled={busy === p.id}
                          onClick={() => buy(p)}
                          className="bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:brightness-110 text-black font-extrabold text-xs uppercase tracking-wider px-4 h-8 rounded-lg shadow-md shadow-amber-500/20"
                        >
                          {busy === p.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-black" />
                          ) : (
                            <>
                              <Crown className="h-3 w-3 mr-1 fill-black/30" /> Buy file
                            </>
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
              <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          )}
        </>
      )}

      {delivered && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setDelivered(null)}>
          <div className="w-full max-w-md rounded-3xl border border-amber-500/40 bg-gradient-to-b from-[#181a24] to-[#0e111a] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                <Crown className="h-5 w-5 fill-amber-400/25" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-white">{delivered.name}</h3>
                <span className="text-xs text-amber-400 font-semibold">VIP Download Ready</span>
              </div>
            </div>
            <p className="text-sm text-white/70 leading-relaxed">{delivered.content}</p>
            <div className="mt-5 flex justify-end gap-2.5">
              <Button variant="outline" onClick={() => setDelivered(null)} className="rounded-xl">Close</Button>
              <Button onClick={() => { window.location.href = "/orders"; }} className="bg-gradient-to-r from-amber-500 to-amber-600 text-black font-bold rounded-xl shadow-lg shadow-amber-500/20">
                Go to Orders
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
};

export default Dumps;
