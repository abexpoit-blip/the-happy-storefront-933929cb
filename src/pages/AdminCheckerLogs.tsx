import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useServerFn } from "@tanstack/react-start";
import { adminCheckerLogs, adminDeleteCheckerLogs, type AdminCheckRun } from "@/lib/adminChecker.functions";
import { toast } from "sonner";
import { Activity, Download, Trash2, RefreshCw, ChevronDown, ChevronRight, Search } from "lucide-react";

const today = () => new Date().toISOString().slice(0, 10);

const statusColor = (s: string) =>
  s === "live" ? "text-emerald-600" : s === "dead" ? "text-rose-600" : "text-amber-600";

const AdminCheckerLogs = () => {
  const load = useServerFn(adminCheckerLogs);
  const removeLogs = useServerFn(adminDeleteCheckerLogs);

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

  const exportDay = () => {
    const lines = [
      "time|user|source|gate|card|status|category|message",
      ...runs.flatMap((r) =>
        r.rows.map((c) =>
          [new Date(r.createdAt).toISOString(), r.who, r.source, r.gate, c.card, c.status, c.category, c.msg]
            .map((v) => String(v ?? "").replace(/\|/g, "/"))
            .join("|"),
        ),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `checker-${day}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
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
        <Button variant="outline" onClick={exportDay} disabled={!runs.length}>
          <Download className="h-4 w-4 mr-2" />Daily file
        </Button>
        <Button variant="destructive" onClick={deleteDay} disabled={!runs.length}>
          <Trash2 className="h-4 w-4 mr-2" />Delete day
        </Button>
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
                    <Button size="sm" variant="ghost" onClick={() => deleteRun(r.taskId)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {open.has(r.taskId) && (
                  <div className="bg-secondary/20 px-4 pb-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-[13px]">
                        <thead className="text-muted-foreground">
                          <tr>
                            <th className="text-left py-2">Card</th>
                            <th className="text-left">Status</th>
                            <th className="text-left">Category</th>
                            <th className="text-left">Message</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.rows.map((c, i) => (
                            <tr key={`${c.card}-${i}`} className="border-t border-border/40">
                              <td className="py-1.5 font-mono">{c.card}</td>
                              <td className={`uppercase font-semibold ${statusColor(c.status)}`}>{c.status}</td>
                              <td>{c.category}</td>
                              <td className="text-muted-foreground">{c.msg}</td>
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
