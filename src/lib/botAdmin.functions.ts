import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface BotUserRow {
  telegramId: string;
  userId: string;
  username: string | null;
  firstName: string | null;
  banned: boolean;
  balance: number;
  bonus: number;
  checks: number;
  deposited: number;
  createdAt: string;
  lastSeen: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("forbidden");
}

/** Every Telegram account auto-created by the bot, with its website balance. */
export const listBotUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ search: z.string().max(60).optional() }).parse(input ?? {}))
  .handler(async ({ data, context }): Promise<BotUserRow[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;

    let query = db
      .from("telegram_accounts")
      .select("telegram_id, user_id, username, first_name, banned, created_at, last_seen")
      .order("last_seen", { ascending: false })
      .limit(300);
    const search = data.search?.trim();
    if (search) query = query.ilike("username", `%${search}%`);

    const { data: accounts, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (accounts ?? []) as {
      telegram_id: number | string;
      user_id: string;
      username: string | null;
      first_name: string | null;
      banned: boolean;
      created_at: string;
      last_seen: string;
    }[];
    if (!rows.length) return [];

    const ids = rows.map((r) => r.user_id);
    const [{ data: profiles }, { data: checks }, { data: deposits }] = await Promise.all([
      db.from("profiles").select("id, balance, bonus_balance, blocked").in("id", ids),
      db.from("self_checks").select("user_id, total").in("user_id", ids),
      db.from("deposits").select("user_id, amount, status").in("user_id", ids).eq("status", "approved"),
    ]);

    const profileMap = new Map(
      ((profiles ?? []) as { id: string; balance: number; bonus_balance: number; blocked: boolean }[]).map(
        (p) => [p.id, p],
      ),
    );
    const checkMap = new Map<string, number>();
    for (const c of (checks ?? []) as { user_id: string; total: number }[]) {
      checkMap.set(c.user_id, (checkMap.get(c.user_id) ?? 0) + Number(c.total ?? 0));
    }
    const depositMap = new Map<string, number>();
    for (const d of (deposits ?? []) as { user_id: string; amount: number }[]) {
      depositMap.set(d.user_id, (depositMap.get(d.user_id) ?? 0) + Number(d.amount ?? 0));
    }

    return rows.map((r) => {
      const p = profileMap.get(r.user_id);
      return {
        telegramId: String(r.telegram_id),
        userId: r.user_id,
        username: r.username,
        firstName: r.first_name,
        banned: Boolean(r.banned) || Boolean(p?.blocked),
        balance: Number(p?.balance ?? 0),
        bonus: Number(p?.bonus_balance ?? 0),
        checks: checkMap.get(r.user_id) ?? 0,
        deposited: depositMap.get(r.user_id) ?? 0,
        createdAt: r.created_at,
        lastSeen: r.last_seen,
      };
    });
  });

/** Add or remove balance for a bot user (same ledger as the website). */
export const adjustBotBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        amount: z.number(),
        description: z.string().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.rpc("admin_adjust_balance", {
      _user_id: data.userId,
      _amount: data.amount,
      _description: data.description ?? "Bot balance adjustment",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Ban or unban a bot account. */
export const setBotUserBanned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ telegramId: z.string().min(1), userId: z.string().uuid(), banned: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    await db.from("telegram_accounts").update({ banned: data.banned }).eq("telegram_id", data.telegramId);
    await db.from("profiles").update({ blocked: data.banned }).eq("id", data.userId);
    return { ok: true };
  });
