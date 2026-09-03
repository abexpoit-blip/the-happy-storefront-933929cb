import { supabase } from "@/integrations/supabase/client";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as any;

export type TicketStatus = "open" | "answered" | "closed";

export interface SupportTicket {
  id: string;
  user_id: string;
  subject: string;
  status: TicketStatus;
  priority: string;
  last_activity_at: string;
  created_at: string;
  username?: string | null;
}

export interface SupportMessage {
  id: string;
  ticket_id: string;
  user_id: string;
  body: string;
  is_staff: boolean;
  created_at: string;
}

export const listMyTickets = async (): Promise<SupportTicket[]> => {
  const { data, error } = await db
    .from("support_tickets")
    .select("*")
    .order("last_activity_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SupportTicket[];
};

export const listAllTickets = async (status?: TicketStatus | "all"): Promise<SupportTicket[]> => {
  let q = db.from("support_tickets").select("*").order("last_activity_at", { ascending: false });
  if (status && status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as SupportTicket[];

  const ids = [...new Set(rows.map((r) => r.user_id))];
  if (ids.length) {
    const { data: profs } = await db.from("profiles").select("id, username").in("id", ids);
    const map = new Map((profs ?? []).map((p: any) => [p.id, p.username]));
    rows.forEach((r) => {
      r.username = (map.get(r.user_id) as string | undefined) ?? null;
    });
  }
  return rows;
};

export const listMessages = async (ticketId: string): Promise<SupportMessage[]> => {
  const { data, error } = await db
    .from("support_messages")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SupportMessage[];
};

export const createTicket = async (subject: string, body: string, priority = "normal") => {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("not_authenticated");

  const { data, error } = await db
    .from("support_tickets")
    .insert({ user_id: uid, subject, priority })
    .select("id")
    .single();
  if (error) throw error;

  const ticketId = (data as { id: string }).id;
  const { error: msgErr } = await db
    .from("support_messages")
    .insert({ ticket_id: ticketId, user_id: uid, body, is_staff: false });
  if (msgErr) throw msgErr;
  return ticketId;
};

export const replyToTicket = async (ticketId: string, body: string, isStaff = false) => {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("not_authenticated");
  const { error } = await db
    .from("support_messages")
    .insert({ ticket_id: ticketId, user_id: uid, body, is_staff: isStaff });
  if (error) throw error;
};

export const setTicketStatus = async (ticketId: string, status: TicketStatus) => {
  const { error } = await db.from("support_tickets").update({ status }).eq("id", ticketId);
  if (error) throw error;
};
