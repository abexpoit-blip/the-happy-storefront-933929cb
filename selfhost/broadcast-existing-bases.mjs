#!/usr/bin/env node
/**
 * Standalone Script: Broadcast Existing Shop Bases to Telegram
 * Sends alerts for all currently active bases in shop to @zorushop channel & @Zorushopupdatebot subscribers.
 * 
 * Usage:
 *   node selfhost/broadcast-existing-bases.mjs [--limit=50]
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(filePath) {
  if (!existsSync(filePath)) return;
  try {
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
  } catch {}
}

loadEnv(join(__dirname, "../.env"));
loadEnv("/etc/zoru/backend.env");
loadEnv("/etc/zoru/telegram.env");

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://api.zoru.cc";
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "";

const telegramToken = (
  process.env.TELEGRAM_UPDATE_BOT_TOKEN ||
  process.env.TELEGRAM_BOT_TOKEN ||
  "8883627548:AAGUiY5v8qRAq5bEZ_uHRI4FLtkyoGM_sUQ"
).trim();

const telegramChannel = (process.env.TELEGRAM_CHANNEL_ID || "@zorushop").trim();

if (!serviceKey) {
  console.error("❌ SUPABASE key is required to query existing bases.");
  process.exit(1);
}

const db = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

function publicBase(base) {
  if (!base) return "FRESH_BASE";
  return base.replace(/^\s*(admin|seller)[\s_\-.:]+/i, "");
}

async function main() {
  console.log("=================================================");
  console.log("⚡ ZORU SHOP — BROADCAST EXISTING BASES TO TELEGRAM ⚡");
  console.log("=================================================");
  console.log(`Backend API: ${supabaseUrl}`);
  console.log(`Channel: ${telegramChannel}`);
  console.log(`Update Bot: token prefix ${telegramToken.slice(0, 10)}...`);

  // Parse --limit argument if provided
  let limit = 100;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--limit=")) {
      limit = parseInt(arg.split("=")[1], 10) || 100;
    }
  }

  console.log(`\nFetching active products with stock > 0...`);
  const { data: prods, error: pErr } = await db
    .from("products")
    .select("base, brand, country, price, stock, active")
    .eq("active", true)
    .gt("stock", 0)
    .not("base", "is", null)
    .limit(10000);

  if (pErr) {
    console.error("❌ Database query error:", pErr.message);
    process.exit(1);
  }

  if (!prods || prods.length === 0) {
    console.log("⚠️ No active products with bases found in the shop.");
    process.exit(0);
  }

  console.log(`Found ${prods.length} active card product(s). Grouping by base...`);

  // Group by base
  const baseMap = new Map();
  for (const p of prods) {
    if (!p.base) continue;
    const b = p.base;
    const cur = baseMap.get(b) || {
      count: 0,
      brands: new Set(),
      countries: new Set(),
      totalPrice: 0,
    };
    cur.count += (p.stock || 1);
    if (p.brand) cur.brands.add(p.brand);
    if (p.country) cur.countries.add(p.country);
    cur.totalPrice += Number(p.price || 1.5);
    baseMap.set(b, cur);
  }

  const baseList = [];
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
  const toBroadcast = baseList.slice(0, limit);

  console.log(`Total distinct bases found: ${baseList.length}`);
  console.log(`Bases to broadcast: ${toBroadcast.length}\n`);

  // Fetch registered subscribers
  const { data: subs } = await db
    .from("update_bot_subscribers")
    .select("telegram_id")
    .eq("subscribed", true)
    .limit(500);

  const subscriberCount = subs?.length || 0;
  console.log(`Found ${subscriberCount} registered update bot subscriber(s).`);

  let sentCount = 0;
  let failCount = 0;

  for (let i = 0; i < toBroadcast.length; i++) {
    const b = toBroadcast[i];
    const pBase = publicBase(b.baseName);
    const text = [
      `⚡ <b>ZORU SHOP — BASE UPDATE!</b> ⚡`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `📦 <b>Base:</b> <code>${pBase}</code>`,
      `🏷 <b>Brand:</b> ${b.brand}`,
      `🌍 <b>Country:</b> ${b.country}`,
      `💳 <b>In Stock:</b> ${b.count} Verified Cards`,
      `💰 <b>Price:</b> $${b.price.toFixed(2)}`,
      `⚡ <b>Delivery:</b> Instant Automated Delivery`,
      ``,
      `🛒 <b>Shop Now:</b> <a href="https://zoru.cc/shop">zoru.cc/shop</a>`,
      `🤖 <b>Checker Bot:</b> <a href="https://t.me/ZoruCheckerbot">@ZoruCheckerbot</a>`,
      `📢 <b>Official Channel:</b> ${telegramChannel}`,
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

    try {
      // 1. Post to channel
      const res = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: telegramChannel,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup: replyMarkup,
        }),
        signal: AbortSignal.timeout(10000),
      });

      const json = await res.json();
      if (res.ok && json.ok) {
        sentCount++;
        console.log(`[${i + 1}/${toBroadcast.length}] ✔ Broadcasted ${pBase} (${b.count} cards, $${b.price})`);
      } else {
        failCount++;
        console.warn(`[${i + 1}/${toBroadcast.length}] ❌ Failed to broadcast ${pBase}: ${json.description || res.statusText}`);
      }

      // 2. Post to update bot subscribers
      for (const s of subs ?? []) {
        fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: s.telegram_id,
            text,
            parse_mode: "HTML",
            disable_web_page_preview: true,
            reply_markup: replyMarkup,
          }),
        }).catch(() => {});
      }
    } catch (err) {
      failCount++;
      console.error(`[${i + 1}/${toBroadcast.length}] ❌ Network error for ${pBase}:`, err.message);
    }

    // Rate limit throttle: 600ms between each message
    if (i < toBroadcast.length - 1) {
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  console.log("\n=================================================");
  console.log(`🎉 COMPLETED! Sent: ${sentCount} | Failed: ${failCount} | Total: ${toBroadcast.length}`);
  console.log("=================================================");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
