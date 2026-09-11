/**
 * Server-only helpers for the Telegram bot bridge.
 * Every bot request is authenticated with the shared BOT_ADMIN_SECRET and then
 * mapped onto a real website account, so balance, deposits, referrals, checking
 * and API access all run through exactly the same rules as the web app.
 */
import { createHash, randomBytes, timingSafeEqual } from "crypto";

export interface BotAccount {
  telegramId: number;
  userId: string;
  username: string | null;
  banned: boolean;
  gate: string | null;
}

/** Shared secret guard — the bot must send `x-bot-secret`. */
export function botSecretOk(request: Request): boolean {
  const expected = process.env.BOT_ADMIN_SECRET?.trim();
  if (!expected) return false;
  const got = (request.headers.get("x-bot-secret") ?? "").trim();
  if (!got) return false;
  const expectedBytes = Buffer.from(expected);
  const gotBytes = Buffer.from(got);
  return expectedBytes.length === gotBytes.length && timingSafeEqual(expectedBytes, gotBytes);
}

/** Safe identifier used to prove both processes loaded the same secret. */
export function botSecretTag(): string {
  const secret = process.env.BOT_ADMIN_SECRET?.trim();
  if (!secret) return "missing";
  return createHash("sha256").update(`zoru-bot:${secret}`).digest("hex").slice(0, 12);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function adminDb(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * Find the website account behind a Telegram id, creating one on first contact
 * so a bot user never has to sign up on the site.
 */
export async function getOrCreateBotAccount(input: {
  telegramId: number;
  username?: string | null;
  firstName?: string | null;
  ref?: string | null;
}): Promise<BotAccount> {
  const db = await adminDb();
  const { data: existing, error: lookupError } = await db
    .from("telegram_accounts")
    .select("telegram_id, user_id, username, banned, gate")
    .eq("telegram_id", input.telegramId)
    .maybeSingle();
  if (lookupError) throw new Error(`bot_account_lookup_failed: ${lookupError.message}`);

  if (existing) {
    const { error: updateError } = await db
      .from("telegram_accounts")
      .update({
        last_seen: new Date().toISOString(),
        username: input.username ?? existing.username,
        first_name: input.firstName ?? undefined,
      })
      .eq("telegram_id", input.telegramId);
    if (updateError) throw new Error(`bot_account_update_failed: ${updateError.message}`);
    return {
      telegramId: Number(existing.telegram_id),
      userId: String(existing.user_id),
      username: existing.username ?? null,
      banned: Boolean(existing.banned),
      gate: existing.gate ?? null,
    };
  }

  const handle = (input.username ?? "").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20);
  const email = `tg${input.telegramId}@bot.zoru.cc`;
  const password = `Zb_${randomBytes(18).toString("hex")}`;

  const { data: created, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      username: handle ? `tg_${handle}` : `tg_${input.telegramId}`,
      telegram_id: input.telegramId,
      ref: (input.ref ?? "").toUpperCase() || undefined,
    },
  });

  let userId = created?.user?.id as string | undefined;
  if (!userId) {
    // The auth user may already exist from an earlier partial signup.
    const { data: profile } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
    userId = profile?.id as string | undefined;
    if (!userId) throw new Error(error?.message || "bot_account_create_failed");
  }

  const { error: linkError } = await db.from("telegram_accounts").insert({
    telegram_id: input.telegramId,
    user_id: userId,
    username: input.username ?? null,
    first_name: input.firstName ?? null,
  });

  if (linkError) {
    // A simultaneous /start may have linked this Telegram ID first.
    const { data: raced, error: racedError } = await db
      .from("telegram_accounts")
      .select("telegram_id, user_id, username, banned, gate")
      .eq("telegram_id", input.telegramId)
      .maybeSingle();
    if (racedError || !raced) throw new Error(`bot_account_link_failed: ${linkError.message}`);
    return {
      telegramId: Number(raced.telegram_id),
      userId: String(raced.user_id),
      username: raced.username ?? null,
      banned: Boolean(raced.banned),
      gate: raced.gate ?? null,
    };
  }

  return {
    telegramId: input.telegramId,
    userId,
    username: input.username ?? null,
    banned: false,
    gate: null,
  };
}

/** Everything the bot shows on the profile / main menu. */
export async function botAccountSnapshot(account: BotAccount) {
  const db = await adminDb();
  const [{ data: profile }, { data: refs }, { data: key }, { data: settings }, { count: orderCount }] =
    await Promise.all([
      db
        .from("profiles")
        .select("username, balance, bonus_balance, referral_code, blocked")
        .eq("id", account.userId)
        .maybeSingle(),
      db.from("referrals").select("bonus_amount").eq("referrer_id", account.userId),
      db
        .from("api_keys")
        .select("prefix, active, credits")
        .eq("user_id", account.userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db.from("site_settings").select("key, value").in("key", [
        "api_access_fee",
        "referral_bonus",
        "check_credit_cost",
        "credits_per_usd",
        "self_check_gate",
      ]),
      db.from("orders").select("id", { count: "exact", head: true }).eq("user_id", account.userId),
    ]);

  const map = Object.fromEntries(
    ((settings ?? []) as { key: string; value: string }[]).map((r) => [r.key, r.value]),
  );
  const creditsPerUsd = Number(map["credits_per_usd"] ?? 1000) || 1000;
  const creditCost = Number(map["check_credit_cost"] ?? 30) || 30;

  const referralRows = (refs ?? []) as { bonus_amount: number | string }[];
  return {
    user_id: account.userId,
    username: profile?.username ?? null,
    balance: Number(profile?.balance ?? 0),
    bonus_balance: Number(profile?.bonus_balance ?? 0),
    blocked: Boolean(profile?.blocked) || account.banned,
    referral_code: profile?.referral_code ?? null,
    referral_count: referralRows.length,
    referral_earned: referralRows.reduce((s, r) => s + Number(r.bonus_amount ?? 0), 0),
    referral_bonus: Number(map["referral_bonus"] ?? 0.1) || 0.1,
    orders: Number(orderCount ?? 0),
    price_per_card: Math.round((creditCost / creditsPerUsd) * 10000) / 10000,
    api_fee: Number(map["api_access_fee"] ?? 100) || 100,
    default_gate: String(map["self_check_gate"] || "CCV_Braintree_Auth"),
    gate: account.gate,
    api_key: key ? { prefix: String(key.prefix ?? ""), active: Boolean(key.active) } : null,
  };
}

/** Public site origin used for payment callbacks. */
export function siteOrigin(request: Request): string {
  const configured = process.env.SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  try {
    return new URL(request.url).origin;
  } catch {
    return "https://zoru.cc";
  }
}
