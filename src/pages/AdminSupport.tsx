import { useCallback, useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { toast } from "sonner";
import { Loader2, Send, LifeBuoy } from "lucide-react";
import {
  listAllTickets,
  listMessages,
  replyToTicket,
  setTicketStatus,
  type SupportTicket,
  type SupportMessage,
  type TicketStatus,
} from "@/lib/support";

const FILTERS: Array<TicketStatus | "all"> = ["all", "open", "answered", "closed"];

const AdminSupport = () => {
  const [filter, setFilter] = useState<TicketStatus | "all">("open");
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await listAllTickets(filter);
      setTickets(rows);
      setActiveId((cur) => (cur && rows.some((r) => r.id === cur) ? cur : rows[0]?.id ?? null));
    } catch {
      toast.error("Could not load tickets");
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    void listMessages(activeId).then(setMessages).catch(() => setMessages([]));
  }, [activeId]);

  const active = tickets.find((t) => t.id === activeId) ?? null;

  const send = async () => {
    if (!activeId || !reply.trim()) return;
    setBusy(true);
    try {
      await replyToTicket(activeId, reply.trim(), true);
      setReply("");
      setMessages(await listMessages(activeId));
      await load();
    } catch {
      toast.error("Could not send reply");
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (status: TicketStatus) => {
    if (!activeId) return;
    try {
      await setTicketStatus(activeId, status);
      await load();
      toast.success(`Ticket marked ${status}`);
    } catch {
      toast.error("Could not update status");
    }
  };

  return (
    <AdminLayout title="Support">
      <div className="rounded-2xl border border-border/50 bg-card/40 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <LifeBuoy className="h-4 w-4 text-primary-glow" />
          <span className="text-sm font-medium">Support tickets</span>
          <div className="ml-auto flex gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`h-8 px-3 rounded-lg text-xs capitalize border transition ${
                  filter === f
                    ? "bg-primary/20 border-primary/40 text-primary-glow"
                    : "border-border/50 text-muted-foreground hover:bg-secondary/40"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[320px_1fr]">
          <div className="rounded-xl border border-border/50 overflow-hidden max-h-[560px] overflow-y-auto">
            {tickets.length === 0 && <div className="p-6 text-center text-xs text-muted-foreground">No tickets.</div>}
            {tickets.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveId(t.id)}
                className={`w-full text-left px-4 py-3 border-b border-border/40 transition ${
                  t.id === activeId ? "bg-primary/10" : "hover:bg-secondary/30"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{t.subject}</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{t.status}</span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {t.username ?? t.user_id.slice(0, 8)} · {new Date(t.last_activity_at).toLocaleString()}
                </div>
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-border/50 flex flex-col min-h-[420px]">
            {!active && <div className="flex-1 grid place-items-center text-xs text-muted-foreground">Select a ticket.</div>}
            {active && (
              <>
                <div className="px-4 py-3 border-b border-border/40 flex flex-wrap items-center gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{active.subject}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {active.username ?? active.user_id} · {active.priority} priority
                    </div>
                  </div>
                  <div className="ml-auto flex gap-1.5">
                    <button onClick={() => void changeStatus("open")} className="h-8 px-3 rounded-lg border border-border/50 text-xs hover:bg-secondary/40">Open</button>
                    <button onClick={() => void changeStatus("closed")} className="h-8 px-3 rounded-lg border border-border/50 text-xs hover:bg-secondary/40">Close</button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                  {messages.map((m) => (
                    <div key={m.id} className={`flex ${m.is_staff ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm ${m.is_staff ? "bg-primary/20 border border-primary/30" : "bg-secondary/40 border border-border/40"}`}>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                          {m.is_staff ? "Support" : "User"}
                        </div>
                        <p className="whitespace-pre-line break-words">{m.body}</p>
                        <div className="text-[10px] text-muted-foreground mt-1">{new Date(m.created_at).toLocaleString()}</div>
                      </div>
                    </div>
                  ))}
                  {messages.length === 0 && <div className="text-center text-xs text-muted-foreground">No messages.</div>}
                </div>

                <div className="border-t border-border/40 p-3 flex items-end gap-2">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={2}
                    placeholder="Reply to the user…"
                    className="flex-1 resize-none rounded-lg bg-input/40 border border-border/50 p-2.5 text-sm outline-none focus:border-primary/50"
                  />
                  <button
                    onClick={() => void send()}
                    disabled={busy || !reply.trim()}
                    className="h-10 px-4 rounded-lg bg-gradient-primary text-sm inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminSupport;
