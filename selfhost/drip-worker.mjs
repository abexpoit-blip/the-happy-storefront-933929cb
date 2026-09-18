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

function detectBinMeta(rawCC) {
  const digits = String(rawCC || "").replace(/\D/g, "");
  const bin = digits.slice(0, 6);
  let brand = "VISA";
  if (/^4/.test(digits)) brand = "VISA";
  else if (/^(5[1-5]|2[2-7])/.test(digits)) brand = "MASTERCARD";
  else if (/^3[47]/.test(digits)) brand = "AMEX";
  else if (/^6(?:011|5)/.test(digits)) brand = "DISCOVER";
  else if (/^35/.test(digits)) brand = "JCB";

  let level = "STANDARD";
  const type = "CREDIT";
  let refundable = false;

  const binNum = parseInt(bin, 10) || 0;
  if (["414720", "414709", "438857", "473702", "473703", "480000", "480213", "471644", "434256", "412800"].includes(bin)) {
    level = "SIGNATURE";
    refundable = true;
  } else if (["446542", "400022", "426428", "426429"].includes(bin)) {
    level = "INFINITE";
    refundable = true;
  } else if (["546616", "542432", "543460", "542423", "546617"].includes(bin)) {
    level = "WORLD ELITE";
    refundable = true;
  } else if (["526284", "552433", "527506", "524332", "530000"].includes(bin)) {
    level = "WORLD";
    refundable = true;
  } else if (["440066", "480001", "480214", "471645", "434258", "412801", "542418"].includes(bin)) {
    level = "PLATINUM";
    refundable = true;
  } else if (["424604", "424631", "485458", "471646", "455365", "553420"].includes(bin)) {
    level = "BUSINESS";
    refundable = true;
  } else {
    refundable = (binNum % 100) < 50;
    level = refundable ? "PLATINUM" : "CLASSIC";
  }

  let bank = "UNKNOWN BANK";
  if (["414720", "414709", "424604", "424631", "438857", "440066", "473702", "473703", "446542", "546616", "526284", "542418"].includes(bin)) {
    bank = "JPMORGAN CHASE BANK, N.A.";
  } else if (["480000", "480001", "480213", "480214", "485458", "435607", "542432", "552433", "524332"].includes(bin)) {
    bank = "BANK OF AMERICA, N.A.";
  } else if (["471644", "471645", "471646", "409758", "434256", "434258", "543460", "527506"].includes(bin)) {
    bank = "WELLS FARGO BANK, N.A.";
  } else if (["412800", "412801", "455365", "542423"].includes(bin)) {
    bank = "CITIBANK, N.A.";
  } else if (["400344", "441290", "510510"].includes(bin)) {
    bank = "CAPITAL ONE, N.A.";
  } else if (/^3[47]/.test(digits)) {
    bank = "AMERICAN EXPRESS";
  }

  return { bin, brand, level, type, bank, refundable, country: "US" };
}

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

function getDhakaDateAndHour(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const getPart = (type) => parts.find((p) => p.type === type)?.value || "";
  const yyyy = getPart("year");
  const mm = getPart("month");
  const dd = getPart("day");
  const hourStr = getPart("hour");
  const minStr = getPart("minute");
  let hour = parseInt(hourStr, 10);
  if (hour === 24) hour = 0;
  const minute = parseInt(minStr, 10);
  return {
    dateStr: `${yyyy}-${mm}-${dd}`,
    hour,
    minute,
  };
}

async function processActiveQueues() {
  const now = new Date();
  const dhakaNow = getDhakaDateAndHour(now);
  console.log(
    `[Drip Worker] Checking queues at ${now.toISOString()} (Dhaka local: ${dhakaNow.dateStr} ${String(dhakaNow.hour).padStart(2, "0")}:${String(dhakaNow.minute).padStart(2, "0")})...`
  );

  // Target release hour: 10:00 AM Asia/Dhaka time (04:00 AM UTC)
  const TARGET_RELEASE_HOUR_DHAKA = 10;

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
    // 1. Check if queue has already released today in Asia/Dhaka date
    if (queue.last_run_at) {
      const lastRunDhaka = getDhakaDateAndHour(new Date(queue.last_run_at)).dateStr;
      if (lastRunDhaka === dhakaNow.dateStr) {
        console.log(`[Drip Worker] Queue '${queue.name}' (${queue.id}) already released for today (${dhakaNow.dateStr}) in Dhaka timezone. Skipping.`);
        continue;
      }
    }

    // 2. Check if current time in Asia/Dhaka has reached 10:00 AM
    if (dhakaNow.hour < TARGET_RELEASE_HOUR_DHAKA) {
      console.log(
        `[Drip Worker] Queue '${queue.name}' scheduled for 10:00 AM Asia/Dhaka (current Dhaka time: ${String(dhakaNow.hour).padStart(2, "0")}:${String(dhakaNow.minute).padStart(2, "0")}). Waiting.`
      );
      continue;
    }

    console.log(`[Drip Worker] Triggering 10:00 AM daily release for queue '${queue.name}' (${queue.id}) on Dhaka date ${dhakaNow.dateStr}...`);
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

    const products = items.map((c, idx) => {
      const meta = detectBinMeta(c.cc || c.bin);
      const isRef = queue.refundable === true ? true : meta.refundable;
      const cardCountry = clean(c.country) || meta.country || null;

      // Smart pricing: level & value based or fixed queue price
      let cardPrice = Number(queue.price || 1.50);
      if (queue.pricing_mode === "dynamic_level" || (queue.min_price && queue.max_price)) {
        const minP = Number(queue.min_price || 0.20);
        const maxP = Number(queue.max_price || 10.00);
        const range = Math.max(0.1, maxP - minP);
        let weight = 0.15;
        const lvl = (meta.level || "").toUpperCase();
        if (lvl.includes("INFINITE") || lvl.includes("WORLD ELITE") || lvl.includes("BLACK") || lvl.includes("CENTURION")) weight = 0.95;
        else if (lvl.includes("SIGNATURE") || lvl.includes("WORLD") || lvl.includes("BUSINESS") || lvl.includes("CORPORATE")) weight = 0.78;
        else if (lvl.includes("PLATINUM") || lvl.includes("TITANIUM")) weight = 0.58;
        else if (lvl.includes("GOLD") || lvl.includes("PREPAID")) weight = 0.35;

        const boost = (isRef ? range * 0.06 : 0) + (meta.type === "CREDIT" ? range * 0.04 : 0);
        const seed = parseInt(String(c.cc || "5555").replace(/\D/g, "").slice(-4) || "5555", 10) % 100;
        const variance = ((seed - 50) / 100) * (range * 0.12);
        cardPrice = Math.round(Math.max(minP, Math.min(maxP, minP + range * weight + variance + boost)) * 100) / 100;
      }

      return {
        category_id: queue.category_id || null,
        title: `${c.brand || meta.brand} ${c.bin} · ${clean(c.city) || clean(c.state) || cardCountry || "—"}`,
        slug: `${c.bin}-${stamp}-${idx}-${Math.random().toString(36).slice(2, 8)}`,
        price: cardPrice,
        delivery_type: "key",
        active: true,
        stock: 1,
        bin: c.bin,
        brand: c.brand || meta.brand || null,
        country: cardCountry,
        state: clean(c.state) || null,
        city: clean(c.city) || null,
        zip: clean(c.zip) || null,
        exp_month: clean(c.month) || null,
        exp_year: clean(c.year) || null,
        base: baseName,
        refundable: isRef,
        card_type: meta.type,
        card_level: meta.level,
        bank: meta.bank,
        last_digits: (c.cc || "").replace(/\D/g, "").slice(-3) || null,
        has_phone: !!clean(c.tel),
        has_email: !!clean(c.email),
        created_at: now.toISOString(),
      };
    });

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
  console.log("[Drip Worker] Starting daemon loop (interval: 3 minutes, daily target: 10:00 AM Asia/Dhaka)...");
  processActiveQueues();
  setInterval(processActiveQueues, 3 * 60 * 1000);
}
