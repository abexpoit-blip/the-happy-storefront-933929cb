import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useServerFn } from "@tanstack/react-start";
import {
  adminCheckerLogs,
  adminCheckerExport,
  adminDeleteCheckerLogs,
  adminPurgeCheckerLogs,
  type AdminCheckRun,
} from "@/lib/adminChecker.functions";
import { toast } from "sonner";
import { Activity, Download, Trash2, RefreshCw, ChevronDown, ChevronRight, Search, Copy } from "lucide-react";

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

const statusColor = (s: string) =>
  s === "live" ? "text-emerald-600" : s === "dead" ? "text-rose-600" : "text-amber-600";

const getInitialSearch = () => {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    return params.get("search") || "";
  }
  return "";
};

const AdminCheckerLogs = () => {
  const load = useServerFn(adminCheckerLogs);
  const exportFile = useServerFn(adminCheckerExport);
  const removeLogs = useServerFn(adminDeleteCheckerLogs);
  const purge = useServerFn(adminPurgeCheckerLogs);

  const [day, setDay] = useState(today());
  const [search, setSearch] = useState(getInitialSearch);
  const [runs, setRuns] = useState<AdminCheckRun[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRuns(await load({ data: { day, search } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load checker logs");
    }
    setLoading(false);
  }, [load, day, search]);

  useEffect(() => {
    const t = setTimeout(refresh, 250);
    return () => clearTimeout(t);
  }, [refresh]);

  const totals = useMemo(() => {
    const cards = runs.reduce((n, r) => n + r.total, 0);
    const live = runs.reduce((n, r) => n + r.live, 0);
    const dead = runs.reduce((n, r) => n + r.dead, 0);
    return { runs: runs.length, cards, live, dead };
  }, [runs]);

  const save = (name: string, text: string) => {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const downloadFilteredLive = () => {
    const allLiveRows: string[] = [];
    for (const r of runs) {
      for (const c of r.rows) {
        if (c.status === "live") {
          allLiveRows.push(`${c.full ?? c.card} | LIVE | ${c.category || ""} | ${c.msg || ""} | User: ${r.who}`);
        }
      }
    }
    if (!allLiveRows.length) {
      toast.error("No LIVE cards found in current view");
      return;
    }
    const safeTag = (search.trim() || day).replace(/[^a-zA-Z0-9_-]/g, "_");
    save(`live-cards-${safeTag}.txt`, allLiveRows.join("\n"));
    toast.success(`${allLiveRows.length} LIVE card(s) downloaded as .txt`);
  };

  const download = async (opts: { liveOnly: boolean; format: "txt" | "csv"; from: string; to?: string }) => {
    try {
      const res = await exportFile({
        data: { from: opts.from, to: opts.to, liveOnly: opts.liveOnly, format: opts.format, search },
      });
      if (!res.rows) { toast.error("Nothing to export for this selection"); return; }
      const scope = opts.to && opts.to !== opts.from ? `${opts.from}_${opts.to}` : opts.from;
      save(`checker-${opts.liveOnly ? "live-" : ""}${scope}.${opts.format}`, res.content);
      toast.success(`${res.rows} card(s) exported`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Export failed"); }
  };

  const deleteRun = async (taskId: string) => {
    if (!confirm("Delete this checker run permanently?")) return;
    try {
      await removeLogs({ data: { taskId } });
      toast.success("Run deleted");
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const deleteDay = async () => {
    if (!confirm(`Delete every checker log from ${day}?`)) return;
    try {
      const res = await removeLogs({ data: { day } });
      toast.success(`${res.deleted} run(s) deleted`);
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const purgeOld = async () => {
    if (!confirm("Delete every checker log older than 30 days?")) return;
    try {
      const res = await purge({ data: { days: 30 } });
      toast.success(`${res.deleted} old run(s) removed`);
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const copy = (v: string) => { navigator.clipboard.writeText(v); toast.success("Copied"); };

  const copyRun = (r: AdminCheckRun) =>
    copy(r.rows.map((c) => `${c.full ?? c.card} | ${c.status.toUpperCase()} | ${c.msg}`).join("\n"));

  const downloadRunLiveTxt = (r: AdminCheckRun) => {
    const liveCards = r.rows.filter((c) => c.status === "live");
    if (!liveCards.length) {
      toast.error("No live cards found in this check run");
      return;
    }
    const text = liveCards.map((c) => `${c.full ?? c.card} | LIVE | ${c.category || ""} | ${c.msg || ""}`).join("\n");
    save(`live-${r.taskId}.txt`, text);
    toast.success(`${liveCards.length} live card(s) saved as .txt`);
  };

  const copyRunLive = (r: AdminCheckRun) => {
    const liveCards = r.rows.filter((c) => c.status === "live");
    if (!liveCards.length) {
      toast.error("No live cards found in this check run");
      return;
    }
    const text = liveCards.map((c) => `${c.full ?? c.card} | LIVE | ${c.category || ""} | ${c.msg || ""}`).join("\n");
    copy(text);
  };

  const toggle = (id: string) =>
    setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <AdminLayout title="Checker logs">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Runs", value: totals.runs, color: "text-[#38bdf8]" },
          { label: "Cards checked", value: totals.cards, color: "text-white" },
          { label: "Live", value: totals.live, color: "text-emerald-400" },
          { label: "Dead", value: totals.dead, color: "text-rose-400" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-700/80 bg-[#0c1430] p-4 shadow-lg">
            <div className="text-[11px] uppercase font-bold tracking-wider text-slate-400">{s.label}</div>
            <div className={`mt-1 text-2xl font-black font-mono ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="date"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          className="w-[170px] bg-white text-slate-900 border-slate-300 font-medium shadow-sm"
        />
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="User or task id"
            className="pl-9 w-[260px] bg-white text-slate-900 border-slate-300 font-medium placeholder:text-slate-400 shadow-sm"
          />
        </div>
        <Button
          className="bg-[#0c1430] text-white border border-slate-700 hover:bg-[#15234d] font-semibold"
          onClick={refresh}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />Refresh
        </Button>
        {search && (
          <Button
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-sm"
            onClick={downloadFilteredLive}
          >
            <Download className="h-4 w-4 mr-2" />Download Searched LIVE (.txt)
          </Button>
        )}
      </div>

      <div className="rounded-2xl border border-slate-700/80 bg-[#0c1430] p-4 space-y-3 text-white shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[13px] font-semibold text-white">Daily files & LIVE cards (.txt / .csv) — Full card details saved</div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-mono font-semibold">
            {totals.live} LIVE card(s) on {day}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-sm"
            onClick={() => download({ liveOnly: true, format: "txt", from: day })}
          >
            <Download className="h-4 w-4 mr-2" />Download Daily LIVE (.txt)
          </Button>
          <Button
            className="bg-[#15234d] hover:bg-[#1c2e63] text-white border border-slate-600 font-medium"
            onClick={() => download({ liveOnly: false, format: "txt", from: day })}
          >
            <Download className="h-4 w-4 mr-2" />All checks (.txt)
          </Button>
          <Button
            className="bg-[#15234d] hover:bg-[#1c2e63] text-white border border-slate-600 font-medium"
            onClick={() => download({ liveOnly: false, format: "csv", from: day })}
          >
            <Download className="h-4 w-4 mr-2" />All checks (.csv)
          </Button>
          <Button
            className="bg-[#15234d] hover:bg-[#1c2e63] text-[#38bdf8] border border-[#38bdf8]/40 font-medium"
            onClick={() => download({ liveOnly: true, format: "csv", from: daysAgo(29), to: day })}
          >
            <Download className="h-4 w-4 mr-2" />LIVE — last 30 days (.csv)
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-800">
          <Button
            variant="destructive"
            className="bg-red-600/30 hover:bg-red-600/50 text-red-300 border border-red-500/40 font-medium"
            onClick={deleteDay}
            disabled={!runs.length}
          >
            <Trash2 className="h-4 w-4 mr-2" />Delete this day
          </Button>
          <Button
            variant="outline"
            className="bg-[#15234d] hover:bg-[#1c2e63] text-slate-300 border border-slate-600"
            onClick={purgeOld}
          >
            <Trash2 className="h-4 w-4 mr-2" />Purge older than 30 days
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700/80 bg-[#0c1430] overflow-hidden text-white shadow-xl">
        {loading ? (
          <div className="p-6 text-sm text-slate-400">Loading…</div>
        ) : runs.length === 0 ? (
          <div className="p-6 text-sm text-slate-400 flex items-center gap-2">
            <Activity className="h-4 w-4" /> No checks found for this date/search.
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {runs.map((r) => (
              <div key={r.taskId} className="hover:bg-white/[0.02] transition">
                <div className="flex flex-wrap items-center gap-3 p-4">
                  <button onClick={() => toggle(r.taskId)} className="text-slate-400 hover:text-white">
                    {open.has(r.taskId) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <div className="min-w-[170px]">
                    <div className="text-sm font-bold text-white">{r.who}</div>
                    <div className="text-[12px] text-slate-400">
                      {new Date(r.createdAt).toLocaleString()} · <span className="font-mono text-[#38bdf8]">{r.source}</span>
                    </div>
                  </div>
                  <div className="text-[12px] text-slate-300 min-w-[150px] font-mono">{r.gate}</div>
                  <div className="text-sm text-slate-200">{r.total} cards</div>
                  <div className="text-sm font-bold text-emerald-400">{r.live} live</div>
                  <div className="text-sm font-semibold text-rose-400">{r.dead} dead</div>
                  <div className="text-sm text-amber-400">{r.other} other</div>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-[12px] text-slate-400 uppercase font-mono">{r.status}</span>
                    {r.live > 0 && (
                      <>
                        <Button
                          size="sm"
                          className="bg-emerald-600/30 text-emerald-300 border border-emerald-500/50 hover:bg-emerald-600/50 font-semibold text-xs h-8"
                          title="Download LIVE cards (.txt)"
                          onClick={() => downloadRunLiveTxt(r)}
                        >
                          <Download className="h-3.5 w-3.5 mr-1" />
                          LIVE ({r.live}) .txt
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Copy LIVE cards only"
                          className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                          onClick={() => copyRunLive(r)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Copy full list"
                      className="text-slate-300 hover:text-white hover:bg-white/10"
                      onClick={() => copyRun(r)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Delete run"
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={() => deleteRun(r.taskId)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {open.has(r.taskId) && (
                  <div className="bg-[#080e22] px-4 pb-4 border-t border-slate-800">
                    <div className="overflow-x-auto">
                      <table className="w-full text-[13px] min-w-[760px]">
                        <thead className="text-slate-400 border-b border-slate-800">
                          <tr>
                            <th className="text-left py-2 font-semibold">Full card</th>
                            <th className="text-left font-semibold">Status</th>
                            <th className="text-left font-semibold">Category</th>
                            <th className="text-left font-semibold">Message</th>
                            <th className="text-right" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {r.rows.map((c, i) => (
                            <tr key={`${c.card}-${i}`} className="hover:bg-white/[0.02]">
                              <td className="py-2 font-mono text-white text-xs">{c.full ?? c.card}</td>
                              <td className={`uppercase font-bold text-xs ${statusColor(c.status)}`}>{c.status}</td>
                              <td className="text-slate-300 text-xs">{c.category}</td>
                              <td className="text-slate-400 text-xs">{c.msg}</td>
                              <td className="text-right">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-slate-300 hover:text-white hover:bg-white/10"
                                  onClick={() => copy(c.full ?? c.card)}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminCheckerLogs;
