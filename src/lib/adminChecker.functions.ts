import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AdminCheckRow {
  card: string;
  status: string;
  category: string;
  msg: string;
  pending?: boolean;
}

export interface AdminCheckRun {
  taskId: string;
  createdAt: string;
  gate: string;
  status: string;
  total: number;
  live: number;
  dead: number;
  other: number;
  cost: number;
  refundedCredits: number;
  source: string;
  who: string;
  rows: AdminCheckRow[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("forbidden");
}

const dayBounds = (day?: string) => {
  const base = day ? new Date(`${day}T00:00:00.000Z`) : new Date();
  const from = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
};

/** All checker runs of one UTC day (web users + API keys). */
export const adminCheckerLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ day: z.string().optional(), search: z.string().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<AdminCheckRun[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { from, to } = dayBounds(data.day);

    const { data: rowsRaw } = await db
      .from("self_checks")
      .select("task_id, user_id, gate, total, cost, status, results, submitted_cards, created_at, source, api_key_id, refunded_credits")
      .gte("created_at", from)
      .lt("created_at", to)
      .order("created_at", { ascending: false })
      .limit(1000);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tasks = (rowsRaw ?? []) as any[];
    const userIds = [...new Set(tasks.map((t) => t.user_id).filter(Boolean))];
    const keyIds = [...new Set(tasks.map((t) => t.api_key_id).filter(Boolean))];

    const names = new Map<string, string>();
    if (userIds.length) {
      const { data: profiles } = await db.from("profiles").select("id, username, email").in("id", userIds);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const p of (profiles ?? []) as any[]) names.set(p.id, p.username || p.email || p.id);
    }
    const keys = new Map<string, string>();
    if (keyIds.length) {
      const { data: rows } = await db.from("api_keys").select("id, label").in("id", keyIds);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const k of (rows ?? []) as any[]) keys.set(k.id, k.label);
    }

    const list: AdminCheckRun[] = tasks.map((t) => {
      const results: AdminCheckRow[] = Array.isArray(t.results) ? t.results : [];
      const submitted: AdminCheckRow[] = Array.isArray(t.submitted_cards) ? t.submitted_cards : [];
      const merged = submitted.length
        ? submitted.map((p) => results.find((r) => r.card === p.card) ?? p)
        : results;
      const live = merged.filter((r) => r.status === "live").length;
      const dead = merged.filter((r) => r.status === "dead").length;
      return {
        taskId: String(t.task_id),
        createdAt: String(t.created_at),
        gate: String(t.gate ?? ""),
        status: String(t.status ?? ""),
        total: Number(t.total ?? 0),
        live,
        dead,
        other: Math.max(0, merged.length - live - dead),
        cost: Number(t.cost ?? 0),
        refundedCredits: Number(t.refunded_credits ?? 0),
        source: String(t.source ?? "web"),
        who: t.api_key_id
          ? `API · ${keys.get(t.api_key_id) ?? "key"}`
          : names.get(t.user_id) ?? "—",
        rows: merged,
      };
    });

    const q = (data.search ?? "").trim().toLowerCase();
    return q ? list.filter((r) => r.who.toLowerCase().includes(q) || r.taskId.includes(q)) : list;
  });

/** Delete one run, or every run of a whole UTC day. */
export const adminDeleteCheckerLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ taskId: z.string().optional(), day: z.string().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: n, error } = await context.supabase.rpc("admin_delete_checks", {
      _task_id: data.taskId ?? null,
      _day: data.day ?? null,
    });
    if (error) throw new Error(error.message);
    return { deleted: Number(n ?? 0) };
  });
