import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import Seo from "@/components/Seo";
import { toast } from "sonner";
import { LifeBuoy, Plus, Send, Loader2, MessageSquare, ShieldCheck, Clock, CheckCircle2 } from "lucide-react";
import {
  listMyTickets,
  listMessages,
  createTicket,
  replyToTicket,
  setTicketStatus,
  type SupportTicket,
  type SupportMessage,
} from "@/lib/support";

const statusStyle: Record<string, string> = {
  open: "bg-[#fff5e6] text-[#e6892b] border-[#ffdcae]",
  answered: "bg-[#e8f5e9] text-[#2e7d32] border-[#c8e6c9]",
  closed: "bg-[#f2f4f7] text-[#8a94a6] border-[#e2e6ec]",
};

const StatusPill = ({ status }: { status: string }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize ${
      statusStyle[status] ?? statusStyle.closed
    }`}
  >
    {status === "answered" ? <ShieldCheck className="h-3 w-3" /> : status === "closed" ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
    {status}
  </span>
);

const Support = () => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState("");
  const [priority, setPriority] = useState("normal");
  const [body, setBody] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadTickets = useCallback(async (select?: string) => {
    try {
      const rows = await listMyTickets();
      setTickets(rows);
      setActiveId((cur) => select ?? cur ?? rows[0]?.id ?? null);
    } catch {
      toast.error("Could not load your tickets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadTickets(); }, [loadTickets]);

  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    let alive = true;
    void listMessages(activeId)
      .then((m) => { if (alive) setMessages(m); })
      .catch(() => { if (alive) setMessages([]); });
    return () => { alive = false; };
  }, [activeId]);

  const active = tickets.find((t) => t.id === activeId) ?? null;

  const submitTicket = async () => {
    if (!subject.trim() || !body.trim()) return toast.error("Subject and message are required");
    setBusy(true);
    try {
      const id = await createTicket(subject.trim(), body.trim(), priority);
      toast.success("Ticket created — our team will reply shortly");
      setSubject(""); setBody(""); setPriority("normal"); setComposing(false);
      await loadTickets(id);
      setMessages(await listMessages(id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create ticket");
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async () => {
    if (!activeId || !reply.trim()) return;
    setBusy(true);
    try {
      await replyToTicket(activeId, reply.trim(), false);
      setReply("");
      setMessages(await listMessages(activeId));
      await loadTickets(activeId);
    } catch {
      toast.error("Could not send message");
    } finally {
      setBusy(false);
    }
  };

  const closeTicket = async () => {
    if (!activeId) return;
    try {
      await setTicketStatus(activeId, "closed");
      toast.success("Ticket closed");
      await loadTickets(activeId);
    } catch {
      toast.error("Could not close ticket");
    }
  };

  return (
    <AppShell>
      <Seo title="Support | Zoru Shop" description="Open a support ticket and chat with our team." path="/support" />

      <div className="rounded-2xl border border-[#e6e6e6] bg-gradient-to-r from-white via-[#fbfcff] to-[#eef4ff] px-5 py-4 flex flex-wrap items-center gap-3 shadow-[0_6px_22px_rgba(20,30,60,0.07)]">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#1f2d3d] to-[#2f4b6e] text-white shadow-[0_6px_16px_rgba(31,45,61,0.35)]">
          <LifeBuoy className="h-5 w-5" />
        </span>
        <div>
          <div className="text-[15px] font-semibold text-[#1f2d3d]">Support center</div>
          <div className="text-[12px] text-[#7b8794]">Average first reply under 30 minutes · 24/7 team</div>
        </div>
        <button
          onClick={() => setComposing((v) => !v)}
          className="ml-auto h-9 px-5 rounded-lg bg-gradient-to-r from-[#2e7d32] to-[#43a047] text-white text-[13px] font-medium shadow-[0_6px_18px_rgba(46,125,50,0.35)] hover:brightness-110 transition inline-flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> New ticket
        </button>
      </div>

      {composing && (
        <div className="mt-3 rounded-2xl border border-[#e6e6e6] bg-white p-5 shadow-[0_6px_22px_rgba(20,30,60,0.06)]">
          <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject — e.g. Deposit not credited"
              className="h-10 rounded-lg border border-[#e0e4ea] px-3 text-[13px] outline-none focus:border-[#2f6fed] focus:ring-2 focus:ring-[#2f6fed]/15"
            />
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="h-10 rounded-lg border border-[#e0e4ea] px-3 text-[13px] bg-white outline-none focus:border-[#2f6fed]"
            >
              <option value="low">Low priority</option>
              <option value="normal">Normal priority</option>
              <option value="high">High priority</option>
            </select>
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="Describe your issue with order ID / BIN / deposit reference…"
            className="mt-3 w-full rounded-lg border border-[#e0e4ea] p-3 text-[13px] outline-none focus:border-[#2f6fed] focus:ring-2 focus:ring-[#2f6fed]/15"
          />
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => void submitTicket()}
              disabled={busy}
              className="h-9 px-5 rounded-lg bg-gradient-to-r from-[#1f2d3d] to-[#38546f] text-white text-[13px] shadow-[0_6px_18px_rgba(31,45,61,0.3)] hover:brightness-110 disabled:opacity-60 inline-flex items-center gap-2"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Submit ticket
            </button>
            <button onClick={() => setComposing(false)} className="h-9 px-4 rounded-lg border border-[#dcdcdc] text-[#555] text-[13px] hover:bg-[#f7f7f7]">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 grid gap-3 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-2xl border border-[#e6e6e6] bg-white overflow-hidden shadow-[0_4px_16px_rgba(20,30,60,0.05)]">
          <div className="px-4 py-2.5 text-[12px] font-medium text-[#7b8794] bg-gradient-to-r from-[#f7f9fc] to-[#eef2fa] border-b border-[#eee]">
            Your tickets ({tickets.length})
          </div>
          <div className="max-h-[520px] overflow-y-auto">
            {loading && <div className="p-6 text-center text-[13px] text-[#888]">Loading…</div>}
            {!loading && tickets.length === 0 && (
              <div className="p-8 text-center text-[13px] text-[#8a94a6]">
                <MessageSquare className="mx-auto mb-2 h-7 w-7 text-[#c9d1dc]" />
                No tickets yet.
              </div>
            )}
            {tickets.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveId(t.id)}
                className={`w-full text-left px-4 py-3 border-b border-[#f2f4f7] transition ${
                  t.id === activeId ? "bg-[#f4f8ff] border-l-2 border-l-[#2f6fed]" : "hover:bg-[#fafcff]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-[#1f2d3d] truncate">{t.subject}</span>
                  <StatusPill status={t.status} />
                </div>
                <div className="mt-1 text-[11px] text-[#98a2b3]">
                  {new Date(t.last_activity_at).toLocaleString()}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="rounded-2xl border border-[#e6e6e6] bg-white overflow-hidden shadow-[0_4px_16px_rgba(20,30,60,0.05)] flex flex-col min-h-[420px]">
          {!active && (
            <div className="flex-1 grid place-items-center text-[13px] text-[#8a94a6] p-10 text-center">
              Select a ticket or open a new one — our team replies in the same thread.
            </div>
          )}
          {active && (
            <>
              <div className="px-5 py-3 border-b border-[#eee] bg-gradient-to-r from-[#f7f9fc] to-[#eef2fa] flex items-center gap-3">
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold text-[#1f2d3d] truncate">{active.subject}</div>
                  <div className="text-[11px] text-[#98a2b3]">
                    Opened {new Date(active.created_at).toLocaleString()} · {active.priority} priority
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <StatusPill status={active.status} />
                  {active.status !== "closed" && (
                    <button onClick={() => void closeTicket()} className="h-8 px-3 rounded-lg border border-[#dcdcdc] text-[12px] text-[#555] hover:bg-white">
                      Close
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-[#fbfcfe]">
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.is_staff ? "justify-start" : "justify-end"}`}>
                    <div
                      className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed shadow-sm ${
                        m.is_staff
                          ? "bg-white border border-[#e6e6e6] text-[#243244]"
                          : "bg-gradient-to-br from-[#1f2d3d] to-[#38546f] text-white"
                      }`}
                    >
                      <div className={`mb-1 text-[10px] uppercase tracking-wider ${m.is_staff ? "text-[#2f6fed]" : "text-white/60"}`}>
                        {m.is_staff ? "Support team" : "You"}
                      </div>
                      <p className="whitespace-pre-line break-words">{m.body}</p>
                      <div className={`mt-1 text-[10px] ${m.is_staff ? "text-[#a8b0bd]" : "text-white/50"}`}>
                        {new Date(m.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
                {messages.length === 0 && <div className="text-center text-[12px] text-[#98a2b3]">No messages yet.</div>}
              </div>

              {active.status !== "closed" && (
                <div className="border-t border-[#eee] p-3 flex items-end gap-2 bg-white">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={2}
                    placeholder="Write a message…"
                    className="flex-1 resize-none rounded-lg border border-[#e0e4ea] p-2.5 text-[13px] outline-none focus:border-[#2f6fed] focus:ring-2 focus:ring-[#2f6fed]/15"
                  />
                  <button
                    onClick={() => void sendReply()}
                    disabled={busy || !reply.trim()}
                    className="h-10 px-4 rounded-lg bg-gradient-to-r from-[#2e7d32] to-[#43a047] text-white text-[13px] shadow-[0_6px_18px_rgba(46,125,50,0.3)] hover:brightness-110 disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
};

export default Support;
