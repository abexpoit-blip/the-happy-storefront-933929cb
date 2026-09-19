#!/usr/bin/env node
/**
 * Zoru Shop Official Update & Drop Alert Bot (@Zorushopupdatebot)
 *
 * Dedicated strictly to:
 *   - 📦 Live Base Restock & Drop Alerts
 *   - 🔔 Instant Push Notifications to Subscribers
 *   - 📢 Official Telegram Channel Announcements (@zorushop)
 *   - 📊 Browsing Active Bases & Stock (/latest)
 *   - 🔗 Seamless Link to Official Card Checker Bot (@ZoruCheckerbot)
 *   - 🛒 Direct Storefront Access (zoru.cc/shop)
 *   - 💬 24/7 Official Support (@Zorushop_service)
 *
 * 100% PURE ZORU SHOP BRANDING — NO THIRD-PARTY ADS OR REDUNDANCIES!
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

// Dedicated update bot token (never fall back to checker bot token!)
const TOKEN = (
  process.env.TELEGRAM_UPDATE_BOT_TOKEN ||
  "8883627548:AAGrYhz6FNQXr5NRetLVbbke6lJ4EJEIk8g"
).trim();

const BASE = (process.env.BOT_API_BASE || process.env.API_BASE || "https://zoru.cc")
  .trim()
  .replace(/\/+$/, "");

const CHANNEL = (process.env.TELEGRAM_CHANNEL_ID || "@zorushop").trim();
const CHECKER_BOT_USERNAME = "ZoruCheckerbot";
const SUPPORT_USERNAME = "Zorushop_service";

const API = `https://api.telegram.org/bot${TOKEN}`;
const TELEGRAM_REQUEST_TIMEOUT_MS = 20_000;
const TELEGRAM_POLL_TIMEOUT_SECONDS = 30;
const TELEGRAM_POLL_REQUEST_TIMEOUT_MS = (TELEGRAM_POLL_TIMEOUT_SECONDS + 15) * 1000;

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

const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const esc = (s) => String(s || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]);

/* ------------------------------------------------------------------ */
/* Telegram helpers                                                    */
/* ------------------------------------------------------------------ */
async function tg(method, payload, timeoutMs = TELEGRAM_REQUEST_TIMEOUT_MS) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    const description = data.description || `HTTP ${res.status}`;
    throw new Error(`Telegram ${method} failed: ${description}`);
  }
  return data.result;
}

const send = (chat, text, extra = {}) =>
  tg("sendMessage", { chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });

const edit = (chat, msgId, text, extra = {}) =>
  tg("editMessageText", { chat_id: chat, message_id: msgId, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra }).catch(() => {});

/* ── Auto-register subscribers for base drops ── */
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
  } catch {}
}

async function getSubscriber(userId) {
  if (!db || !userId) return null;
  try {
    const { data } = await db
      .from("update_bot_subscribers")
      .select("subscribed")
      .eq("telegram_id", userId)
      .maybeSingle();
    return data;
  } catch {
    return null;
  }
}

async function setSubscribed(userId, subscribed) {
  if (!db || !userId) return false;
  try {
    const { error } = await db
      .from("update_bot_subscribers")
      .update({ subscribed, last_seen: new Date().toISOString() })
      .eq("telegram_id", userId);
    return !error;
  } catch {
    return false;
  }
}

/* ── UI Keyboards ── */
function buildMenuKeyboard(isSubscribed = true) {
  const notifLabel = isSubscribed ? "🔔 Notifications: ON" : "🔕 Notifications: MUTED";
  return {
    inline_keyboard: [
      [
        { text: "📦 Latest Bases", callback_data: "latest_bases" },
        { text: notifLabel, callback_data: "toggle_notif" },
      ],
      [
        { text: "🛒 Open Shop (zoru.cc)", url: `${BASE}/shop` },
        { text: "📢 Official Channel", url: "https://t.me/zorushop" },
      ],
      [
        { text: "💳 Card Checker Bot", url: `https://t.me/${CHECKER_BOT_USERNAME}` },
        { text: "💬 24/7 Support", url: `https://t.me/${SUPPORT_USERNAME}` },
      ],
    ],
  };
}

function buildReplyKeyboard() {
  return {
    keyboard: [
      [
        { text: "📦 Latest Bases" },
        { text: "🔔 Notification Status" },
      ],
      [
        { text: "🛒 Open Shop" },
        { text: "📢 Official Channel" },
      ],
      [
        { text: "💳 Card Checker Bot" },
        { text: "💬 Support" },
      ],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

/* ── Views ── */

async function showWelcome(chat, from) {
  await registerSubscriber(from);
  const sub = await getSubscriber(from.id);
  const isSubscribed = sub ? sub.subscribed !== false : true;

  const text = [
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `🚀 <b>ZORU SHOP — BASE UPDATES & DROPS</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `Welcome, <b>${esc(from.first_name || "Member")}</b>!`,
    ``,
    `This is the official announcement bot for <b>Zoru Shop</b>. You will receive real-time alerts whenever fresh card bases and restocks are released!`,
    ``,
    `🔔 <b>Drop Alerts:</b> ${isSubscribed ? "<code>ACTIVE (ON) ✅</code>" : "<code>MUTED 🔕</code>"}`,
    `📢 <b>Official Channel:</b> <a href="https://t.me/zorushop">@zorushop</a>`,
    `🛒 <b>Storefront:</b> <a href="${BASE}/shop">zoru.cc/shop</a>`,
    `💳 <b>Card Checker:</b> <a href="https://t.me/${CHECKER_BOT_USERNAME}">@${CHECKER_BOT_USERNAME}</a>`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `👇 <i>Tap an option below to browse or manage alerts:</i>`,
  ].join("\n");

  await send(chat, text, {
    reply_markup: buildReplyKeyboard(),
  });
  await send(chat, "📱 <b>Quick Action Menu:</b>", {
    reply_markup: buildMenuKeyboard(isSubscribed),
  });
}

function cleanBaseName(name) {
  if (!name) return "FRESH BASE";
  return String(name).replace(/^\s*(admin|seller)[\s_\-.:]+/i, "").trim();
}

async function showLatestBases(chat, from, isEditMsgId = null) {
  await registerSubscriber(from);

  if (!db) {
    const fallbackText = [
      `━━━━━━━━━━━━━━━━━━━`,
      `📦 <b>LATEST BASE RESTOCKS</b>`,
      `━━━━━━━━━━━━━━━━━━━`,
      `Visit the official shop catalog for real-time live inventory:`,
      `👉 <a href="${BASE}/shop"><b>${BASE}/shop</b></a>`,
      `━━━━━━━━━━━━━━━━━━━`,
    ].join("\n");
    if (isEditMsgId) await edit(chat, isEditMsgId, fallbackText);
    else await send(chat, fallbackText, { reply_markup: { inline_keyboard: [[{ text: "🛒 Open Shop", url: `${BASE}/shop` }]] } });
    return;
  }

  try {
    const { data: prods, error } = await db
      .from("products")
      .select("base, brand, country, price, stock, active")
      .eq("active", true)
      .gt("stock", 0)
      .not("base", "is", null)
      .limit(2000);

    if (error || !prods || prods.length === 0) {
      const emptyMsg = [
        `━━━━━━━━━━━━━━━━━━━`,
        `📦 <b>LATEST BASES IN STORE</b>`,
        `━━━━━━━━━━━━━━━━━━━`,
        `Currently, all existing base drops are being restocked!`,
        ``,
        `🔔 <i>Keep your alerts enabled to receive an instant notification as soon as the next drop lands.</i>`,
        `━━━━━━━━━━━━━━━━━━━`,
      ].join("\n");
      const kb = {
        inline_keyboard: [
          [{ text: "🛒 Visit Shop", url: `${BASE}/shop` }],
          [{ text: "🔄 Refresh", callback_data: "latest_bases" }],
        ],
      };
      if (isEditMsgId) await edit(chat, isEditMsgId, emptyMsg, { reply_markup: kb });
      else await send(chat, emptyMsg, { reply_markup: kb });
      return;
    }

    // Group products by base
    const baseMap = new Map();
    for (const p of prods) {
      if (!p.base) continue;
      const b = cleanBaseName(p.base);
      const cur = baseMap.get(b) || {
        count: 0,
        brands: new Set(),
        countries: new Set(),
        totalPrice: 0,
      };
      cur.count += (p.stock || 1);
      if (p.brand) cur.brands.add(p.brand.toUpperCase());
      if (p.country) cur.countries.add(p.country.toUpperCase());
      cur.totalPrice += Number(p.price || 1.5);
      baseMap.set(b, cur);
    }

    const baseList = [];
    for (const [bName, info] of baseMap.entries()) {
      baseList.push({
        name: bName,
        count: info.count,
        brand: Array.from(info.brands).slice(0, 2).join("/") || "MIX",
        country: Array.from(info.countries).slice(0, 3).join(", ") || "US",
        price: Number((info.totalPrice / Math.max(1, info.count)).toFixed(2)),
      });
    }

    // Sort descending by stock count
    baseList.sort((a, b) => b.count - a.count);

    const lines = [
      `━━━━━━━━━━━━━━━━━━━`,
      `📦 <b>LIVE BASES AVAILABLE IN SHOP</b>`,
      `━━━━━━━━━━━━━━━━━━━`,
      `⚡ Available Bases: <b>${baseList.length} distinct bases</b>`,
      `🌐 Storefront: <a href="${BASE}/shop"><b>${BASE}/shop</b></a>`,
      `━━━━━━━━━━━━━━━━━━━`,
    ];

    for (const b of baseList.slice(0, 8)) {
      lines.push(`🔥 <b>${esc(b.name)}</b>`);
      lines.push(`├ 🌍 Country: <b>${esc(b.country)}</b>`);
      lines.push(`├ 💳 Type: <b>${esc(b.brand)}</b>`);
      lines.push(`├ 📦 In Stock: <b>${b.count} cards</b>`);
      lines.push(`└ 💵 Starting: <b>${money(b.price)}</b>`);
      lines.push(``);
    }

    lines.push(`━━━━━━━━━━━━━━━━━━━`);
    lines.push(`⚡ <i>All bases have instant automated delivery upon purchase!</i>`);

    const buttons = {
      inline_keyboard: [
        [
          { text: "🛒 Buy on Zoru Shop", url: `${BASE}/shop` },
          { text: "🔄 Refresh", callback_data: "latest_bases" },
        ],
        [
          { text: "📢 Official Channel", url: "https://t.me/zorushop" },
          { text: "💳 Card Checker Bot", url: `https://t.me/${CHECKER_BOT_USERNAME}` },
        ],
      ],
    };

    if (isEditMsgId) {
      await edit(chat, isEditMsgId, lines.join("\n"), { reply_markup: buttons });
    } else {
      await send(chat, lines.join("\n"), { reply_markup: buttons });
    }
  } catch (err) {
    console.error("Error showing latest bases:", err);
    await send(chat, `❌ Could not load bases: ${esc(err.message || "Database error")}`);
  }
}

async function toggleNotifications(chat, from) {
  const sub = await getSubscriber(from.id);
  const current = sub ? sub.subscribed !== false : true;
  const next = !current;

  await setSubscribed(from.id, next);

  const statusText = next
    ? `🔔 <b>Drop Alerts Activated!</b>\n\nYou will receive real-time notifications directly in this chat whenever a new base drops.`
    : `🔕 <b>Drop Alerts Muted.</b>\n\nYou will not receive notifications in private chat. (You can still view them in @zorushop).`;

  await send(chat, statusText, {
    reply_markup: buildMenuKeyboard(next),
  });
}

function sendCheckerRedirect(chat) {
  return send(
    chat,
    [
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `💳 <b>LOOKING TO CHECK CARDS?</b>`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `This bot (<b>@Zorushopupdatebot</b>) is dedicated exclusively to <b>Live Base Drops & Shop Restock Updates</b>!`,
      ``,
      `For CC/CCN card checking, wallet balance, gate selection, and crypto deposits, please use our official <b>Card Checker Bot</b>:`,
      ``,
      `👉 <a href="https://t.me/${CHECKER_BOT_USERNAME}"><b>Open @${CHECKER_BOT_USERNAME}</b></a>`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
    ].join("\n"),
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "💳 Open Card Checker Bot", url: `https://t.me/${CHECKER_BOT_USERNAME}` }],
          [{ text: "📦 View Latest Bases", callback_data: "latest_bases" }],
        ],
      },
    }
  );
}

/* ------------------------------------------------------------------ */
/* Message and Callback Handlers                                      */
/* ------------------------------------------------------------------ */

async function handleMessage(msg) {
  const chat = msg.chat.id;
  const from = msg.from;
  const text = (msg.text || msg.caption || "").trim();
  if (!text || !from) return;

  // Intercept card checks or check commands and redirect cleanly to Checker Bot
  if (
    text.startsWith("/check") ||
    text.startsWith("/gate") ||
    text.startsWith("/deposit") ||
    text.startsWith("/balance") ||
    text.startsWith("/profile") ||
    text.startsWith("/refer") ||
    /\d{12,}/.test(text)
  ) {
    await sendCheckerRedirect(chat);
    return;
  }

  const parts = text.split(/\s+/);
  const cmd = parts[0].toLowerCase();

  switch (cmd) {
    case "/start":
    case "/menu":
      await showWelcome(chat, from);
      return;

    case "/latest":
    case "/bases":
      await showLatestBases(chat, from);
      return;

    case "/subscribe":
      await setSubscribed(from.id, true);
      await send(chat, `🔔 <b>Drop Alerts Activated!</b>\n\nYou are subscribed to real-time base restock notifications.`, {
        reply_markup: buildMenuKeyboard(true),
      });
      return;

    case "/unsubscribe":
      await setSubscribed(from.id, false);
      await send(chat, `🔕 <b>Drop Alerts Muted.</b>\n\nYou will not receive notifications in private chat.`, {
        reply_markup: buildMenuKeyboard(false),
      });
      return;

    case "/checker":
      await sendCheckerRedirect(chat);
      return;

    case "/channel":
      await send(chat, `📢 <b>Official Zoru Shop Channel:</b>\n<a href="https://t.me/zorushop">https://t.me/zorushop</a>\n\nJoin for restock announcements and community updates!`, {
        reply_markup: { inline_keyboard: [[{ text: "📢 Join Channel", url: "https://t.me/zorushop" }]] },
      });
      return;

    case "/shop":
      await send(chat, `🛒 <b>Official Zoru Shop:</b>\n<a href="${BASE}/shop">${BASE}/shop</a>\n\nInstant automated card delivery!`, {
        reply_markup: { inline_keyboard: [[{ text: "🛒 Open Storefront", url: `${BASE}/shop` }]] },
      });
      return;

    case "/support":
      await send(chat, `💬 <b>Customer Support:</b>\n<a href="https://t.me/${SUPPORT_USERNAME}">@${SUPPORT_USERNAME}</a>\n\n24/7 dedicated assistance.`, {
        reply_markup: { inline_keyboard: [[{ text: "💬 Contact Support", url: `https://t.me/${SUPPORT_USERNAME}` }]] },
      });
      return;

    case "/help":
      await send(chat, [
        `━━━━━━━━━━━━━━━━━━━`,
        `📖 <b>ZORU UPDATE BOT COMMANDS</b>`,
        `━━━━━━━━━━━━━━━━━━━`,
        `/latest — View latest available card bases`,
        `/subscribe — Enable private drop notifications`,
        `/unsubscribe — Mute private drop notifications`,
        `/channel — Official announcements channel`,
        `/checker — Switch to Card Checker Bot`,
        `/shop — Open official card store`,
        `/support — Contact 24/7 customer service`,
        `━━━━━━━━━━━━━━━━━━━`,
      ].join("\n"));
      return;
  }

  // Reply Keyboard Clicks
  const clean = text.toLowerCase();
  if (clean.includes("latest bases") || clean.includes("bases")) {
    await showLatestBases(chat, from);
    return;
  }
  if (clean.includes("notification") || clean.includes("alert")) {
    await toggleNotifications(chat, from);
    return;
  }
  if (clean.includes("card checker") || clean.includes("checker")) {
    await sendCheckerRedirect(chat);
    return;
  }
  if (clean.includes("shop") || clean.includes("store")) {
    await send(chat, `🛒 <b>Visit Zoru Shop:</b>\n<a href="${BASE}/shop">${BASE}/shop</a>\n\nInstant automated delivery upon checkout!`, {
      reply_markup: { inline_keyboard: [[{ text: "🛒 Open Shop Now", url: `${BASE}/shop` }]] },
    });
    return;
  }
  if (clean.includes("channel")) {
    await send(chat, `📢 <b>Official Channel:</b>\n<a href="https://t.me/zorushop">@zorushop</a>\n\nJoin for real-time base restocks and exclusive announcements!`, {
      reply_markup: { inline_keyboard: [[{ text: "📢 Join Channel", url: "https://t.me/zorushop" }]] },
    });
    return;
  }
  if (clean.includes("support") || clean.includes("contact")) {
    await send(chat, `💬 <b>Customer Support:</b>\n<a href="https://t.me/${SUPPORT_USERNAME}">@${SUPPORT_USERNAME}</a>\n\n24/7 dedicated customer assistance.`, {
      reply_markup: { inline_keyboard: [[{ text: "💬 Contact Support", url: `https://t.me/${SUPPORT_USERNAME}` }]] },
    });
    return;
  }

  // Default
  await showWelcome(chat, from);
}

async function handleCallback(q) {
  const chat = q.message.chat.id;
  const from = q.from;
  await tg("answerCallbackQuery", { callback_query_id: q.id }).catch(() => {});
  const data = q.data || "";

  if (data === "latest_bases") {
    await showLatestBases(chat, from, q.message.message_id);
    return;
  }

  if (data === "toggle_notif") {
    await toggleNotifications(chat, from);
    return;
  }

  if (data === "menu") {
    await showWelcome(chat, from);
    return;
  }

  await showWelcome(chat, from);
}

/* ------------------------------------------------------------------ */
/* Main Polling Loop                                                  */
/* ------------------------------------------------------------------ */
async function main() {
  const identity = await tg("getMe", {});
  console.log("=================================================");
  console.log(`🤖 Zoru Update Bot Authenticated: @${identity.username} (ID: ${identity.id})`);
  console.log(`Channel: ${CHANNEL}`);
  console.log(`Storefront: ${BASE}`);
  console.log("=================================================");

  await tg("deleteWebhook", { drop_pending_updates: false }).catch(() => {});

  await tg("setMyCommands", {
    commands: [
      { command: "menu", description: "📱 Main menu & alert status" },
      { command: "latest", description: "📦 View latest base restocks" },
      { command: "subscribe", description: "🔔 Enable drop notifications" },
      { command: "unsubscribe", description: "🔕 Mute drop notifications" },
      { command: "checker", description: "💳 Card Checker Bot (@ZoruCheckerbot)" },
      { command: "shop", description: "🛒 Official card shop" },
      { command: "channel", description: "📢 Official announcements channel" },
      { command: "support", description: "💬 24/7 Support service" },
      { command: "help", description: "📖 Commands list" },
    ],
  }).catch(() => {});

  let offset = 0;
  for (;;) {
    try {
      const updates = await tg(
        "getUpdates",
        { offset, timeout: TELEGRAM_POLL_TIMEOUT_SECONDS, allowed_updates: ["message", "callback_query"] },
        TELEGRAM_POLL_REQUEST_TIMEOUT_MS
      );
      for (const u of updates ?? []) {
        offset = u.update_id + 1;
        const chat = u.message?.chat?.id ?? u.callback_query?.message?.chat?.id;
        if (chat) {
          if (u.message) handleMessage(u.message).catch(console.error);
          else if (u.callback_query) handleCallback(u.callback_query).catch(console.error);
        }
      }
    } catch (err) {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

main().catch((err) => {
  console.error("Fatal update bot error:", err);
  process.exit(1);
});
