import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicBase } from "@/lib/baseLabel";
import { detectOfflineBin, enrichBinsBatch } from "@/lib/binDetection";
import { calculateCardPrice } from "@/lib/cardPricing";
import fs from "node:fs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("forbidden");
}

export function getTelegramBotToken(): string {
  const envUpdateToken = (process.env.TELEGRAM_UPDATE_BOT_TOKEN ?? "").trim();
  if (envUpdateToken) return envUpdateToken;
  try {
    if (fs.existsSync("/etc/zoru/telegram.env")) {
      const content = fs.readFileSync("/etc/zoru/telegram.env", "utf8");
      const mUp = content.match(/TELEGRAM_UPDATE_BOT_TOKEN\s*=\s*["']?([^"'\r\n]+)/);
      if (mUp && mUp[1]) return mUp[1].trim();
    }
  } catch {
    /* ignore */
  }
  // Default to official Zoru Shop Update Bot (@Zorushopupdatebot)
  return "8883627548:AAGrYhz6FNQXr5NRetLVbbke6lJ4EJEIk8g";
}

export function getTelegramChannelId(): string {
  const ch = (process.env.TELEGRAM_CHANNEL_ID ?? "").trim();
  return ch || "@zorushop";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getAllBroadcastChannels(db?: any): Promise<string[]> {
  const channelSet = new Set<string>();

  const envChannels = [
    process.env.TELEGRAM_CHANNELS,
    process.env.TELEGRAM_CHANNEL_ID,
  ].filter(Boolean).join(",");

  for (const raw of envChannels.split(/[,\s]+/)) {
    const ch = raw.trim().replace(/^["']|["']$/g, "");
    if (ch) channelSet.add(ch);
  }

  try {
    if (fs.existsSync("/etc/zoru/telegram.env")) {
      const content = fs.readFileSync("/etc/zoru/telegram.env", "utf8");
      const m1 = content.match(/TELEGRAM_CHANNELS\s*=\s*["']?([^"'\r\n]+)/);
      const m2 = content.match(/TELEGRAM_CHANNEL_ID\s*=\s*["']?([^"'\r\n]+)/);
      const fileVals = [m1?.[1], m2?.[1]].filter(Boolean).join(",");
      for (const raw of fileVals.split(/[,\s]+/)) {
        const ch = raw.trim().replace(/^["']|["']$/g, "");
        if (ch) channelSet.add(ch);
      }
    }
  } catch {}

  if (db) {
    try {
      const { data: rows } = await db
        .from("site_settings")
        .select("key, value")
        .in("key", ["telegram_broadcast_channels", "telegram_channels", "telegram_channel_id", "telegram_channel"]);
      for (const r of rows ?? []) {
        if (!r?.value) continue;
        const str = String(r.value).trim();
        if (str.startsWith("[") && str.endsWith("]")) {
          try {
            const arr = JSON.parse(str);
            if (Array.isArray(arr)) {
              for (const item of arr) {
                const s = String(item).trim().replace(/^["']|["']$/g, "");
                if (s) channelSet.add(s);
              }
              continue;
            }
          } catch {}
        }
        for (const part of str.split(/[,\s]+/)) {
          const s = part.trim().replace(/^["']|["']$/g, "");
          if (s) channelSet.add(s);
        }
      }
    } catch {}
  }

  if (channelSet.size === 0) {
    channelSet.add("@zorushop");
  }

  return Array.from(channelSet);
}

export interface DripQueueRow {
  id: string;
  name: string;
  per_day: number;
  price: number;
  pricing_mode?: "fixed" | "dynamic_level";
  min_price?: number;
  max_price?: number;
  refundable: boolean;
  category_id: string | null;
  status: "active" | "paused" | "completed";
  total_cards: number;
  cards_remaining: number;
  auto_announce: boolean;
  telegram_broadcast: boolean;
  last_run_at: string | null;
  created_at: string;
}

export interface DripStagedItem {
  id: string;
  queue_id: string;
  card_line: string;
  bin: string;
  brand: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  zip: string | null;
  month: string | null;
  year: string | null;
  cc: string | null;
  tel: string | null;
  email: string | null;
  status: string;
  released_at?: string | null;
  created_at?: string;
}

export interface InsertedProduct {
  id: string;
  slug: string;
}

/**
 * Broadcast base update / restock alert to Telegram channel (@zorushop)
 */
export const broadcastChannelAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        baseName: z.string().min(1),
        count: z.number().nullable().optional(),
        brand: z.string().nullable().optional(),
        country: z.string().nullable().optional(),
        price: z.number().nullable().optional(),
        customNote: z.string().nullable().optional(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const token = getTelegramBotToken();
    if (!token) {
      return { ok: false, error: "TELEGRAM_BOT_TOKEN not configured on server" };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const channels = await getAllBroadcastChannels(db);

    const pBase = publicBase(data.baseName);
    const brandStr = data.brand || "VISA/MC";
    const countryStr = data.country || "MIX";
    const priceStr = data.price ? `$${Number(data.price).toFixed(2)}` : "$1.50";

    const text = [
      `⚡ <b>ZORU SHOP — NEW BASE UPDATE!</b> ⚡`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `📦 <b>Base:</b> <code>${pBase}</code>`,
      `🏷 <b>Brand:</b> ${brandStr}`,
      `🌍 <b>Country:</b> ${countryStr}`,
      data.count ? `💳 <b>Cards Added:</b> ${data.count} Verified Cards` : ``,
      `💰 <b>Price:</b> ${priceStr}`,
      `⚡ <b>Delivery:</b> Instant Automated Delivery`,
      data.customNote ? `📝 <b>Note:</b> ${data.customNote}\n` : ``,
      `🛒 <b>Shop Now:</b> <a href="https://zoru.cc/shop">zoru.cc/shop</a>`,
      `🤖 <b>Checker Bot:</b> <a href="https://t.me/ZoruCheckerbot">@ZoruCheckerbot</a>`,
      `📢 <b>Official Channel:</b> ${channels[0] || "@zorushop"}`,
      `💬 <b>Support:</b> @Zorushop_service`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
    ]
      .filter(Boolean)
      .join("\n");

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: "🛒 Buy Cards Now", url: "https://zoru.cc/shop" },
          { text: "🤖 Telegram Checker Bot", url: "https://t.me/ZoruCheckerbot" },
        ],
        [
          { text: "💬 Support", url: "https://t.me/Zorushop_service" },
          { text: "📢 Official Channel", url: "https://t.me/zorushop" },
        ],
      ],
    };

    let delivered = 0;
    const errors: string[] = [];

    // 1. Broadcast to ALL channels
    for (const ch of channels) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: ch,
            text,
            parse_mode: "HTML",
            disable_web_page_preview: true,
            reply_markup: replyMarkup,
          }),
          signal: AbortSignal.timeout(10000),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.ok) {
          delivered++;
        } else {
          errors.push(`${ch}: ${json.description || res.statusText}`);
        }
      } catch (e: unknown) {
        errors.push(`${ch}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // 2. Also push to update bot subscribers & active bot users
    try {
      const subscriberIds = new Set<string | number>();
      const { data: subs } = await db
        .from("update_bot_subscribers")
        .select("telegram_id")
        .eq("subscribed", true)
        .limit(2000);
      for (const s of subs ?? []) {
        if (s.telegram_id) subscriberIds.add(s.telegram_id);
      }

      const { data: tgUsers } = await db
        .from("telegram_accounts")
        .select("telegram_id")
        .eq("banned", false)
        .limit(3000);
      for (const u of tgUsers ?? []) {
        if (u.telegram_id) subscriberIds.add(u.telegram_id);
      }

      for (const tid of subscriberIds) {
        fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: tid,
            text,
            parse_mode: "HTML",
            disable_web_page_preview: true,
            reply_markup: replyMarkup,
          }),
          signal: AbortSignal.timeout(6000),
        }).catch(() => {});
        await new Promise((r) => setTimeout(r, 40));
      }
    } catch {}

    if (delivered > 0) {
      return { ok: true, delivered, channelsCount: channels.length };
    }
    return { ok: false, error: errors.join(", ") || "Failed to broadcast to Telegram" };
  });

/**
 * Broadcast alerts for all active bases currently in the shop
 */
export const broadcastAllExistingBasesAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        limit: z.number().optional().default(50),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;

    // Fetch active products with stock > 0 that have a base
    const { data: prods, error: pErr } = await db
      .from("products")
      .select("base, brand, country, price, stock, active")
      .eq("active", true)
      .gt("stock", 0)
      .not("base", "is", null)
      .limit(10000);

    if (pErr) return { ok: false, error: pErr.message };
    if (!prods || (prods as any[]).length === 0) {
      return { ok: false, error: "No active products with bases found in shop." };
    }

    // Group by base
    const baseMap = new Map<string, { count: number; brands: Set<string>; countries: Set<string>; totalPrice: number }>();
    for (const p of prods as any[]) {
      if (!p.base) continue;
      const b = p.base;
      const cur = baseMap.get(b) || { count: 0, brands: new Set<string>(), countries: new Set<string>(), totalPrice: 0 };
      cur.count += (p.stock || 1);
      if (p.brand) cur.brands.add(p.brand);
      if (p.country) cur.countries.add(p.country);
      cur.totalPrice += Number(p.price || 1.5);
      baseMap.set(b, cur);
    }

    const baseList: Array<{
      baseName: string;
      count: number;
      brand: string;
      country: string;
      price: number;
    }> = [];

    for (const [baseName, info] of baseMap.entries()) {
      baseList.push({
        baseName,
        count: info.count,
        brand: Array.from(info.brands).slice(0, 2).join("/") || "VISA/MC",
        country: Array.from(info.countries).slice(0, 3).join(", ") || "MIX",
        price: Number((info.totalPrice / Math.max(1, info.count)).toFixed(2)),
      });
    }

    // Sort descending by base name (most recent first)
    baseList.sort((a, b) => b.baseName.localeCompare(a.baseName));
    const toBroadcast = baseList.slice(0, data.limit || 50);

    const token = getTelegramBotToken();
    if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN not configured on server" };
    const channels = await getAllBroadcastChannels(db);

    // Fetch subscribers once
    const subscriberIds = new Set<string | number>();
    try {
      const { data: subs } = await db
        .from("update_bot_subscribers")
        .select("telegram_id")
        .eq("subscribed", true)
        .limit(2000);
      for (const s of subs ?? []) {
        if (s.telegram_id) subscriberIds.add(s.telegram_id);
      }

      const { data: tgUsers } = await db
        .from("telegram_accounts")
        .select("telegram_id")
        .eq("banned", false)
        .limit(3000);
      for (const u of tgUsers ?? []) {
        if (u.telegram_id) subscriberIds.add(u.telegram_id);
      }
    } catch {}

    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < toBroadcast.length; i++) {
      const b = toBroadcast[i];
      const pBase = publicBase(b.baseName);
      const text = [
        `⚡ <b>ZORU SHOP — NEW BASE UPDATE!</b> ⚡`,
        `━━━━━━━━━━━━━━━━━━━━━━`,
        `📦 <b>Base:</b> <code>${pBase}</code>`,
        `🏷 <b>Brand:</b> ${b.brand}`,
        `🌍 <b>Country:</b> ${b.country}`,
        `💳 <b>In Stock:</b> ${b.count} Verified Cards`,
        `💰 <b>Price:</b> $${b.price.toFixed(2)}`,
        `⚡ <b>Delivery:</b> Instant Automated Delivery`,
        `🛒 <b>Shop Now:</b> <a href="https://zoru.cc/shop">zoru.cc/shop</a>`,
        `🤖 <b>Checker Bot:</b> <a href="https://t.me/ZoruCheckerbot">@ZoruCheckerbot</a>`,
        `📢 <b>Official Channel:</b> ${channels[0] || "@zorushop"}`,
        `💬 <b>Support:</b> @Zorushop_service`,
        `━━━━━━━━━━━━━━━━━━━━━━`,
      ].join("\n");

      const replyMarkup = {
        inline_keyboard: [
          [
            { text: "🛒 Buy Cards Now", url: "https://zoru.cc/shop" },
            { text: "🤖 Telegram Checker Bot", url: "https://t.me/ZoruCheckerbot" },
          ],
          [
            { text: "💬 Support", url: "https://t.me/Zorushop_service" },
            { text: "📢 Official Channel", url: "https://t.me/zorushop" },
          ],
        ],
      };

      // Broadcast to all channels
      for (const ch of channels) {
        try {
          const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: ch,
              text,
              parse_mode: "HTML",
              disable_web_page_preview: true,
              reply_markup: replyMarkup,
            }),
            signal: AbortSignal.timeout(10000),
          });
          if (res.ok) sentCount++;
          else failedCount++;
        } catch {
          failedCount++;
        }
      }

      // Push to subscribers
      for (const tid of subscriberIds) {
        fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: tid,
            text,
            parse_mode: "HTML",
            disable_web_page_preview: true,
            reply_markup: replyMarkup,
          }),
        }).catch(() => {});
        await new Promise((r) => setTimeout(r, 40));
      }

      if (i < toBroadcast.length - 1) {
        await new Promise((r) => setTimeout(r, 600));
      }
    }

    return { ok: true, totalBases: baseList.length, broadcasted: sentCount, failed: failedCount, channelsCount: channels.length };
  });

/**
 * Diagnostic test: verifies bot token and sends a test ping to channel (@zorushop)
 */
export const testTelegramAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const token = getTelegramBotToken();
    if (!token) {
      return { ok: false, error: "TELEGRAM_BOT_TOKEN is missing on server in /etc/zoru/telegram.env" };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const channels = await getAllBroadcastChannels(db);

    // 1. Verify Bot identity
    let botUser = "unknown";
    try {
      const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(8000) });
      const meJson = await meRes.json();
      if (!meJson.ok) {
        return { ok: false, error: `Invalid bot token: ${meJson.description || "Unknown error"}` };
      }
      botUser = meJson.result.username;
    } catch (err: unknown) {
      return { ok: false, error: `Failed to connect to Telegram API: ${err instanceof Error ? err.message : String(err)}` };
    }

    // 2. Try sending test message to ALL channels
    const text = [
      `⚡ <b>ZORU SHOP — BOT ALERT DIAGNOSTIC</b> ⚡`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `✅ <b>Status:</b> Alert system is active & functioning!`,
      `🤖 <b>Bot:</b> @${botUser}`,
      `📢 <b>Channels (${channels.length}):</b> ${channels.join(", ")}`,
      `🕒 <b>Time:</b> ${new Date().toUTCString()}`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
    ].join("\n");

    let sent = 0;
    const errors: string[] = [];
    for (const ch of channels) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: ch,
            text,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }),
          signal: AbortSignal.timeout(10000),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.ok) {
          sent++;
        } else {
          errors.push(`${ch}: ${json.description || res.statusText}`);
        }
      } catch (err: unknown) {
        errors.push(`${ch}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const channelId = channels.join(", ");
    const hint = `Make sure the bot @${botUser} has been added to channel(s) as an Administrator with "Post Messages" permission!`;

    if (sent > 0) {
      return { ok: true as const, botUser, channelId, channelsSent: sent, totalChannels: channels.length, hint };
    }
    return { ok: false as const, botUser, channelId, error: errors.join(", ") || "Failed to reach any Telegram channels", hint };
  });

/**
 * List active drip queues
 */
export const listDripQueues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DripQueueRow[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;

    const { data, error } = await db
      .from("card_drip_queues")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []) as DripQueueRow[];
  });

/**
 * Create a new Drip Queue with staged cards
 */
export const createDripQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().min(1).max(100),
        per_day: z.number().int().min(1).max(500000),
        price: z.number().min(0.01).max(1000),
        pricing_mode: z.enum(["fixed", "dynamic_level"]).optional(),
        min_price: z.number().min(0.01).optional(),
        max_price: z.number().min(0.01).optional(),
        refundable: z.boolean(),
        category_id: z.string().nullable().optional(),
        auto_announce: z.boolean(),
        telegram_broadcast: z.boolean(),
        items: z.array(
          z.object({
            card_line: z.string(),
            cc: z.string(),
            brand: z.string(),
            bin: z.string(),
            country: z.string().nullable().optional(),
            state: z.string().nullable().optional(),
            city: z.string().nullable().optional(),
            zip: z.string().nullable().optional(),
            month: z.string().nullable().optional(),
            year: z.string().nullable().optional(),
            cvv: z.string().nullable().optional(),
            name: z.string().nullable().optional(),
            addr: z.string().nullable().optional(),
            tel: z.string().nullable().optional(),
            email: z.string().nullable().optional(),
          })
        ),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;

    // 1. Deduplicate within the input batch by PAN
    const seenBatch = new Set<string>();
    const dedupedItems: typeof data.items = [];
    for (const item of data.items) {
      const pan = (item.cc || "").replace(/\D/g, "");
      if (pan.length >= 12) {
        if (seenBatch.has(pan)) continue;
        seenBatch.add(pan);
      }
      dedupedItems.push(item);
    }
    if (dedupedItems.length === 0) throw new Error("No valid unique cards provided");

    // 2. Check existing cards in database (product_keys & card_drip_items)
    const existingPans = new Set<string>();
    const pansToCheck = dedupedItems
      .map((it) => (it.cc || "").replace(/\D/g, ""))
      .filter((p) => p.length >= 12);

    const CHUNK_CHECK = 80;
    for (let i = 0; i < pansToCheck.length; i += CHUNK_CHECK) {
      const slice = pansToCheck.slice(i, i + CHUNK_CHECK);
      try {
        const { data: keyRows } = await db
          .from("product_keys")
          .select("pan")
          .in("pan", slice);
        for (const r of keyRows ?? []) {
          if (r?.pan) existingPans.add(r.pan);
        }
      } catch {}
      try {
        const { data: dripRows } = await db
          .from("card_drip_items")
          .select("cc")
          .in("cc", slice);
        for (const r of dripRows ?? []) {
          if (r?.cc) existingPans.add(r.cc.replace(/\D/g, ""));
        }
      } catch {}
    }

    const cleanItems = dedupedItems.filter((item) => {
      const pan = (item.cc || "").replace(/\D/g, "");
      return !existingPans.has(pan);
    });

    if (cleanItems.length === 0) throw new Error("All cards provided already exist in shop or queues (duplicates)");
    const total = cleanItems.length;

    // 3. Create queue row
    const { data: queueRow, error: qErr } = await db
      .from("card_drip_queues")
      .insert({
        name: data.name,
        per_day: data.per_day,
        price: data.price,
        pricing_mode: data.pricing_mode || "fixed",
        min_price: data.min_price || 0.20,
        max_price: data.max_price || 10.00,
        refundable: data.refundable,
        category_id: data.category_id || null,
        status: "active",
        total_cards: total,
        cards_remaining: total,
        auto_announce: data.auto_announce,
        telegram_broadcast: data.telegram_broadcast,
      })
      .select("id")
      .single();

    if (qErr) throw new Error(qErr.message);
    const queueId = queueRow.id;

    // 4. Insert items in chunks of 200
    const CHUNK = 200;
    for (let i = 0; i < cleanItems.length; i += CHUNK) {
      const slice = cleanItems.slice(i, i + CHUNK).map((item) => ({
        queue_id: queueId,
        card_line: item.card_line,
        cc: item.cc,
        brand: item.brand,
        bin: item.bin,
        country: item.country || null,
        state: item.state || null,
        city: item.city || null,
        zip: item.zip || null,
        month: item.month || null,
        year: item.year || null,
        cvv: item.cvv || null,
        name: item.name || null,
        addr: item.addr || null,
        tel: item.tel || null,
        email: item.email || null,
        status: "pending",
      }));

      const { error: insErr } = await db.from("card_drip_items").insert(slice);
      if (insErr) throw new Error(insErr.message);
    }

    return { queue_id: queueId, total_cards: total };
  });

/**
 * Append additional staged items to an existing Drip Queue (in safe chunks)
 */
export const appendDripItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        queue_id: z.string().uuid(),
        items: z.array(
          z.object({
            card_line: z.string(),
            cc: z.string(),
            brand: z.string(),
            bin: z.string(),
            country: z.string().nullable().optional(),
            state: z.string().nullable().optional(),
            city: z.string().nullable().optional(),
            zip: z.string().nullable().optional(),
            month: z.string().nullable().optional(),
            year: z.string().nullable().optional(),
            cvv: z.string().nullable().optional(),
            name: z.string().nullable().optional(),
            addr: z.string().nullable().optional(),
            tel: z.string().nullable().optional(),
            email: z.string().nullable().optional(),
          })
        ),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;

    // 1. Deduplicate within the input batch by PAN
    const seenBatch = new Set<string>();
    const dedupedItems: typeof data.items = [];
    for (const item of data.items) {
      const pan = (item.cc || "").replace(/\D/g, "");
      if (pan.length >= 12) {
        if (seenBatch.has(pan)) continue;
        seenBatch.add(pan);
      }
      dedupedItems.push(item);
    }
    if (dedupedItems.length === 0) return { added: 0 };

    // 2. Check existing cards in database (product_keys & card_drip_items)
    const existingPans = new Set<string>();
    const pansToCheck = dedupedItems
      .map((it) => (it.cc || "").replace(/\D/g, ""))
      .filter((p) => p.length >= 12);

    const CHUNK_CHECK = 80;
    for (let i = 0; i < pansToCheck.length; i += CHUNK_CHECK) {
      const slice = pansToCheck.slice(i, i + CHUNK_CHECK);
      try {
        const { data: keyRows } = await db
          .from("product_keys")
          .select("pan")
          .in("pan", slice);
        for (const r of keyRows ?? []) {
          if (r?.pan) existingPans.add(r.pan);
        }
      } catch {}
      try {
        const { data: dripRows } = await db
          .from("card_drip_items")
          .select("cc")
          .in("cc", slice);
        for (const r of dripRows ?? []) {
          if (r?.cc) existingPans.add(r.cc.replace(/\D/g, ""));
        }
      } catch {}
    }

    const cleanItems = dedupedItems.filter((item) => {
      const pan = (item.cc || "").replace(/\D/g, "");
      return !existingPans.has(pan);
    });

    if (cleanItems.length === 0) return { added: 0 };

    const CHUNK = 200;
    for (let i = 0; i < cleanItems.length; i += CHUNK) {
      const slice = cleanItems.slice(i, i + CHUNK).map((item) => ({
        queue_id: data.queue_id,
        card_line: item.card_line,
        cc: item.cc,
        brand: item.brand,
        bin: item.bin,
        country: item.country || null,
        state: item.state || null,
        city: item.city || null,
        zip: item.zip || null,
        month: item.month || null,
        year: item.year || null,
        cvv: item.cvv || null,
        name: item.name || null,
        addr: item.addr || null,
        tel: item.tel || null,
        email: item.email || null,
        status: "pending",
      }));

      const { error: insErr } = await db.from("card_drip_items").insert(slice);
      if (insErr) throw new Error(insErr.message);
    }

    const countAdded = cleanItems.length;
    const { data: q } = await db
      .from("card_drip_queues")
      .select("total_cards, cards_remaining")
      .eq("id", data.queue_id)
      .single();
    if (q) {
      await db
        .from("card_drip_queues")
        .update({
          total_cards: (q.total_cards || 0) + countAdded,
          cards_remaining: (q.cards_remaining || 0) + countAdded,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.queue_id);
    }

    return { added: countAdded };
  });

/**
 * Update queue status (pause, resume, delete)
 */
export const updateDripQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        queue_id: z.string().uuid(),
        action: z.enum(["pause", "resume", "delete"]),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;

    if (data.action === "delete") {
      const { error } = await db.from("card_drip_queues").delete().eq("id", data.queue_id);
      if (error) throw new Error(error.message);
      return { status: "deleted" };
    }

    const newStatus = data.action === "pause" ? "paused" : "active";
    const { error } = await db
      .from("card_drip_queues")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", data.queue_id);

    if (error) throw new Error(error.message);
    return { status: newStatus };
  });

/**
 * Release next batch of cards immediately from a queue
 */
export const triggerDripRelease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        queue_id: z.string().uuid(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;

    // 1. Fetch queue
    const { data: queue, error: qErr } = await db
      .from("card_drip_queues")
      .select("*")
      .eq("id", data.queue_id)
      .single();

    if (qErr || !queue) throw new Error(qErr?.message || "Queue not found");
    if (queue.cards_remaining <= 0) throw new Error("No cards remaining in queue");

    // 2. Fetch up to per_day pending items
    const countToRelease = Math.min(queue.per_day, queue.cards_remaining);
    const { data: items, error: iErr } = await db
      .from("card_drip_items")
      .select("*")
      .eq("queue_id", data.queue_id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(countToRelease);

    const stagedItems = (items ?? []) as unknown as DripStagedItem[];
    if (iErr || stagedItems.length === 0) {
      throw new Error(iErr?.message || "No pending items found in queue");
    }

    // 3. Prepare product insertion with today's date base
    const today = new Date();
    const yyyy = today.getUTCFullYear();
    const mm = String(today.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(today.getUTCDate()).padStart(2, "0");
    const dateStr = `${yyyy}_${mm}_${dd}`;
    const primaryBrand = stagedItems[0]?.brand || "CARD";
    const clean = (s: string | null | undefined) => (!s || s.toLowerCase() === "null" ? "" : s);
    const stamp = Date.now().toString(36);

    // Pre-enrich distinct BINs with live global BIN API
    const distinctBins = Array.from(
      new Set(
        stagedItems.map((c) => String(c.bin || (c.cc || "").slice(0, 6)).replace(/\D/g, "").slice(0, 6)).filter((b) => b.length === 6)
      )
    );
    const enrichedBinMap = await enrichBinsBatch(distinctBins);

    const products = stagedItems.map((c, i: number) => {
      const bKey = String(c.bin || (c.cc || "").slice(0, 6)).replace(/\D/g, "").slice(0, 6);
      const binInfo = enrichedBinMap.get(bKey) || detectOfflineBin(c.cc || c.bin);
      const isRef =
        queue.refundable === true
          ? true
          : binInfo.refundable;
      const cardCountry = clean(c.country) || binInfo.country || null;
      const brand = (c.brand && c.brand !== "OTHER" && c.brand !== "UNKNOWN") ? c.brand : (binInfo.brand || "VISA");
      const cardBase = `ADMIN_${dateStr}_${brand}`;
      const cardPrice = calculateCardPrice(
        {
          cc: c.cc || undefined,
          brand: brand,
          card_level: binInfo.level,
          card_type: binInfo.type,
          refundable: isRef,
          exp_month: c.month,
          exp_year: c.year,
        },
        {
          mode: (queue.pricing_mode as "fixed" | "dynamic_level") || "fixed",
          fixedPrice: Number(queue.price || 1.50),
          minPrice: Number(queue.min_price || 0.20),
          maxPrice: Number(queue.max_price || 10.00),
          randomVariation: true,
        }
      );

      return {
        category_id: queue.category_id || null,
        title: `${brand} ${c.bin} · ${clean(c.city) || clean(c.state) || cardCountry || "—"}`,
        slug: `${c.bin}-${stamp}-${i}-${Math.random().toString(36).slice(2, 8)}`,
        price: cardPrice,
        delivery_type: "key",
        active: true,
        stock: 1,
        bin: c.bin,
        brand: brand,
        country: cardCountry,
        state: clean(c.state) || null,
        city: clean(c.city) || null,
        zip: clean(c.zip) || null,
        exp_month: clean(c.month) || null,
        exp_year: clean(c.year) || null,
        base: cardBase,
        refundable: isRef,
        card_type: binInfo.type,
        card_level: binInfo.level,
        bank: binInfo.bank,
        last_digits: (c.cc || "").replace(/\D/g, "").slice(-3) || null,
        has_phone: !!clean(c.tel),
        has_email: !!clean(c.email),
        created_at: today.toISOString(),
      };
    });

    // 4. Safe batch chunk insertion into products & product_keys (100 rows per chunk)
    const CHUNK_SIZE = 100;
    const insertedRows: InsertedProduct[] = [];

    for (let i = 0; i < products.length; i += CHUNK_SIZE) {
      const pSlice = products.slice(i, i + CHUNK_SIZE);
      const { data: insertedSlice, error: pErr } = await db
        .from("products")
        .insert(pSlice)
        .select("id, slug");

      if (pErr) throw new Error(pErr.message);
      const sliceRows = (insertedSlice ?? []) as unknown as InsertedProduct[];
      insertedRows.push(...sliceRows);

      const keyRows = sliceRows.map((prod, idx: number) => ({
        product_id: prod.id,
        content: stagedItems[i + idx].card_line,
        pan: (stagedItems[i + idx].cc || "").replace(/\D/g, "") || null,
      }));

      const { error: kErr } = await db.from("product_keys").insert(keyRows);
      if (kErr) throw new Error(kErr.message);

      const rIds = stagedItems.slice(i, i + CHUNK_SIZE).map((it) => it.id);
      const { error: rErr } = await db
        .from("card_drip_items")
        .update({
          status: "released",
          released_at: today.toISOString(),
        })
        .in("id", rIds);
      if (rErr) throw new Error(rErr.message);
    }

    // 7. Update queue remaining count and last_run_at
    const remainingAfter = Math.max(0, queue.cards_remaining - stagedItems.length);
    await db
      .from("card_drip_queues")
      .update({
        cards_remaining: remainingAfter,
        last_run_at: today.toISOString(),
        status: remainingAfter === 0 ? "completed" : queue.status,
        updated_at: today.toISOString(),
      })
      .eq("id", data.queue_id);

    // 8. Auto-Announce if enabled (announce all distinct bases)
    const distinctBases = [...new Set(products.map((p) => p.base))];
    if (queue.auto_announce) {
      for (const bName of distinctBases) {
        try {
          const pub = publicBase(bName);
          await db.from("announcements").insert({
            title: `Base Update: ${pub}`,
            body: `Fresh batch of verified cards added for base ${pub}. Available in shop now.`,
            kind: "update",
            created_at: today.toISOString(),
          });
        } catch {}
      }
    }

    // 9. Telegram Channel Broadcast if enabled
    let tgStatus = "skipped";
    if (queue.telegram_broadcast) {
      const token = getTelegramBotToken();
      if (token) {
        const channels = await getAllBroadcastChannels(db);
        const cleanBases = distinctBases.map(publicBase).join(" / ");
        const brandsList = [...new Set(products.map((p) => p.brand))].join(", ");
        const countries = [...new Set(stagedItems.map((it) => it.country).filter(Boolean))].join(", ") || "MIX";
        const text = [
          `⚡ <b>ZORU SHOP — NEW BASE UPDATE!</b> ⚡`,
          `━━━━━━━━━━━━━━━━━━━━━━`,
          `📦 <b>Base:</b> <code>${cleanBases}</code>`,
          `🏷 <b>Brand:</b> ${brandsList}`,
          `🌍 <b>Country:</b> ${countries}`,
          `💳 <b>Cards Added:</b> ${items.length} Verified Cards`,
          `⚡ <b>Delivery:</b> Instant Automated Delivery`,
          ``,
          `🛒 <b>Shop Now:</b> <a href="https://zoru.cc/shop">zoru.cc/shop</a>`,
          `🤖 <b>Checker Bot:</b> <a href="https://t.me/ZoruCheckerbot">@ZoruCheckerbot</a>`,
          `📢 <b>Official Channel:</b> ${channels[0] || "@zorushop"}`,
          `💬 <b>Support:</b> @Zorushop_service`,
          `━━━━━━━━━━━━━━━━━━━━━━`,
        ].join("\n");

        const replyMarkup = {
          inline_keyboard: [
            [
              { text: "🛒 Buy Cards Now", url: "https://zoru.cc/shop" },
              { text: "🤖 Telegram Checker Bot", url: "https://t.me/ZoruCheckerbot" },
            ],
            [
              { text: "💬 Support", url: "https://t.me/Zorushop_service" },
              { text: "📢 Official Channel", url: "https://t.me/zorushop" },
            ],
          ],
        };

        // Broadcast to all channels
        for (const ch of channels) {
          try {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: ch,
                text,
                parse_mode: "HTML",
                disable_web_page_preview: true,
                reply_markup: replyMarkup,
              }),
            });
            tgStatus = "sent";
          } catch {
            if (tgStatus !== "sent") tgStatus = "failed";
          }
        }

        // Push to subscribers
        try {
          const subscriberIds = new Set<string | number>();
          const { data: subs } = await db
            .from("update_bot_subscribers")
            .select("telegram_id")
            .eq("subscribed", true)
            .limit(2000);
          for (const s of subs ?? []) {
            if (s.telegram_id) subscriberIds.add(s.telegram_id);
          }

          const { data: tgUsers } = await db
            .from("telegram_accounts")
            .select("telegram_id")
            .eq("banned", false)
            .limit(3000);
          for (const u of tgUsers ?? []) {
            if (u.telegram_id) subscriberIds.add(u.telegram_id);
          }

          for (const tid of subscriberIds) {
            fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: tid,
                text,
                parse_mode: "HTML",
                disable_web_page_preview: true,
                reply_markup: replyMarkup,
              }),
            }).catch(() => {});
            await new Promise((r) => setTimeout(r, 40));
          }
        } catch {}
      }
    }

    return {
      released: items.length,
      remaining: remainingAfter,
      base: distinctBases.map(publicBase).join(" / "),
      telegram: tgStatus,
    };
  });
