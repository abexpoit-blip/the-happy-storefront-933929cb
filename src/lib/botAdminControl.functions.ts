import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("forbidden");
}

export interface BotStats {
  totalUsers: number;
  pendingDeposits: number;
  checksToday: number;
  totalChecks: number;
  totalDeposited: number;
}

export interface BotSettings {
  bot_maintenance: boolean;
  bot_maintenance_msg: string;
  bot_notice: string;
  checker_enabled: boolean;
  min_deposit: number;
  check_credit_cost: number;
  credits_per_usd: number;
}

export interface BroadcastRow {
  id: string;
  text: string;
  sent_count: number;
  failed_count: number;
  target: string;
  created_at: string;
}

export const getBotStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BotStats> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [users, pendingDeps, checksToday, allChecks, deposited] = await Promise.all([
      db.from("telegram_accounts").select("*", { count: "exact", head: true }),
      db.from("deposits").select("*", { count: "exact", head: true }).eq("status", "pending"),
      db.from("self_checks").select("*", { count: "exact", head: true }).eq("source", "bot").gte("created_at", today.toISOString()),
      db.from("self_checks").select("*", { count: "exact", head: true }).eq("source", "bot"),
      db.from("deposits").select("amount").eq("status", "approved"),
    ]);

    const totalDeposited = ((deposited.data ?? []) as { amount: number }[]).reduce(
      (sum: number, d: { amount: number }) => sum + Number(d.amount ?? 0), 0
    );

    return {
      totalUsers: users.count ?? 0,
      pendingDeposits: pendingDeps.count ?? 0,
      checksToday: checksToday.count ?? 0,
      totalChecks: allChecks.count ?? 0,
      totalDeposited,
    };
  });

export const getBotSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BotSettings> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const keys = [
      "bot_maintenance", "bot_maintenance_msg", "bot_notice",
      "checker_enabled", "min_deposit", "check_credit_cost", "credits_per_usd",
    ];
    const { data: rows } = await db.from("site_settings").select("key, value").in("key", keys);
    const map: Record<string, string> = {};
    for (const r of rows ?? []) map[(r as { key: string; value: string }).key] = (r as { key: string; value: string }).value;
    return {
      bot_maintenance: map["bot_maintenance"] === "true",
      bot_maintenance_msg: map["bot_maintenance_msg"] ?? "🔧 Under maintenance.",
      bot_notice: map["bot_notice"] ?? "",
      checker_enabled: map["checker_enabled"] !== "false",
      min_deposit: Number(map["min_deposit"] ?? 5),
      check_credit_cost: Number(map["check_credit_cost"] ?? 30),
      credits_per_usd: Number(map["credits_per_usd"] ?? 1000),
    };
  });

export const saveBotSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      bot_maintenance: z.boolean().optional(),
      bot_maintenance_msg: z.string().max(500).optional(),
      bot_notice: z.string().max(500).optional(),
      checker_enabled: z.boolean().optional(),
      min_deposit: z.number().min(0).optional(),
      check_credit_cost: z.number().min(0).optional(),
      credits_per_usd: z.number().min(1).optional(),
    }).parse(input ?? {})
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const pairs: [string, string][] = [];
    if (data.bot_maintenance !== undefined) pairs.push(["bot_maintenance", String(data.bot_maintenance)]);
    if (data.bot_maintenance_msg !== undefined) pairs.push(["bot_maintenance_msg", data.bot_maintenance_msg]);
    if (data.bot_notice !== undefined) pairs.push(["bot_notice", data.bot_notice]);
    if (data.checker_enabled !== undefined) pairs.push(["checker_enabled", String(data.checker_enabled)]);
    if (data.min_deposit !== undefined) pairs.push(["min_deposit", String(data.min_deposit)]);
    if (data.check_credit_cost !== undefined) pairs.push(["check_credit_cost", String(data.check_credit_cost)]);
    if (data.credits_per_usd !== undefined) pairs.push(["credits_per_usd", String(data.credits_per_usd)]);
    await Promise.all(
      pairs.map(([k, v]) =>
        db.from("site_settings").upsert({ key: k, value: v }, { onConflict: "key" })
      )
    );
    return { status: "success" };
  });

export const getBroadcastHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BroadcastRow[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { data, error } = await db
      .from("bot_broadcasts")
      .select("id, text, sent_count, failed_count, target, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return (data ?? []) as BroadcastRow[];
  });

export const sendBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      text: z.string().min(1).max(4000),
    }).parse(input ?? {})
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    // Delegate to the bot bridge endpoint which handles Telegram rate limiting
    const { botSecretTag } = await import("@/lib/botApi.server");
    const secret = botSecretTag();
    // We need to call the bot's broadcast action via the internal API
    // Use the site's own origin (server-side fetch)
    const { siteOrigin } = await import("@/lib/botApi.server");
    // We cannot access `request` here directly — use env var origin
    const origin = (process.env.BOT_API_BASE ?? process.env.API_BASE ?? "https://zoru.cc").replace(/\/+$/, "");
    const resp = await fetch(`${origin}/api/public/bot/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-secret": secret,
        "x-broadcast-key": (process.env.BOT_ADMIN_SECRET ?? "").trim(),
      },
      body: JSON.stringify({
        telegram_id: 0,   // broadcast action doesn't need a real user
        username: null,
        first_name: null,
        text: data.text,
      }),
      signal: AbortSignal.timeout(300_000), // broadcasts can take up to 5 min
    });
    const result = await resp.json().catch(() => ({})) as Record<string, unknown>;
    if (!resp.ok) throw new Error(String(result.message ?? "broadcast_failed"));
    return { sent: Number(result.sent ?? 0), failed: Number(result.failed ?? 0) };
  });
