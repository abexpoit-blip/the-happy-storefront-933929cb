#!/usr/bin/env node
/**
 * Zoru Shop Update Bot (@Zorushopupdatebot)
 *
 * Dedicated bot for broadcast alerts, base drops, restocks, and notifications.
 * Runs independently alongside zoru-cc and checker-bot under PM2.
 */

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

// Load envs
loadEnv(join(__dirname, "../.env"));
loadEnv("/etc/zoru/backend.env");
loadEnv("/etc/zoru/telegram.env");

const TOKEN = (
  process.env.TELEGRAM_UPDATE_BOT_TOKEN ||
  "8883627548:AAGUiY5v8qRAq5bEZ_uHRI4FLtkyoGM_sUQ"
).trim();

const CHANNEL = (process.env.TELEGRAM_CHANNEL_ID || "@zorushop").trim();
const API = `https://api.telegram.org/bot${TOKEN}`;
const POLL_TIMEOUT = 30;

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://api.zoru.cc";
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "";

let db = null;
if (serviceKey) {
  db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
}

async function tg(method, payload) {
  try {
    const res = await fetch(`${API}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(35000),
    });
    return await res.json().catch(() => ({}));
  } catch (err) {
    return { ok: false, description: err.message };
  }
}

async function registerSubscriber(user) {
  if (!db || !user || !user.id) return;
  try {
    await db.from("update_bot_subscribers").upsert({
      telegram_id: user.id,
      username: user.username || null,
      first_name: user.first_name || null,
      subscribed: true,
      last_seen: new Date().toISOString(),
    });
  } catch (err) {
    // Non-blocking
  }
}

async function getLatestBases() {
  if (!db) return [];
  try {
    const { data } = await db
      .from("products")
      .select("base, brand, country, created_at")
      .eq("active", true)
      .gt("stock", 0)
      .order("created_at", { ascending: false })
      .limit(80);

    if (!data || data.length === 0) return [];

    const distinct = new Map();
    for (const row of data) {
      const b = (row.base || "").replace(/^\s*(admin|seller)[\s_\-.:]+/i, "");
      if (!b) continue;
      if (!distinct.has(b)) {
        distinct.set(b, {
          base: b,
          brand: row.brand || "VISA",
          country: row.country || "MIX",
          date: row.created_at,
        });
      }
    }
    return Array.from(distinct.values()).slice(0, 8);
  } catch {
    return [];
  }
}

function mainKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "🛒 Open Shop", url: "https://zoru.cc/shop" },
        { text: "🤖 Checker Bot", url: "https://t.me/ZoruCheckerbot" },
      ],
      [
        { text: "📦 Latest Bases", callback_data: "cmd_latest" },
        { text: "📢 Official Channel", url: "https://t.me/zorushop" },
      ],
      [
        { text: "💬 Customer Support", url: "https://t.me/Zorushop_service" },
      ],
    ],
  };
}

async function handleMessage(msg) {
  const chatId = msg.chat?.id;
  const text = (msg.text || "").trim();
  const from = msg.from;

  if (!chatId) return;
  await registerSubscriber(from);

  if (text.startsWith("/start")) {
    const welcome = [
      `⚡ <b>WELCOME TO ZORU SHOP UPDATES!</b> ⚡`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `Stay tuned with real-time base drops, card restocks, and exclusive announcements.`,
      ``,
      `🔔 <b>Status:</b> You are now subscribed to automated alerts!`,
      `🛒 <b>Store Domain:</b> <a href="https://zoru.cc/shop">https://zoru.cc/shop</a>`,
      `🤖 <b>Checker Bot:</b> <a href="https://t.me/ZoruCheckerbot">@ZoruCheckerbot</a>`,
      `📢 <b>Official Channel:</b> ${CHANNEL}`,
      `💬 <b>Support:</b> @Zorushop_service`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `<i>Tap below to browse cards or check recent drops:</i>`,
    ].join("\n");

    await tg("sendMessage", {
      chat_id: chatId,
      text: welcome,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: mainKeyboard(),
    });
    return;
  }

  if (text.startsWith("/latest") || text.startsWith("/bases")) {
    await sendLatestBases(chatId);
    return;
  }

  if (text.startsWith("/shop")) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: `🛒 <b>Visit Zoru Shop:</b>\n<a href="https://zoru.cc/shop">https://zoru.cc/shop</a>\n\nInstant automated delivery upon checkout!`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "🛒 Open Shop Now", url: "https://zoru.cc/shop" }]],
      },
    });
    return;
  }

  if (text.startsWith("/checker")) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: `🤖 <b>Zoru Checker Bot:</b>\n<a href="https://t.me/ZoruCheckerbot">@ZoruCheckerbot</a>\n\nCheck CCV live balance, format cards, and automate checking!`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "🤖 Open Checker Bot", url: "https://t.me/ZoruCheckerbot" }]],
      },
    });
    return;
  }

  if (text.startsWith("/help")) {
    const helpText = [
      `⚡ <b>ZORU SHOP UPDATE BOT COMMANDS</b> ⚡`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `• /start - Subscribe to base alerts & notifications`,
      `• /latest - View recently dropped card bases`,
      `• /shop - Direct link to Zoru storefront`,
      `• /checker - Open official checker bot`,
      `• /support - Contact 24/7 customer care`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
    ].join("\n");

    await tg("sendMessage", {
      chat_id: chatId,
      text: helpText,
      parse_mode: "HTML",
      reply_markup: mainKeyboard(),
    });
    return;
  }
}

async function sendLatestBases(chatId) {
  const bases = await getLatestBases();
  if (!bases.length) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: `📦 <b>No new bases in stock at this moment.</b>\nCheck back soon or visit the shop:\nhttps://zoru.cc/shop`,
      parse_mode: "HTML",
      reply_markup: mainKeyboard(),
    });
    return;
  }

  const lines = [
    `⚡ <b>ZORU SHOP — RECENT BASE UPDATES:</b> ⚡`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
  ];
  for (const b of bases) {
    lines.push(`📦 <code>${b.base}</code> (${b.brand} · ${b.country})`);
  }
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`🛒 <b>Shop Now:</b> <a href="https://zoru.cc/shop">https://zoru.cc/shop</a>`);

  await tg("sendMessage", {
    chat_id: chatId,
    text: lines.join("\n"),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: mainKeyboard(),
  });
}

async function handleCallback(cb) {
  const chatId = cb.message?.chat?.id;
  const data = cb.data;
  if (!chatId) return;

  await tg("answerCallbackQuery", { callback_query_id: cb.id });

  if (data === "cmd_latest") {
    await sendLatestBases(chatId);
  }
}

async function startPolling() {
  console.log(`[UpdateBot] Starting polling for @Zorushopupdatebot (${TOKEN.slice(0, 10)}...)...`);
  let offset = 0;

  const me = await tg("getMe", {});
  if (me.ok) {
    console.log(`[UpdateBot] Logged in as @${me.result.username} (${me.result.first_name})`);
  } else {
    console.error(`[UpdateBot] getMe failed:`, me.description);
  }

  while (true) {
    try {
      const updates = await tg("getUpdates", {
        offset,
        timeout: POLL_TIMEOUT,
        allowed_updates: ["message", "callback_query"],
      });

      if (updates.ok && Array.isArray(updates.result)) {
        for (const u of updates.result) {
          offset = u.update_id + 1;
          if (u.message) handleMessage(u.message).catch(() => {});
          else if (u.callback_query) handleCallback(u.callback_query).catch(() => {});
        }
      } else {
        await new Promise((r) => setTimeout(r, 3000));
      }
    } catch (err) {
      console.error("[UpdateBot] Polling loop error:", err.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

startPolling();
