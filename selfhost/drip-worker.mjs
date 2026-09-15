#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

// Load configurations
loadEnv(join(__dirname, "../.env"));
loadEnv("/etc/zoru/backend.env");
loadEnv("/etc/zoru/telegram.env");

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://api.zoru.cc";
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "";

const telegramToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const telegramChannel = (process.env.TELEGRAM_CHANNEL_ID || "@zorushop").trim();

if (!serviceKey) {
  console.error("[Drip Worker] No Supabase service key found. Exiting.");
  process.exit(1);
}

const db = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

async function sendTelegramBroadcast(baseName, count, brand, country, price) {
  if (!telegramToken) {
    console.log("[Drip Worker] TELEGRAM_BOT_TOKEN not set, skipping TG broadcast.");
    return;
  }

  const cleanBase = baseName.replace(/^\s*(admin|seller)[\s_\-.:]+/i, "");
  const text = [
    `⚡ <b>ZORU SHOP — NEW BASE UPDATE!</b> ⚡`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `📦 <b>Base:</b> <code>${cleanBase}</code>`,
    `🏷 <b>Brand:</b> ${brand || "VISA/MC"}`,
    `🌍 <b>Country:</b> ${country || "MIX"}`,
    `💰 <b>Price:</b> $${Number(price || 1.5).toFixed(2)}`,
    `⚡ <b>Delivery:</b> Instant Automated Delivery`,
    ``,
    `🛒 <b>Shop Now:</b> <a href="https://zoru.cc/shop">zoru.cc/shop</a>`,
    `🤖 <b>Checker Bot:</b> <a href="https://t.me/ZoruCheckerbot">@ZoruCheckerbot</a>`,
    `📢 <b>Official Channel:</b> ${telegramChannel}`,
    `💬 <b>Support:</b> @Zorushop_service`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
  ].join("\n");

  try {
    const res = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegramChannel,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🛒 Buy Cards Now", url: "https://zoru.cc/shop" },
              { text: "🤖 Checker Bot", url: "https://t.me/ZoruCheckerbot" },
            ],
            [
              { text: "💬 Support", url: "https://t.me/Zorushop_service" },
              { text: "📢 Official Channel", url: "https://t.me/zorushop" },
            ],
          ],
        },
      }),
    });
    const json = await res.json();
    if (res.ok && json.ok) {
      console.log(`[Drip Worker] Telegram alert sent to ${telegramChannel}`);
    } else {
      console.error(`[Drip Worker] Telegram alert error:`, json.description || res.statusText);
    }
  } catch (err) {
    console.error(`[Drip Worker] Telegram broadcast exception:`, err.message);
  }
}

async function processActiveQueues() {
  const now = new Date();
  console.log(`[Drip Worker] Checking queues at ${now.toISOString()}...`);

  // Queues with status = active and remaining > 0
  const { data: queues, error: qErr } = await db
    .from("card_drip_queues")
    .select("*")
    .eq("status", "active")
    .gt("cards_remaining", 0);

  if (qErr) {
    console.error("[Drip Worker] Error fetching queues:", qErr.message);
    return;
  }

  if (!queues || queues.length === 0) {
    console.log("[Drip Worker] No active queues with remaining cards.");
    return;
  }

  for (const queue of queues) {
    // Check if 20 hours passed since last_run_at
    if (queue.last_run_at) {
      const lastRun = new Date(queue.last_run_at);
      const hoursDiff = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60);
      if (hoursDiff < 20) {
        console.log(`[Drip Worker] Queue '${queue.name}' (${queue.id}) ran ${hoursDiff.toFixed(1)}h ago. Skipping for today.`);
        continue;
      }
    }

    console.log(`[Drip Worker] Releasing batch for queue '${queue.name}' (${queue.id})...`);
    const countToRelease = Math.min(queue.per_day, queue.cards_remaining);

    const { data: items, error: iErr } = await db
      .from("card_drip_items")
      .select("*")
      .eq("queue_id", queue.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(countToRelease);

    if (iErr || !items || items.length === 0) {
      console.error(`[Drip Worker] No pending items for queue ${queue.id}:`, iErr?.message);
      continue;
    }

    // Format today's base
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(now.getUTCDate()).padStart(2, "0");
    const primaryBrand = items[0]?.brand || "CARD";
    const baseName = `ADMIN_${yyyy}_${mm}_${dd}_${primaryBrand}`;
    const stamp = Date.now().toString(36);

    const clean = (s) => (!s || String(s).toLowerCase() === "null" ? "" : s);

    const products = items.map((c, idx) => ({
      category_id: queue.category_id || null,
      title: `${c.brand} ${c.bin} · ${clean(c.city) || clean(c.state) || clean(c.country) || "—"}`,
      slug: `${c.bin}-${stamp}-${idx}-${Math.random().toString(36).slice(2, 8)}`,
      price: queue.price,
      delivery_type: "key",
      active: true,
      stock: 1,
      bin: c.bin,
      brand: c.brand || null,
      country: clean(c.country) || null,
      state: clean(c.state) || null,
      city: clean(c.city) || null,
      zip: clean(c.zip) || null,
      exp_month: clean(c.month) || null,
      exp_year: clean(c.year) || null,
      base: baseName,
      refundable: queue.refundable,
      last_digits: (c.cc || "").replace(/\D/g, "").slice(-3) || null,
      has_phone: !!clean(c.tel),
      has_email: !!clean(c.email),
      created_at: now.toISOString(),
    }));

    const { data: inserted, error: pErr } = await db
      .from("products")
      .insert(products)
      .select("id, slug");

    if (pErr) {
      console.error(`[Drip Worker] Failed to insert products for queue ${queue.id}:`, pErr.message);
      continue;
    }

    // Insert keys
    const keys = (inserted ?? []).map((prod, idx) => ({
      product_id: prod.id,
      content: items[idx].card_line,
    }));
    const { error: kErr } = await db.from("product_keys").insert(keys);
    if (kErr) {
      console.error(`[Drip Worker] Failed to insert keys:`, kErr.message);
    }

    // Mark items as released
    const releasedIds = items.map((it) => it.id);
    await db
      .from("card_drip_items")
      .update({
        status: "released",
        released_at: now.toISOString(),
      })
      .in("id", releasedIds);

    // Update queue stats
    const remainingAfter = Math.max(0, queue.cards_remaining - items.length);
    await db
      .from("card_drip_queues")
      .update({
        cards_remaining: remainingAfter,
        last_run_at: now.toISOString(),
        status: remainingAfter === 0 ? "completed" : queue.status,
        updated_at: now.toISOString(),
      })
      .eq("id", queue.id);

    console.log(`[Drip Worker] Successfully released ${items.length} cards for '${queue.name}'! (${remainingAfter} left)`);

    // Announcements
    if (queue.auto_announce) {
      const pub = baseName.replace(/^\s*(admin|seller)[\s_\-.:]+/i, "");
      await db.from("announcements").insert({
        title: `Base Update: ${pub}`,
        body: `Fresh batch of verified cards added for base ${pub}. Available in shop now.`,
        kind: "update",
        created_at: now.toISOString(),
      }).catch((e) => console.error("Announcement insert error:", e.message));
    }

    // Telegram Broadcast
    if (queue.telegram_broadcast) {
      const countries = [...new Set(items.map((it) => it.country).filter(Boolean))].join(", ") || "MIX";
      await sendTelegramBroadcast(baseName, items.length, primaryBrand, countries, queue.price);
    }
  }
}

// Main execution loop
const runOnce = process.argv.includes("--once");

if (runOnce) {
  processActiveQueues().then(() => {
    console.log("[Drip Worker] Single run completed.");
    process.exit(0);
  });
} else {
  console.log("[Drip Worker] Starting daemon loop (interval: 15 minutes)...");
  processActiveQueues();
  setInterval(processActiveQueues, 15 * 60 * 1000);
}
