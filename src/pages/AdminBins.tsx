import { useEffect, useState, useMemo } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Loader2, Upload, Trash2, Eye, EyeOff, Flame, Search, Copy, Check,
  RefreshCw, AlertTriangle, TrendingUp, Globe, Hash, Layers, PackagePlus
} from "lucide-react";
import { adminCreateBins, adminListSection, adminSetProductActive, parseBinLines, type SectionProduct } from "@/lib/sections";
import { adminDeleteProduct } from "@/lib/store";
import { getBinDemandStats, deleteBinDemandItem, type BinDemandSummary } from "@/lib/binDemand.functions";
import { resolveCountryName, flagEmoji } from "@/lib/countries";
import { Link } from "react-router-dom";

const SAMPLE = "424242 | US | CREDIT | Platinum | Visa | SHOPIFY 500/1000$ order | 80";

const AdminBins = () => {
  const [tab, setTab] = useState<"demand" | "products">("demand");

  // Demand Tracker State
  const [demandLoading, setDemandLoading] = useState(true);
  const [demandData, setDemandData] = useState<BinDemandSummary | null>(null);
  const [demandQuery, setDemandQuery] = useState("");
  const [onlyOutOfStock, setOnlyOutOfStock] = useState(false);
  const [copiedBin, setCopiedBin] = useState<string | null>(null);

  // BIN Products / Upload State
  const [rows, setRows] = useState<SectionProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const loadDemand = async () => {
    setDemandLoading(true);
    try {
      const res = await getBinDemandStats({
        data: {
          search: demandQuery.trim() || undefined,
          onlyOutOfStock,
          limit: 200,
        },
      });
      setDemandData(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load demand stats");
    }
    setDemandLoading(false);
  };

  const loadProducts = async () => {
    setLoading(true);
    try {
      setRows(await adminListSection("bin"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load BIN products");
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadDemand();
    void loadProducts();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadDemand();
    }, 300);
    return () => clearTimeout(t);
  }, [demandQuery, onlyOutOfStock]);

  const copyToClipboard = (bin: string) => {
    navigator.clipboard.writeText(bin);
    setCopiedBin(bin);
    toast.success(`BIN ${bin} copied`);
    setTimeout(() => setCopiedBin(null), 2000);
  };

  const handleDeleteDemand = async (bin: string) => {
    if (!confirm(`Remove demand stat for BIN ${bin}?`)) return;
    try {
      await deleteBinDemandItem({ data: { bin } });
      toast.success("Stat removed");
      void loadDemand();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const upload = async () => {
    const { rows: parsed, errors } = parseBinLines(text);
    if (errors.length) toast.error(errors.slice(0, 3).join(" · "));
    if (!parsed.length) return;
    setSaving(true);
    try {
      const n = await adminCreateBins(parsed);
      toast.success(`${n} BIN(s) published`);
      setText("");
      void loadProducts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
    setSaving(false);
  };

  const onFile = async (f: File | null) => {
    if (!f) return;
    setText(await f.text());
  };

  const maxDemand = useMemo(() => {
    if (!demandData?.items?.length) return 1;
    return Math.max(...demandData.items.map((i) => i.search_count), 1);
  }, [demandData]);

  return (
    <AdminLayout title="BIN Analytics & Management">
      {/* Top Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-white/10 pb-4">
        <div className="flex items-center gap-2 rounded-xl bg-white/5 p-1 border border-white/10">
          <button
            onClick={() => setTab("demand")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              tab === "demand"
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                : "text-muted-foreground hover:text-white"
            }`}
          >
            <Flame className="h-4 w-4 text-amber-400" />
            <span>Customer Demand (Most Searched)</span>
            {demandData?.totalSearches ? (
              <span className="ml-1.5 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                {demandData.totalSearches}
              </span>
            ) : null}
          </button>

          <button
            onClick={() => setTab("products")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              tab === "products"
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                : "text-muted-foreground hover:text-white"
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>BIN Market & Upload</span>
            <span className="ml-1.5 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
              {rows.length}
            </span>
          </button>
        </div>

        {tab === "demand" && (
          <Button
            size="sm"
            variant="outline"
            onClick={loadDemand}
            disabled={demandLoading}
            className="border-white/10 text-xs gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${demandLoading ? "animate-spin" : ""}`} />
            Refresh Analytics
          </Button>
        )}
      </div>

      {/* TAB 1: CUSTOMER DEMAND TRACKER */}
      {tab === "demand" && (
        <div className="space-y-6">
          {/* Summary Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border/40 bg-card/50 p-4 relative overflow-hidden">
              <div className="flex items-center justify-between text-muted-foreground mb-1 text-xs">
                <span>Total Customer Searches</span>
                <Search className="h-4 w-4 text-primary-glow" />
              </div>
              <div className="text-2xl font-extrabold text-foreground">{demandData?.totalSearches ?? 0}</div>
              <p className="text-[11px] text-muted-foreground mt-1">Live customer query count</p>
            </div>

            <div className="rounded-xl border border-border/40 bg-card/50 p-4 relative overflow-hidden">
              <div className="flex items-center justify-between text-muted-foreground mb-1 text-xs">
                <span>Unique BINs Demanded</span>
                <Hash className="h-4 w-4 text-cyan-400" />
              </div>
              <div className="text-2xl font-extrabold text-foreground">{demandData?.uniqueBinsTracked ?? 0}</div>
              <p className="text-[11px] text-muted-foreground mt-1">Distinct BIN patterns searched</p>
            </div>

            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 relative overflow-hidden">
              <div className="flex items-center justify-between text-amber-400 mb-1 text-xs font-semibold">
                <span>Out of Stock (High Need)</span>
                <AlertTriangle className="h-4 w-4 text-amber-400" />
              </div>
              <div className="text-2xl font-extrabold text-amber-300">{demandData?.outOfStockDemanded ?? 0}</div>
              <p className="text-[11px] text-amber-400/80 mt-1">Customers searching but 0 cards</p>
            </div>

            <div className="rounded-xl border border-border/40 bg-card/50 p-4 relative overflow-hidden">
              <div className="flex items-center justify-between text-muted-foreground mb-1 text-xs">
                <span>Top Wanted Country</span>
                <Globe className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-extrabold text-foreground flex items-center gap-2">
                {demandData?.topCountry ? (
                  <>
                    <span>{flagEmoji(demandData.topCountry)}</span>
                    <span>{demandData.topCountry}</span>
                  </>
                ) : (
                  "—"
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {demandData?.topBrand ? `Brand: ${demandData.topBrand}` : "Global demand"}
              </p>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-secondary/30 border border-border/40 rounded-xl p-3">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search BIN, Country, Bank, Brand..."
                value={demandQuery}
                onChange={(e) => setDemandQuery(e.target.value)}
                className="pl-9 h-9 text-xs bg-background/60 border-border/50"
              />
            </div>

            <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer select-none text-muted-foreground hover:text-foreground">
                <input
                  type="checkbox"
                  checked={onlyOutOfStock}
                  onChange={(e) => setOnlyOutOfStock(e.target.checked)}
                  className="rounded border-border/60 bg-background/80 text-primary focus:ring-0 h-4 w-4 cursor-pointer"
                />
                <span className={onlyOutOfStock ? "text-amber-400 font-bold" : ""}>
                  Show Out of Stock Only (High Need)
                </span>
              </label>
            </div>
          </div>

          {/* Demand Table */}
          <div className="rounded-2xl border border-border/50 overflow-x-auto bg-card/50">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-secondary/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 w-12">#</th>
                  <th className="text-left px-4 py-3">BIN</th>
                  <th className="text-left px-4 py-3">Demand Volume</th>
                  <th className="text-left px-4 py-3">Brand & Level</th>
                  <th className="text-left px-4 py-3">Issuing Bank</th>
                  <th className="text-left px-4 py-3">Country</th>
                  <th className="text-left px-4 py-3">Stock Status</th>
                  <th className="text-left px-4 py-3">Last Searched</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {demandLoading && (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin inline mb-2 text-primary" />
                      <p className="text-xs">Analyzing customer search demand...</p>
                    </td>
                  </tr>
                )}

                {!demandLoading && (!demandData?.items || demandData.items.length === 0) && (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                      <Flame className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                      <p className="font-semibold text-sm">No customer BIN searches recorded yet</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        When users search BINs in the Shop or BIN market, they will instantly appear here with demand metrics.
                      </p>
                    </td>
                  </tr>
                )}

                {!demandLoading &&
                  demandData?.items?.map((item, idx) => {
                    const ratio = Math.min(100, Math.max(10, Math.round((item.search_count / maxDemand) * 100)));
                    const isOutOfStock = item.in_stock === 0;

                    return (
                      <tr
                        key={item.bin}
                        className={`border-t border-border/40 transition-colors ${
                          isOutOfStock ? "bg-amber-500/[0.02] hover:bg-amber-500/[0.06]" : "hover:bg-white/[0.02]"
                        }`}
                      >
                        {/* Rank */}
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {idx === 0 ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 font-bold text-xs">
                              1
                            </span>
                          ) : idx === 1 ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-300/20 text-slate-200 font-bold text-xs">
                              2
                            </span>
                          ) : idx === 2 ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-700/20 text-amber-500 font-bold text-xs">
                              3
                            </span>
                          ) : (
                            <span className="text-muted-foreground">{idx + 1}</span>
                          )}
                        </td>

                        {/* BIN with Copy */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-base font-extrabold text-foreground tracking-wider">
                              {item.bin}
                            </span>
                            <button
                              onClick={() => copyToClipboard(item.bin)}
                              className="text-muted-foreground hover:text-primary transition-colors p-1"
                              title="Copy BIN"
                            >
                              {copiedBin === item.bin ? (
                                <Check className="h-3.5 w-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </td>

                        {/* Demand Meter */}
                        <td className="px-4 py-3">
                          <div className="space-y-1 max-w-[140px]">
                            <div className="flex items-center justify-between text-xs">
                              <span className="inline-flex items-center gap-1 font-bold text-amber-400">
                                <Flame className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                                {item.search_count} {item.search_count === 1 ? "search" : "searches"}
                              </span>
                            </div>
                            <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-red-500"
                                style={{ width: `${ratio}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Brand & Level */}
                        <td className="px-4 py-3">
                          <div className="text-xs">
                            <span className="font-bold text-foreground">{item.brand || "—"}</span>
                            {(item.card_type || item.card_level) && (
                              <div className="text-[11px] text-muted-foreground uppercase font-mono">
                                {[item.card_type, item.card_level].filter(Boolean).join(" · ")}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Bank */}
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[180px] truncate" title={item.bank || ""}>
                          {item.bank || "—"}
                        </td>

                        {/* Country */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span>{flagEmoji(item.country)}</span>
                            <span className="font-medium text-foreground">{item.country || "—"}</span>
                            {item.country && (
                              <span className="text-[10px] text-muted-foreground hidden lg:inline">
                                ({resolveCountryName(item.country)})
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Stock Status */}
                        <td className="px-4 py-3">
                          {isOutOfStock ? (
                            <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 text-xs font-bold text-amber-300">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                              0 in stock (HIGH DEMAND)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-xs font-bold text-emerald-300">
                              <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                              {item.in_stock} in stock
                            </span>
                          )}
                        </td>

                        {/* Last Searched */}
                        <td className="px-4 py-3 text-xs text-muted-foreground font-mono whitespace-nowrap">
                          {new Date(item.last_searched_at).toLocaleDateString()}{" "}
                          {new Date(item.last_searched_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <Link
                              to={`/admin?tab=card-upload&bin=${item.bin}`}
                              className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary-glow hover:bg-primary/20 transition-all"
                              title="Upload cards for this demanded BIN"
                            >
                              <PackagePlus className="h-3.5 w-3.5" />
                              Upload
                            </Link>

                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteDemand(item.bin)}
                              title="Clear stat"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: BIN PRODUCTS & UPLOAD */}
      {tab === "products" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 to-transparent p-5 space-y-3">
            <h2 className="font-display text-lg font-bold">Upload BINs</h2>
            <p className="text-xs text-muted-foreground">
              One BIN per line: <code>BIN | COUNTRY | TYPE | LEVEL | BRAND | CATEGORY | PRICE</code><br />
              Example: <code>{SAMPLE}</code>
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder={SAMPLE}
              className="w-full rounded-xl bg-secondary/40 border border-border/50 p-3 font-mono text-xs text-foreground"
            />
            <div className="flex flex-wrap items-center gap-3">
              <Input type="file" accept=".txt,.csv" className="max-w-xs" onChange={(e) => void onFile(e.target.files?.[0] ?? null)} />
              <Button onClick={upload} disabled={saving || !text.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />} Publish
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border/50 overflow-x-auto bg-card/50">
            <table className="w-full text-sm min-w-[860px]">
              <thead className="bg-secondary/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">BIN</th>
                  <th className="text-left px-4 py-3">Country</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-left px-4 py-3">Level</th>
                  <th className="text-left px-4 py-3">Brand</th>
                  <th className="text-left px-4 py-3">Category</th>
                  <th className="text-left px-4 py-3">Price</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center">
                      <Loader2 className="h-5 w-5 animate-spin inline" />
                    </td>
                  </tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                      No BINs uploaded yet.
                    </td>
                  </tr>
                )}
                {rows.map((p) => (
                  <tr key={p.id} className="border-t border-border/40">
                    <td className="px-4 py-3 font-mono font-bold">{p.bin}</td>
                    <td className="px-4 py-3">{p.country || "—"}</td>
                    <td className="px-4 py-3">{p.card_type || "—"}</td>
                    <td className="px-4 py-3">{p.card_level || "—"}</td>
                    <td className="px-4 py-3">{p.brand || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.bin_category || "—"}</td>
                    <td className="px-4 py-3 font-bold text-primary-glow">${p.price.toFixed(2)}</td>
                    <td className="px-4 py-3">{p.active ? "Active" : "Hidden"}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="outline"
                        className="mr-2"
                        onClick={async () => {
                          await adminSetProductActive(p.id, !p.active);
                          void loadProducts();
                        }}
                      >
                        {p.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={async () => {
                          if (!confirm("Delete this BIN?")) return;
                          await adminDeleteProduct(p.id);
                          void loadProducts();
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminBins;
