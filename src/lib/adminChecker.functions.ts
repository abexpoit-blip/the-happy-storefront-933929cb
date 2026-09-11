import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AdminCheckRow {
  card: string;
  /** Full `PAN|MM|YYYY|CVV` line — admin only, so a lost list can be handed back. */
  full?: string;
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

const SELECT =
  "task_id, user_id, gate, total, cost, status, results, submitted_cards, full_cards, created_at, source, api_key_id, refunded_credits";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildRuns(tasks: any[], names: Map<string, string>, keys: Map<string, string>): AdminCheckRun[] {
  return tasks.map((t) => {
    const results: AdminCheckRow[] = Array.isArray(t.results) ? t.results : [];
    const submitted: AdminCheckRow[] = Array.isArray(t.submitted_cards) ? t.submitted_cards : [];
    const fullList: { m?: string; c?: string }[] = Array.isArray(t.full_cards) ? t.full_cards : [];
    const fullMap = new Map(fullList.map((f) => [String(f.m ?? ""), String(f.c ?? "")]));

    const merged = (submitted.length
      ? submitted.map((p) => results.find((r) => r.card === p.card) ?? p)
      : results
    ).map((r) => ({ ...r, full: fullMap.get(r.card) ?? r.card }));

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
      who: t.api_key_id ? `API · ${keys.get(t.api_key_id) ?? "key"}` : names.get(t.user_id) ?? "—",
      rows: merged,
    };
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function labelMaps(db: any, tasks: any[]) {
  const userIds = [...new Set(tasks.map((t) => t.user_id).filter(Boolean))];
  const keyIds = [...new Set(tasks.map((t) => t.api_key_id).filter(Boolean))];

  const names = new Map<string, string>();
  if (userIds.length) {
    const [{ data: profiles }, { data: tgAccts }] = await Promise.all([
      db.from("profiles").select("id, username, email").in("id", userIds),
      db.from("telegram_accounts").select("user_id, telegram_id, username, first_name").in("user_id", userIds),
    ]);
    const tgMap = new Map<string, string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const tg of (tgAccts ?? []) as any[]) {
      const handle = tg.username ? `@${tg.username}` : (tg.first_name || `TG:${tg.telegram_id}`);
      tgMap.set(tg.user_id, `${handle} (${tg.telegram_id})`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (profiles ?? []) as any[]) {
      const tg = tgMap.get(p.id);
      names.set(p.id, tg ? `Bot · ${tg}` : (p.username || p.email || p.id));
    }
    // Any user in tgMap not in profiles
    for (const [uid, tg] of tgMap.entries()) {
      if (!names.has(uid)) names.set(uid, `Bot · ${tg}`);
    }
  }
  const keys = new Map<string, string>();
  if (keyIds.length) {
    const { data: rows } = await db.from("api_keys").select("id, label").in("id", keyIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const k of (rows ?? []) as any[]) keys.set(k.id, k.label);
  }
  return { names, keys };
}

/** All checker runs of one UTC day (web users + API keys), with full card lines. */
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
      .select(SELECT)
      .gte("created_at", from)
      .lt("created_at", to)
      .order("created_at", { ascending: false })
      .limit(1000);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tasks = (rowsRaw ?? []) as any[];
    const { names, keys } = await labelMaps(db, tasks);
    const list = buildRuns(tasks, names, keys);

    const q = (data.search ?? "").trim().toLowerCase();
    return q ? list.filter((r) => r.who.toLowerCase().includes(q) || r.taskId.includes(q)) : list;
  });

/**
 * One downloadable file with every check of a day (or a range, up to the 30-day
 * retention window). `liveOnly` builds the daily LIVE file admins hand back to users.
 */
export const adminCheckerExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        liveOnly: z.boolean().default(false),
        format: z.enum(["txt", "csv"]).default("txt"),
        search: z.string().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;

    const start = data.from ? dayBounds(data.from).from : dayBounds().from;
    const end = data.to ? dayBounds(data.to).to : dayBounds(data.from).to;

    const { data: rowsRaw } = await db
      .from("self_checks")
      .select(SELECT)
      .gte("created_at", start)
      .lt("created_at", end)
      .order("created_at", { ascending: true })
      .limit(5000);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tasks = (rowsRaw ?? []) as any[];
    const { names, keys } = await labelMaps(db, tasks);
    let runs = buildRuns(tasks, names, keys);
    const q = (data.search ?? "").trim().toLowerCase();
    if (q) runs = runs.filter((r) => r.who.toLowerCase().includes(q) || r.taskId.includes(q));

    const flat = runs.flatMap((r) =>
      r.rows
        .filter((c) => (data.liveOnly ? c.status === "live" : true))
        .map((c) => ({
          time: new Date(r.createdAt).toISOString(),
          user: r.who,
          source: r.source,
          gate: r.gate,
          card: c.full ?? c.card,
          status: c.status,
          category: c.category,
          msg: c.msg,
          taskId: r.taskId,
        })),
    );

    const header = ["time", "user", "source", "gate", "card", "status", "category", "message", "task_id"];
    const clean = (v: unknown) => String(v ?? "").replace(/[\r\n]+/g, " ");
    const content =
      data.format === "csv"
        ? [
            header.join(","),
            ...flat.map((f) =>
              [f.time, f.user, f.source, f.gate, f.card, f.status, f.category, f.msg, f.taskId]
                .map((v) => `"${clean(v).replace(/"/g, '""')}"`)
                .join(","),
            ),
          ].join("\n")
        : data.liveOnly
        ? flat
            .map((f) => `${f.card} | ${f.status.toUpperCase()} | ${clean(f.category || "LIVE")} | ${clean(f.msg || "")}`)
            .join("\n")
        : [
            header.join(" | "),
            ...flat.map((f) =>
              [f.time, f.user, f.source, f.gate, f.card, f.status, f.category, f.msg, f.taskId]
                .map((v) => clean(v))
                .join(" | "),
            ),
          ].join("\n");

    return { rows: flat.length, content };
  });

/** Delete one run, or every run of a whole UTC day. */
export const adminDeleteCheckerLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ taskId: z.string().optional(), day: z.string().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: n, error } = await (context.supabase as any).rpc("admin_delete_checks", {
      _task_id: data.taskId ?? null,
      _day: data.day ?? null,
    });
    if (error) throw new Error(error.message);
    return { deleted: Number(n ?? 0) };
  });

/** Drop everything older than the retention window (default 30 days). */
export const adminPurgeCheckerLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ days: z.number().int().min(1).max(365).default(30) }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: n, error } = await (context.supabase as any).rpc("purge_old_checks", { _days: data.days });
    if (error) throw new Error(error.message);
    return { deleted: Number(n ?? 0) };
  });
