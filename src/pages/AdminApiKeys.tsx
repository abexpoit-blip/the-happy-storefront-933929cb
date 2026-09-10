import { useCallback, useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useServerFn } from "@tanstack/react-start";
import { listApiKeys, createApiKey, updateApiKey, listKeyOwners, type ApiKeyListRow } from "@/lib/apiKeys.functions";
import { listApiRequests, setApiRequestStatus, type AdminApiRequest } from "@/lib/apiAccess.functions";
import { toast } from "sonner";
import { KeyRound, Plus, RefreshCw, Trash2, Copy, ShieldOff, ShieldCheck, Unlock, Check, X } from "lucide-react";

const AdminApiKeys = () => {
  const load = useServerFn(listApiKeys);
  const create = useServerFn(createApiKey);
  const update = useServerFn(updateApiKey);
  const owners = useServerFn(listKeyOwners);
  const loadRequests = useServerFn(listApiRequests);
  const setRequest = useServerFn(setApiRequestStatus);

  const [keys, setKeys] = useState<ApiKeyListRow[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [requests, setRequests] = useState<AdminApiRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [userId, setUserId] = useState("");
  const [note, setNote] = useState("");
  const [credits, setCredits] = useState("0");
  const [dailyLimit, setDailyLimit] = useState("5000");
  const [requestId, setRequestId] = useState<string | undefined>(undefined);
  const [fresh, setFresh] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [k, u, r] = await Promise.all([load({}), owners({}), loadRequests({})]);
      setKeys(k); setUsers(u); setRequests(r);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load API keys"); }
    setLoading(false);
  }, [load, owners, loadRequests]);

  useEffect(() => { refresh(); }, [refresh]);

  const add = async () => {
    if (label.trim().length < 2) { toast.error("Give the key a name"); return; }
    if (!userId) { toast.error("Select the user this key belongs to"); return; }
    try {
      const res = await create({
        data: {
          label: label.trim(),
          userId,
          requestId,
          ownerNote: note.trim() || undefined,
          credits: Math.max(0, Number(credits) || 0),
          dailyLimit: Math.max(0, Number(dailyLimit) || 0),
        },
      });
      setFresh(res.apiKey);
      setLabel(""); setNote(""); setRequestId(undefined);
      toast.success("API key created — copy it now, it is shown only once");
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const act = async (data: Record<string, unknown>) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await update({ data: data as any });
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const decide = async (id: string, status: "approved" | "rejected") => {
    try {
      await setRequest({ data: { id, status } });
      toast.success(status === "approved" ? "Marked approved" : "Rejected — fee refunded");
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const prefill = (r: AdminApiRequest) => {
    setUserId(r.userId);
    setLabel(`${r.who} API`);
    setRequestId(r.id);
    toast.info(`Form filled for ${r.who} — set credits and generate`);
  };

  const copy = (v: string) => { navigator.clipboard.writeText(v); toast.success("Copied"); };

  return (
    <AdminLayout title="API keys">
      <div className="rounded-2xl border border-border/60 bg-card/60 p-5 space-y-4">
        <div className="flex items-center gap-2 font-semibold"><Plus className="h-4 w-4" /> New key</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name (bot / merchant)" />
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Select user…</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
          <Input value={credits} onChange={(e) => setCredits(e.target.value)} placeholder="Start credits" inputMode="numeric" />
          <Input value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} placeholder="Cards/day (0 = ∞)" inputMode="numeric" />
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
          One key = one user. The first request locks the key to that server IP.
          <br />Endpoints: <code>POST /api/public/checker/check</code>, <code>POST /api/public/checker/result</code>,
          {" "}<code>GET /api/public/checker/balance</code> — send the key in the <code>x-api-key</code> header.
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/60 p-5 space-y-3">
        <div className="font-semibold">Access requests</div>
        {requests.length === 0 ? (
          <div className="text-sm text-muted-foreground">No requests yet.</div>
        ) : (
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border/50 p-3">
                <div className="min-w-[160px]">
                  <div className="text-sm font-semibold">{r.who}</div>
                  <div className="text-[12px] text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString()} · paid ${r.fee.toFixed(2)}
                  </div>
                </div>
                {r.purpose && <div className="text-[12px] text-muted-foreground max-w-[320px]">{r.purpose}</div>}
                <span className="text-[12px] uppercase font-semibold">{r.status}</span>
                <div className="ml-auto flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => prefill(r)}>Issue key</Button>
                  <Button size="sm" variant="ghost" onClick={() => decide(r.id, "approved")}><Check className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => decide(r.id, "rejected")}><X className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
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
          <table className="w-full text-[13px] min-w-[980px]">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border/50">
                <th className="text-left p-3">Name</th>
                <th className="text-left">User</th>
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
                  <td>{k.owner ?? "—"}</td>
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
