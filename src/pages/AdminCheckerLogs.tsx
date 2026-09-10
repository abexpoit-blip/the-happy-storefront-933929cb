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

const AdminCheckerLogs = () => {
  const load = useServerFn(adminCheckerLogs);
  const exportFile = useServerFn(adminCheckerExport);
  const removeLogs = useServerFn(adminDeleteCheckerLogs);
  const purge = useServerFn(adminPurgeCheckerLogs);

  const [day, setDay] = useState(today());
  const [search, setSearch] = useState("");
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

  const toggle = (id: string) =>
    setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <AdminLayout title="Checker logs">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Runs", value: totals.runs },
          { label: "Cards checked", value: totals.cards },
          { label: "Live", value: totals.live },
          { label: "Dead", value: totals.dead },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-border/60 bg-card/60 p-4">
            <div className="text-[12px] uppercase tracking-wide text-muted-foreground">{s.label}</div>
            <div className="mt-1 text-2xl font-black">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="w-[170px]" />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="User or task id"
            className="pl-9 w-[220px]"
          />
        </div>
        <Button variant="outline" onClick={refresh}><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/60 p-4 space-y-3">
        <div className="text-[13px] font-semibold">Daily files — full card details, kept for 30 days</div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => download({ liveOnly: false, format: "txt", from: day })}>
            <Download className="h-4 w-4 mr-2" />All checks (.txt)
          </Button>
          <Button variant="outline" onClick={() => download({ liveOnly: false, format: "csv", from: day })}>
            <Download className="h-4 w-4 mr-2" />All checks (.csv)
          </Button>
          <Button onClick={() => download({ liveOnly: true, format: "txt", from: day })}>
            <Download className="h-4 w-4 mr-2" />LIVE only — this day
          </Button>
          <Button variant="secondary" onClick={() => download({ liveOnly: true, format: "csv", from: daysAgo(29), to: day })}>
            <Download className="h-4 w-4 mr-2" />LIVE — last 30 days (.csv)
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="destructive" onClick={deleteDay} disabled={!runs.length}>
            <Trash2 className="h-4 w-4 mr-2" />Delete this day
          </Button>
          <Button variant="outline" onClick={purgeOld}>
            <Trash2 className="h-4 w-4 mr-2" />Purge older than 30 days
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/60 overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : runs.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
            <Activity className="h-4 w-4" /> No checks on this day.
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {runs.map((r) => (
              <div key={r.taskId}>
                <div className="flex flex-wrap items-center gap-3 p-4">
                  <button onClick={() => toggle(r.taskId)} className="text-muted-foreground">
                    {open.has(r.taskId) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <div className="min-w-[160px]">
                    <div className="text-sm font-semibold">{r.who}</div>
                    <div className="text-[12px] text-muted-foreground">
                      {new Date(r.createdAt).toLocaleString()} · {r.source}
                    </div>
                  </div>
                  <div className="text-[12px] text-muted-foreground min-w-[150px]">{r.gate}</div>
                  <div className="text-sm">{r.total} cards</div>
                  <div className="text-sm text-emerald-600">{r.live} live</div>
                  <div className="text-sm text-rose-600">{r.dead} dead</div>
                  <div className="text-sm text-amber-600">{r.other} other</div>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-[12px] text-muted-foreground">{r.status}</span>
                    <Button size="sm" variant="ghost" title="Copy full list" onClick={() => copyRun(r)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteRun(r.taskId)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {open.has(r.taskId) && (
                  <div className="bg-secondary/20 px-4 pb-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-[13px] min-w-[760px]">
                        <thead className="text-muted-foreground">
                          <tr>
                            <th className="text-left py-2">Full card</th>
                            <th className="text-left">Status</th>
                            <th className="text-left">Category</th>
                            <th className="text-left">Message</th>
                            <th className="text-right" />
                          </tr>
                        </thead>
                        <tbody>
                          {r.rows.map((c, i) => (
                            <tr key={`${c.card}-${i}`} className="border-t border-border/40">
                              <td className="py-1.5 font-mono">{c.full ?? c.card}</td>
                              <td className={`uppercase font-semibold ${statusColor(c.status)}`}>{c.status}</td>
                              <td>{c.category}</td>
                              <td className="text-muted-foreground">{c.msg}</td>
                              <td className="text-right">
                                <Button size="sm" variant="ghost" onClick={() => copy(c.full ?? c.card)}>
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
