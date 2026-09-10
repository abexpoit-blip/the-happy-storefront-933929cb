import { useCallback, useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useServerFn } from "@tanstack/react-start";
import { listApiKeys, createApiKey, updateApiKey, type ApiKeyListRow } from "@/lib/apiKeys.functions";
import { toast } from "sonner";
import { KeyRound, Plus, RefreshCw, Trash2, Copy, ShieldOff, ShieldCheck, Unlock } from "lucide-react";

const AdminApiKeys = () => {
  const load = useServerFn(listApiKeys);
  const create = useServerFn(createApiKey);
  const update = useServerFn(updateApiKey);

  const [keys, setKeys] = useState<ApiKeyListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [credits, setCredits] = useState("0");
  const [dailyLimit, setDailyLimit] = useState("5000");
  const [fresh, setFresh] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setKeys(await load({})); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load API keys"); }
    setLoading(false);
  }, [load]);

  useEffect(() => { refresh(); }, [refresh]);

  const add = async () => {
    if (label.trim().length < 2) { toast.error("Give the key a name"); return; }
    try {
      const res = await create({
        data: {
          label: label.trim(),
          ownerNote: note.trim() || undefined,
          credits: Math.max(0, Number(credits) || 0),
          dailyLimit: Math.max(0, Number(dailyLimit) || 0),
        },
      });
      setFresh(res.apiKey);
      setLabel(""); setNote("");
      toast.success("API key created — copy it now, it is shown only once");
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const act = async (data: Parameters<typeof updateApiKey>[0] extends never ? never : Record<string, unknown>) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await update({ data: data as any });
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const copy = (v: string) => { navigator.clipboard.writeText(v); toast.success("Copied"); };

  return (
    <AdminLayout title="API keys">
      <div className="rounded-2xl border border-border/60 bg-card/60 p-5 space-y-4">
        <div className="flex items-center gap-2 font-semibold"><Plus className="h-4 w-4" /> New key</div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name (bot / merchant)" />
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Owner note (optional)" />
          <Input value={credits} onChange={(e) => setCredits(e.target.value)} placeholder="Start credits" inputMode="numeric" />
          <Input value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} placeholder="Cards per day (0 = unlimited)" inputMode="numeric" />
        </div>
        <Button onClick={add}><KeyRound className="h-4 w-4 mr-2" />Generate key</Button>

        {fresh && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-2">
            <div className="text-[13px] font-semibold">Copy this key now — it will never be shown again.</div>
            <div className="flex items-center gap-2">
              <code className="font-mono text-[13px] break-all">{fresh}</code>
              <Button size="sm" variant="outline" onClick={() => copy(fresh)}><Copy className="h-4 w-4" /></Button>
            </div>
          </div>
        )}

        <div className="text-[12px] text-muted-foreground leading-relaxed">
          One key = one bot or merchant. The first request locks the key to that server IP.
          <br />Endpoints: <code>POST /api/public/checker/check</code>, <code>POST /api/public/checker/result</code>,
          {" "}<code>GET /api/public/checker/balance</code> — send the key in the <code>x-api-key</code> header.
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={refresh}><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/60 overflow-x-auto">
        {loading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : keys.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No API keys yet.</div>
        ) : (
          <table className="w-full text-[13px] min-w-[900px]">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border/50">
                <th className="text-left p-3">Name</th>
                <th className="text-left">Key</th>
                <th className="text-left">Credits</th>
                <th className="text-left">Daily limit</th>
                <th className="text-left">Locked IP</th>
                <th className="text-left">Usage</th>
                <th className="text-left">Last used</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-b border-border/40">
                  <td className="p-3">
                    <div className="font-semibold">{k.label}</div>
                    {k.ownerNote && <div className="text-[12px] text-muted-foreground">{k.ownerNote}</div>}
                  </td>
                  <td className="font-mono">{k.prefix}…</td>
                  <td>{k.credits}</td>
                  <td>{k.dailyLimit === 0 ? "∞" : k.dailyLimit}</td>
                  <td className="font-mono text-[12px]">{k.lockedIp ?? "—"}</td>
                  <td>{k.requestCount} req · {k.cardsChecked} cards</td>
                  <td className="text-[12px] text-muted-foreground">
                    {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "—"}
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => {
                        const v = prompt("Add credits (negative to remove)", "1000");
                        if (v) act({ id: k.id, addCredits: Math.trunc(Number(v) || 0) });
                      }}>+ credits</Button>
                      <Button size="sm" variant="ghost" title="Reset IP lock"
                        onClick={() => act({ id: k.id, resetIp: true })}><Unlock className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" title={k.active ? "Disable" : "Enable"}
                        onClick={() => act({ id: k.id, active: !k.active })}>
                        {k.active ? <ShieldCheck className="h-4 w-4 text-emerald-600" /> : <ShieldOff className="h-4 w-4 text-rose-600" />}
                      </Button>
                      <Button size="sm" variant="ghost" title="Delete"
                        onClick={() => { if (confirm(`Delete key "${k.label}"?`)) act({ id: k.id, remove: true }); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminApiKeys;
