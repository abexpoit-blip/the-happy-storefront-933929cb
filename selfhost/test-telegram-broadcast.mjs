#!/usr/bin/env node
/**
 * Standalone Diagnostic Tool: Test Telegram Broadcast across all channels and subscribers
 * Usage:
 *   node selfhost/test-telegram-broadcast.mjs
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
  "";

const telegramToken = (
  process.env.TELEGRAM_UPDATE_BOT_TOKEN ||
  "8883627548:AAGrYhz6FNQXr5NRetLVbbke6lJ4EJEIk8g"
).trim();

const db = serviceKey ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } }) : null;

async function getAllBroadcastChannels() {
  const channelSet = new Set();

  const envChannels = [
    process.env.TELEGRAM_CHANNELS,
    process.env.TELEGRAM_CHANNEL_ID,
  ].filter(Boolean).join(",");

  for (const raw of envChannels.split(/[,\s]+/)) {
    const ch = raw.trim().replace(/^["']|["']$/g, "");
    if (ch) channelSet.add(ch);
  }

  try {
    if (existsSync("/etc/zoru/telegram.env")) {
      const content = readFileSync("/etc/zoru/telegram.env", "utf8");
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

async function main() {
  console.log("=================================================");
  console.log("⚡ ZORU SHOP — TELEGRAM BROADCAST DIAGNOSTIC ⚡");
  console.log("=================================================");

  // 1. Verify Bot
  try {
    const meRes = await fetch(`https://api.telegram.org/bot${telegramToken}/getMe`);
    const meJson = await meRes.json();
    if (meJson.ok) {
      console.log(`🤖 Bot Username: @${meJson.result.username} (ID: ${meJson.result.id})`);
    } else {
      console.error("❌ Bot Token is invalid:", meJson.description);
      process.exit(1);
    }
  } catch (err) {
    console.error("❌ Failed to reach Telegram API:", err.message);
    process.exit(1);
  }

  // 2. Discover channels
  const channels = await getAllBroadcastChannels();
  console.log(`📢 Discovered ${channels.length} broadcast channel(s): ${channels.join(", ")}`);

  // 3. Discover subscribers
  let subsCount = 0;
  let tgUsersCount = 0;
  if (db) {
    const { data: subs } = await db.from("update_bot_subscribers").select("telegram_id").eq("subscribed", true);
    subsCount = subs?.length || 0;
    const { data: tgUsers } = await db.from("telegram_accounts").select("telegram_id").eq("banned", false);
    tgUsersCount = tgUsers?.length || 0;
  }
  console.log(`👥 Bot Subscribers: ${subsCount} in update_bot_subscribers, ${tgUsersCount} in telegram_accounts`);

  // 4. Send ping to all channels
  console.log("\n🚀 Testing broadcast to channels...");
  const text = [
    `⚡ <b>ZORU SHOP — BROADCAST TEST</b> ⚡`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `✅ <b>Status:</b> Multi-channel broadcast is ONLINE & OPERATIONAL!`,
    `📢 <b>Channels Active:</b> ${channels.length}`,
    `🕒 <b>Time:</b> ${new Date().toUTCString()}`,
    ``,
    `🛒 <b>Storefront:</b> <a href="https://zoru.cc/shop">zoru.cc/shop</a>`,
    `🤖 <b>Checker:</b> @ZoruCheckerbot`,
    `💬 <b>Support:</b> @Zorushop_service`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
  ].join("\n");

  for (const ch of channels) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: ch,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        console.log(`  ✅ Channel ${ch}: Delivered successfully! (msg_id: ${json.result?.message_id})`);
      } else {
        console.warn(`  ⚠️ Channel ${ch}: Failed (${json.description || res.statusText})`);
      }
    } catch (err) {
      console.error(`  ❌ Channel ${ch}: Network exception (${err.message})`);
    }
  }

  console.log("\n=================================================");
  console.log("🎉 Test completed!");
  console.log("=================================================");
}

main().catch(console.error);
