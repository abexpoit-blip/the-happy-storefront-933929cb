#!/usr/bin/env node
/**
 * Zoru Shop Official Telegram Bot (Premium All-in-One Edition)
 *
 * Full Feature Suite:
 *   - 💳 CC/CCN Card Checker (Single & Bulk)
 *   - 📦 Live Base Updates & Restock Drops
 *   - 💎 Crypto Recharge (Plisio LTC with instant credit & QR)
 *   - 👤 Account Profile & Balance (Synced with Website)
 *   - ⚡ Gateway Selection (Multiple auth gates)
 *   - 💰 Referral Program (Earn bonus credit)
 *   - 🛒 Direct Shop Access (zoru.cc/shop)
 *   - 📊 Statistics & Logs
 *   - 🔑 API Key Info & Management
 *   - 📢 Official Channel (@zorushop)
 *   - 💬 24/7 Customer Support (@Zorushop_service)
 *   - Auto-subscribes users to base drop notifications
 *   - 100% PURE ZORU SHOP BRANDING — STRICTLY NO THIRD-PARTY ADS!
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

const TOKEN = (
  process.env.TELEGRAM_UPDATE_BOT_TOKEN ||
  "8883627548:AAGrYhz6FNQXr5NRetLVbbke6lJ4EJEIk8g"
).trim();

const BASE = (process.env.BOT_API_BASE || process.env.API_BASE || "https://zoru.cc")
  .trim()
  .replace(/\/+$/, "");

const SECRET = (
  process.env.BOT_ADMIN_SECRET ||
  process.env.TELEGRAM_BOT_ADMIN_SECRET ||
  ""
).trim();

const CHANNEL = (process.env.TELEGRAM_CHANNEL_ID || "@zorushop").trim();
const API = `https://api.telegram.org/bot${TOKEN}`;
const TELEGRAM_REQUEST_TIMEOUT_MS = 20_000;
const TELEGRAM_POLL_TIMEOUT_SECONDS = 30;
const TELEGRAM_POLL_REQUEST_TIMEOUT_MS = (TELEGRAM_POLL_TIMEOUT_SECONDS + 15) * 1000;
const WEBSITE_REQUEST_TIMEOUT_MS = 45_000;

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

/* ── Premium MENU Layout (Cyber-Luxury & Sleek) ── */
function buildMenuKeyboard(settings = settingsCache) {
  const adminContactUrl = settings.bot_admin_contact || "https://t.me/Zorushop_service";
  const websiteUrl = settings.bot_website_url || BASE;

  return {
    inline_keyboard: [
      [
        { text: "💳 Check Card", callback_data: "check" },
        { text: "📦 Latest Bases", callback_data: "latest_bases" },
      ],
      [
        { text: "👤 Balance & Profile", callback_data: "balance" },
        { text: "💎 Recharge Funds", callback_data: "deposit" },
      ],
      [
        { text: "⚡ Gate Selection", callback_data: "gates" },
        { text: "💰 Earn Credit", callback_data: "refer" },
      ],
      [
        { text: "🛒 Open Shop", url: `${websiteUrl.replace(/\/+$/, "")}/shop` },
        { text: "📊 Statistics", callback_data: "tasks" },
      ],
      [
        { text: "🔑 API Info", callback_data: "api" },
        { text: "📢 Official Channel", url: "https://t.me/zorushop" },
      ],
      [
        { text: "💬 Customer Support", url: adminContactUrl },
      ],
    ],
  };
}

function buildReplyKeyboard() {
  return {
    keyboard: [
      [
        { text: "💳 Check Card" },
        { text: "📦 Latest Bases" },
      ],
      [
        { text: "👤 Balance & Profile" },
        { text: "💎 Recharge Funds" },
      ],
      [
        { text: "⚡ Gate Selection" },
        { text: "💰 Earn Credit" },
      ],
      [
        { text: "🛒 Open Shop" },
        { text: "📊 Statistics" },
      ],
      [
        { text: "📢 Official Channel" },
        { text: "💬 Support" },
      ],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

const menu = async (chat, text) => {
  const s = await getSettings();
  const notice = s.bot_notice;
  const fullText = notice ? `${text}\n\n<i>📢 ${esc(notice)}</i>` : text;
  return send(chat, fullText, { reply_markup: buildMenuKeyboard(s) });
};

/* ------------------------------------------------------------------ */
/* Settings Cache                                                      */
/* ------------------------------------------------------------------ */
let settingsCache = {
  bot_maintenance: false,
  bot_maintenance_msg: "",
  bot_notice: "",
  checker_enabled: true,
  bot_admin_contact: "https://t.me/Zorushop_service",
  bot_website_url: BASE,
};
let settingsCachedAt = 0;

async function refreshSettings() {
  try {
    const d = await api("bot_settings", { id: 0, username: null, first_name: null }, {});
    settingsCache = {
      bot_maintenance: Boolean(d.bot_maintenance),
      bot_maintenance_msg: String(d.bot_maintenance_msg || "🔧 Under maintenance. Please check back shortly."),
      bot_notice: String(d.bot_notice || ""),
      checker_enabled: Boolean(d.checker_enabled !== false),
      bot_admin_contact: String(d.bot_admin_contact || "https://t.me/Zorushop_service"),
      bot_website_url: String(d.bot_website_url || BASE),
    };
  } catch {}
  settingsCachedAt = Date.now();
}

async function getSettings() {
  if (Date.now() - settingsCachedAt > 2 * 60 * 1000) await refreshSettings();
  return settingsCache;
}

/* ------------------------------------------------------------------ */
/* Website API Bridge                                                 */
/* ------------------------------------------------------------------ */
async function api(action, from, body = {}) {
  const res = await fetch(`${BASE}/api/public/bot/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-bot-secret": SECRET },
    body: JSON.stringify({
      telegram_id: from.id,
      username: from.username ?? null,
      first_name: from.first_name ?? null,
      ...body,
    }),
    signal: AbortSignal.timeout(WEBSITE_REQUEST_TIMEOUT_MS),
  });
  let data;
  try { data = await res.json(); } catch { throw new Error(`server_error_${res.status}`); }
  if (!res.ok || data.status !== "success") throw new Error(data.message || `error_${res.status}`);
  return data;
}

function extractCards(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /\d{12,}/.test(l))
    .slice(0, 500);
}

function friendlyError(err) {
  const raw = String(err instanceof Error ? err.message : err || "unknown");
  if (raw.includes("insufficient_balance")) return "Insufficient balance! Please recharge your account first.";
  if (raw.includes("invalid_amount")) return "Invalid amount entered. Please check minimum deposit limit.";
  if (raw.includes("no_cards_found")) return "No valid cards found in your message. Format: PAN|MM|YYYY|CVV";
  if (raw.includes("too_many_cards")) return "Too many cards at once. Maximum 500 cards per check.";
  if (raw.includes("fetch failed") || raw.includes("timeout")) return "Network timeout connecting to server. Please try again.";
  return raw.replace(/_/g, " ");
}

/* ------------------------------------------------------------------ */
/* Deposit System with Timer & Status Polling                         */
/* ------------------------------------------------------------------ */
const pendingDeposits = new Map();

function formatCountdown(expiresMs) {
  const left = Math.max(0, expiresMs - Date.now());
  const mins = Math.floor(left / 60000);
  const secs = Math.floor((left % 60000) / 1000);
  if (left === 0) return "⏰ Expired";
  return `⏱ <b>${mins}m ${secs.toString().padStart(2, "0")}s</b> remaining`;
}

function buildDepositCard(d, expiresMs) {
  return [
    `━━━━━━━━━━━━━━━━━━━`,
    `💎 <b>CRYPTO RECHARGE INVOICE</b>`,
    `━━━━━━━━━━━━━━━━━━━`,
    `<b>Status:</b> ⏳ Waiting for payment`,
    ``,
    `💰 <b>Amount Details:</b>`,
    `┌ Credit to wallet: <b>${money(d.credit)}</b>`,
    d.fee > 0 ? `├ Network fee: <b>${money(d.fee)}</b>` : "",
    `└ Total charged: <b>${money(d.charged)}</b>`,
    ``,
    `🔗 <b>Send Exactly (LTC):</b>`,
    `<code>${esc(d.crypto_amount)} LTC</code>`,
    `<i>(Tap amount to copy)</i>`,
    ``,
    `📬 <b>Deposit Address:</b>`,
    `<code>${esc(d.wallet_address)}</code>`,
    `<i>(Tap address to copy)</i>`,
    ``,
    `⏱ ${formatCountdown(expiresMs)}`,
    d.invoice_url ? `\n🌐 <a href="${esc(d.invoice_url)}"><b>Open Hosted Payment Page</b></a>` : "",
    ``,
    `⚡ <i>Funds will be added automatically to your account balance after 1 network confirmation.</i>`,
    `━━━━━━━━━━━━━━━━━━━`,
  ].filter((l) => l !== "").join("\n");
}

function depositButtons(depositId) {
  return {
    inline_keyboard: [
      [
        { text: "🔄 Check Payment Status", callback_data: `dep_status:${depositId}` },
        { text: "❌ Cancel", callback_data: "balance" },
      ],
    ],
  };
}

function clearDepositTimer(chat) {
  const d = pendingDeposits.get(chat);
  if (d?.timerId) clearInterval(d.timerId);
}

function startDepositTimer(chat, msgId, depositId, expiresMs, from = { id: chat }) {
  clearDepositTimer(chat);
  const tick = async () => {
    const d = pendingDeposits.get(chat);
    if (!d || d.messageId !== msgId) return;

    try {
      const st = await api("deposit_status", from, { deposit_id: depositId });
      if (st.deposit_status === "approved") {
        clearDepositTimer(chat);
        pendingDeposits.delete(chat);
        await edit(chat, msgId, [
          `━━━━━━━━━━━━━━━━━━━`,
          `✅ <b>PAYMENT CONFIRMED & CREDITED!</b>`,
          `━━━━━━━━━━━━━━━━━━━`,
          `Your cryptocurrency recharge has been verified on the blockchain!`,
          ``,
          `💵 <b>Amount Credited:</b> <code>${money(st.amount)}</code>`,
          ``,
          `⚡ <i>Funds have been added to your balance and are ready to use immediately!</i>`,
          `━━━━━━━━━━━━━━━━━━━`,
        ].join("\n"), {});
        return;
      }
      if (st.deposit_status === "rejected" || st.deposit_status === "expired") {
        clearDepositTimer(chat);
        pendingDeposits.delete(chat);
        await edit(chat, msgId, `⏰ <b>Invoice ${st.deposit_status.toUpperCase()}</b>\nThis deposit invoice has ended.`);
        return;
      }
    } catch {}

    if (Date.now() >= expiresMs + 30_000) {
      clearDepositTimer(chat);
      pendingDeposits.delete(chat);
      await edit(chat, msgId, `⏰ <b>Invoice Expired</b>\nPlease generate a new recharge invoice.`);
      return;
    }

    const current = pendingDeposits.get(chat);
    if (current) {
      await edit(
        chat,
        msgId,
        buildDepositCard(current, expiresMs),
        { reply_markup: depositButtons(depositId) }
      );
    }
  };
  const timerId = setInterval(tick, 10_000);
  const existing = pendingDeposits.get(chat);
  if (existing) existing.timerId = timerId;
}

/* ------------------------------------------------------------------ */
/* Command Handlers                                                   */
/* ------------------------------------------------------------------ */
const pendingAction = new Map();

async function showAccount(chat, from) {
  try {
    const { account } = await api("session", from);
    const text = [
      `━━━━━━━━━━━━━━━━━━━`,
      `👤 <b>ZORU PROFILE & WALLET</b>`,
      `━━━━━━━━━━━━━━━━━━━`,
      `🆔 <b>User ID:</b> <code>${esc(account.id)}</code>`,
      `💵 <b>Balance:</b> <code>${money(account.balance)}</code>`,
      account.bonus_balance > 0 ? `🎁 <b>Bonus Balance:</b> <code>${money(account.bonus_balance)}</code>` : "",
      `🎟 <b>Referral Code:</b> <code>${esc(account.referral_code || "-")}</code>`,
      `👥 <b>Referred Users:</b> <b>${account.referral_count || 0}</b>`,
      ``,
      `⚡ <b>Quick Actions:</b>`,
      `• Use 💳 <b>Check Card</b> to check CCV/CCN`,
      `• Use 📦 <b>Latest Bases</b> to view shop restocks`,
      `• Use 💎 <b>Recharge</b> to add funds via LTC`,
      `━━━━━━━━━━━━━━━━━━━`,
    ].filter((l) => l !== "").join("\n");
    await menu(chat, text);
  } catch (err) {
    await menu(chat, `❌ Failed to load account: ${esc(friendlyError(err))}`);
  }
}

async function showLatestBases(chat, from) {
  try {
    let bases = [];
    try {
      const res = await api("latest_bases", from);
      bases = res.bases || [];
    } catch {
      // Fallback direct db query
      if (db) {
        const { data } = await db
          .from("products")
          .select("base, brand, country, price, stock, created_at")
          .eq("active", true)
          .gt("stock", 0)
          .not("base", "is", null)
          .order("created_at", { ascending: false })
          .limit(100);
        const baseMap = new Map();
        for (const r of data ?? []) {
          const b = (r.base || "").replace(/^\s*(admin|seller)[\s_\-.:]+/i, "");
          if (!b) continue;
          if (!baseMap.has(b)) {
            baseMap.set(b, {
              base: b,
              count: r.stock || 1,
              brand: r.brand || "VISA/MC",
              country: r.country || "MIX",
              price: Number(r.price || 1.5),
            });
          } else {
            baseMap.get(b).count += (r.stock || 1);
          }
        }
        bases = Array.from(baseMap.values()).slice(0, 10);
      }
    }

    if (bases.length === 0) {
      await menu(chat, [
        `━━━━━━━━━━━━━━━━━━━`,
        `📦 <b>LATEST BASE DROPS</b>`,
        `━━━━━━━━━━━━━━━━━━━`,
        `Currently, no active card bases found in shop.`,
        `Please check back soon for fresh drops!`,
        `━━━━━━━━━━━━━━━━━━━`,
      ].join("\n"));
      return;
    }

    const lines = [
      `━━━━━━━━━━━━━━━━━━━`,
      `📦 <b>ZORU SHOP — LATEST BASE DROPS</b>`,
      `━━━━━━━━━━━━━━━━━━━`,
      `Verified fresh card drops currently available in shop:`,
      ``,
    ];

    for (const b of bases) {
      lines.push(`🔹 <code>${esc(b.base)}</code>`);
      lines.push(`   💳 <b>Stock:</b> ${b.count} cards | 🏷 <b>Brand:</b> ${esc(b.brand)}`);
      lines.push(`   🌍 <b>Country:</b> ${esc(b.country)} | 💰 <b>Price:</b> $${Number(b.price || 1.5).toFixed(2)}`);
      lines.push(``);
    }

    lines.push(`⚡ <i>All items are active with instant automated delivery.</i>`);
    lines.push(`━━━━━━━━━━━━━━━━━━━`);

    await send(chat, lines.join("\n"), {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🛒 Buy in Shop", url: "https://zoru.cc/shop" },
            { text: "🔄 Refresh Bases", callback_data: "latest_bases" },
          ],
          [
            { text: "💎 Recharge Funds", callback_data: "deposit" },
            { text: "🔙 Main Menu", callback_data: "balance" },
          ],
        ],
      },
    });
  } catch (err) {
    await menu(chat, `❌ Failed to fetch latest bases: ${esc(friendlyError(err))}`);
  }
}

async function startDeposit(chat) {
  pendingAction.set(chat, "deposit");
  await send(chat, [
    `━━━━━━━━━━━━━━━━━━━`,
    `💎 <b>RECHARGE WALLET FUNDS</b>`,
    `━━━━━━━━━━━━━━━━━━━`,
    `Choose a quick amount below or type any custom USD amount in chat (e.g. <code>25</code>):`,
    `━━━━━━━━━━━━━━━━━━━`,
  ].join("\n"), {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "$5", callback_data: "recharge:5" },
          { text: "$10", callback_data: "recharge:10" },
          { text: "$20", callback_data: "recharge:20" },
        ],
        [
          { text: "$50", callback_data: "recharge:50" },
          { text: "$100", callback_data: "recharge:100" },
          { text: "$200", callback_data: "recharge:200" },
        ],
        [
          { text: "🔙 Cancel", callback_data: "balance" },
        ],
      ],
    },
  });
}

async function createDeposit(chat, from, amount) {
  try {
    const d = await api("deposit", from, { amount });
    const expiresMs = Date.now() + 15 * 60 * 1000;
    const msg = await send(chat, buildDepositCard(d, expiresMs), {
      reply_markup: depositButtons(d.deposit_id),
    });
    pendingDeposits.set(chat, {
      messageId: msg.message_id,
      depositId: d.deposit_id,
      credit: d.credit,
      fee: d.fee,
      charged: d.charged,
      crypto_amount: d.crypto_amount,
      wallet_address: d.wallet_address,
      invoice_url: d.invoice_url,
      expiresMs,
    });
    startDepositTimer(chat, msg.message_id, d.deposit_id, expiresMs, from);
  } catch (err) {
    await menu(chat, `❌ Deposit creation failed: ${esc(friendlyError(err))}`);
  }
}

async function checkDepositStatus(chat, from, depositId) {
  try {
    const d = await api("deposit_status", from, { deposit_id: depositId });
    const status = String(d.deposit_status || "unknown");
    const statusEmoji = { approved: "✅", pending: "⏳", rejected: "❌", expired: "⏰" }[status] || "❓";
    await menu(chat, [
      `━━━━━━━━━━━━━━━━━━━`,
      `${statusEmoji} <b>DEPOSIT STATUS: ${status.toUpperCase()}</b>`,
      `━━━━━━━━━━━━━━━━━━━`,
      `Amount: <b>${money(d.amount)}</b>`,
      d.charged_amount ? `Charged: <b>${money(d.charged_amount)}</b>` : "",
      d.crypto_amount ? `Crypto: <code>${esc(d.crypto_amount)} LTC</code>` : "",
      status === "approved" ? `\n🎉 <b>Your payment is confirmed and balance updated!</b>` : "",
      status === "pending" ? `\n⏳ <i>Still waiting for blockchain payment confirmation.</i>` : "",
      status === "expired" ? `\n⏰ <i>This payment window has expired.</i>` : "",
      `━━━━━━━━━━━━━━━━━━━`,
    ].filter(Boolean).join("\n"));
  } catch (e) {
    await menu(chat, `❌ ${esc(friendlyError(e))}`);
  }
}

async function showReferrals(chat, from) {
  const { account } = await api("session", from);
  const webOrigin = settingsCache.bot_website_url || BASE;
  const link = `${webOrigin.replace(/\/+$/, "")}/auth?ref=${account.referral_code || ""}`;

  await menu(
    chat,
    [
      `━━━━━━━━━━━━━━━━━━━`,
      `💰 <b>EARN CREDIT & AFFILIATE</b>`,
      `━━━━━━━━━━━━━━━━━━━`,
      `Invite friends or customers and earn automatic cash commissions directly to your balance!`,
      ``,
      `🎟 <b>Your Referral Code:</b> <code>${esc(account.referral_code || "-")}</code>`,
      `🔗 <b>Your Invite Link:</b>`,
      `<code>${esc(link)}</code>`,
      ``,
      `🎁 <b>Commission Rate:</b> <code>${money(account.referral_bonus)}</code> per approved deposit`,
      `👥 <b>Total Invited:</b> <b>${account.referral_count}</b> users`,
      `💵 <b>Total Bonus Earned:</b> <code>${money(account.referral_earned)}</code>`,
      `━━━━━━━━━━━━━━━━━━━`,
    ].join("\n"),
  );
}

async function showGates(chat, from) {
  const g = await api("gates", from);
  const rows = g.gates.slice(0, 20).map((gate) => [
    {
      text: `${gate.id === g.selected ? "✅ " : "⚡ "}${gate.id}`,
      callback_data: `gate:${gate.id}`,
    },
  ]);
  rows.push([{ text: "🔙 Main Menu", callback_data: "balance" }]);

  await send(
    chat,
    [
      `━━━━━━━━━━━━━━━━━━━`,
      `⚡ <b>CHECKER GATES SELECTION</b>`,
      `━━━━━━━━━━━━━━━━━━━`,
      `Current Active Gate: <code>${esc(g.selected)}</code>`,
      ``,
      `Select a gateway below to activate:`,
      `━━━━━━━━━━━━━━━━━━━`,
    ].join("\n"),
    {
      reply_markup: { inline_keyboard: rows },
    },
  );
}

async function startCheck(chat) {
  pendingAction.set(chat, "check");
  await send(
    chat,
    [
      `━━━━━━━━━━━━━━━━━━━`,
      `💳 <b>CHECK CARDS (SINGLE / BULK)</b>`,
      `━━━━━━━━━━━━━━━━━━━`,
      `Send your card(s) now in the chat or upload a <code>.txt</code> file (up to 500 cards).`,
      ``,
      `📋 <b>Standard Format:</b>`,
      `<code>PAN|MM|YYYY|CVV</code>`,
      ``,
      `💡 <i>Example:</i>`,
      `<code>4111111111111111|12|2028|123</code>`,
      `━━━━━━━━━━━━━━━━━━━`,
    ].join("\n"),
  );
}

async function runCheck(chat, from, cards) {
  const settings = await getSettings();
  if (!settings.checker_enabled) {
    await menu(chat, "⚠️ The checker is temporarily disabled by admin.");
    return;
  }
  if (!cards.length) {
    await menu(chat, "❌ No valid card numbers found. Format: PAN|MM|YYYY|CVV");
    return;
  }

  const { account } = await api("session", from);
  const cost = Number(account.check_price || 0.10) * cards.length;
  if (account.balance < cost) {
    await menu(chat, [
      `❌ <b>Insufficient Balance</b>`,
      `Checking ${cards.length} card(s) requires <code>${money(cost)}</code>.`,
      `Your current balance: <code>${money(account.balance)}</code>.`,
      ``,
      `Please recharge using 💎 <b>Recharge Funds</b>.`,
    ].join("\n"));
    return;
  }

  const waitMsg = await send(chat, `⏳ Checking ${cards.length} card(s)... Please wait.`);
  try {
    const res = await api("check", from, { cards });
    const live = res.approved || [];
    const dead = res.declined || [];
    const err = res.errors || [];

    const lines = [
      `━━━━━━━━━━━━━━━━━━━`,
      `📊 <b>CHECK RESULTS SUMMARY</b>`,
      `━━━━━━━━━━━━━━━━━━━`,
      `✅ <b>LIVE (CVV/CCN):</b> ${live.length}`,
      `❌ <b>DEAD / DECLINED:</b> ${dead.length}`,
      `⚠️ <b>ERRORS:</b> ${err.length}`,
      `💰 <b>Cost Charged:</b> ${money(res.charged || cost)}`,
      `💵 <b>New Balance:</b> ${money(res.balance)}`,
      `━━━━━━━━━━━━━━━━━━━`,
    ];

    if (live.length > 0) {
      lines.push(`\n<b>🔥 APPROVED CARDS:</b>`);
      for (const c of live.slice(0, 20)) {
        lines.push(`✅ <code>${esc(c.line || c.card)}</code> — ${esc(c.msg || "APPROVED")}`);
      }
    }

    await edit(chat, waitMsg.message_id, lines.join("\n"));
  } catch (e) {
    await edit(chat, waitMsg.message_id, `❌ Check failed: ${esc(friendlyError(e))}`);
  }
}

async function showTasks(chat, from) {
  try {
    const res = await api("tasks", from);
    const tasks = res.tasks || [];
    if (!tasks.length) {
      await menu(chat, "📊 <b>No recent checking history found.</b>");
      return;
    }
    const lines = [
      `━━━━━━━━━━━━━━━━━━━`,
      `📊 <b>RECENT CHECK TASKS</b>`,
      `━━━━━━━━━━━━━━━━━━━`,
    ];
    for (const t of tasks.slice(0, 6)) {
      lines.push(`🆔 <code>${esc(t.id)}</code> | ${t.total} cards | Live: ${t.live || 0} | ${money(t.cost)}`);
    }
    lines.push(`━━━━━━━━━━━━━━━━━━━`);
    await menu(chat, lines.join("\n"));
  } catch (err) {
    await menu(chat, `❌ ${esc(friendlyError(err))}`);
  }
}

async function showApi(chat, from) {
  const { account } = await api("session", from);
  await send(
    chat,
    [
      `━━━━━━━━━━━━━━━━━━━`,
      `🔑 <b>DEVELOPER API ACCESS</b>`,
      `━━━━━━━━━━━━━━━━━━━`,
      `Integrate our high-speed CCV & CCN checker directly into your own tools and bots.`,
      ``,
      `⚡ <b>Endpoints:</b> <code>https://zoru.cc/api/public/v1/check</code>`,
      `💳 <b>Lifetime Fee:</b> <code>${money(account.api_fee || 10)}</code>`,
      `━━━━━━━━━━━━━━━━━━━`,
    ].join("\n"),
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔙 Main Menu", callback_data: "balance" }],
        ],
      },
    },
  );
}

/* ------------------------------------------------------------------ */
/* Message & Callback Router                                          */
/* ------------------------------------------------------------------ */
async function handleMessage(msg) {
  const chat = msg.chat.id;
  const from = msg.from;
  const text = (msg.text || msg.caption || "").trim();

  // Always subscribe user to updates
  await registerSubscriber(from);

  const settings = await getSettings();
  if (settings.bot_maintenance) {
    await send(chat, `🔧 <b>Maintenance</b>\n\n${esc(settings.bot_maintenance_msg)}`);
    return;
  }

  if (msg.document) {
    const file = await tg("getFile", { file_id: msg.document.file_id });
    const res = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`);
    const content = await res.text();
    pendingAction.delete(chat);
    await runCheck(chat, from, extractCards(content));
    return;
  }

  if (text.startsWith("/")) {
    const [cmd, ...args] = text.split(/\s+/);
    pendingAction.delete(chat);
    switch (cmd.split("@")[0]) {
      case "/start": {
        const ref = args[0] ? { ref: args[0] } : {};
        await api("session", from, ref).catch(() => {});
        const name = esc(from.first_name || "Member");
        await send(
          chat,
          [
            `⚡ ━━━━━━━━━━━━━━━━━━━━━ ⚡`,
            `        👑 <b>ZORU SHOP OFFICIAL BOT</b> 👑`,
            `⚡ ━━━━━━━━━━━━━━━━━━━━━ ⚡`,
            ``,
            `👋 Welcome, <b>${name}</b>!`,
            `Your automated high-speed hub for card checking, instant LTC crypto deposits, and live stock restocks.`,
            ``,
            `🚀 <b>Core Capabilities:</b>`,
            `┌ 💳 <b>Check Card:</b> Fast live CCV/CCN validation`,
            `├ 📦 <b>Latest Bases:</b> Real-time shop drops & restocks`,
            `├ 💎 <b>Recharge:</b> Instant zero-fee LTC wallet funding`,
            `├ 💰 <b>Affiliate:</b> Earn bonuses per referred user`,
            `└ ⚡ <b>Gateways:</b> Multi-gate auth processing`,
            ``,
            `🔔 <b>Status:</b> You are now subscribed to automated alerts!`,
            ``,
            `👇 <i>Select an option below to begin:</i>`,
            `━━━━━━━━━━━━━━━━━━━━━━`,
          ].join("\n"),
          { reply_markup: buildReplyKeyboard() }
        );
        await menu(chat, "📱 <b>Quick Navigation Menu:</b>");
        return;
      }
      case "/latest":
      case "/bases":
        await showLatestBases(chat, from);
        return;
      case "/menu":
      case "/profile":
      case "/balance":
        await showAccount(chat, from);
        return;
      case "/deposit":
        if (args[0] && Number(args[0]) > 0) {
          await createDeposit(chat, from, Number(args[0]));
        } else {
          await startDeposit(chat);
        }
        return;
      case "/check":
        if (args.length) await runCheck(chat, from, extractCards(args.join("\n")));
        else await startCheck(chat);
        return;
      case "/shop": {
        const s = await getSettings();
        const webUrl = s.bot_website_url || BASE;
        await send(chat, `🛒 <b>Visit Zoru Shop:</b>\n<a href="${webUrl.replace(/\/+$/, "")}/shop">${webUrl.replace(/\/+$/, "")}/shop</a>\n\nInstant automated delivery upon checkout!`, {
          reply_markup: { inline_keyboard: [[{ text: "🛒 Open Shop Now", url: `${webUrl.replace(/\/+$/, "")}/shop` }]] }
        });
        return;
      }
      case "/gate":
        await showGates(chat, from);
        return;
      case "/refer":
        await showReferrals(chat, from);
        return;
      case "/tasks":
        await showTasks(chat, from);
        return;
      case "/api":
        await showApi(chat, from);
        return;
      default:
        await menu(chat, "📖 Use the buttons below to navigate Zoru Shop.");
        return;
    }
  }

  // Reply keyboard button clicks
  const clean = text.toLowerCase();
  if (clean.includes("check card")) { pendingAction.delete(chat); await startCheck(chat); return; }
  if (clean.includes("latest bases") || clean.includes("bases")) { pendingAction.delete(chat); await showLatestBases(chat, from); return; }
  if (clean.includes("balance") || clean.includes("profile")) { pendingAction.delete(chat); await showAccount(chat, from); return; }
  if (clean.includes("recharge") || clean.includes("deposit")) { pendingAction.delete(chat); await startDeposit(chat); return; }
  if (clean.includes("gate")) { pendingAction.delete(chat); await showGates(chat, from); return; }
  if (clean.includes("earn credit") || clean.includes("refer")) { pendingAction.delete(chat); await showReferrals(chat, from); return; }
  if (clean.includes("statistics") || clean.includes("tasks")) { pendingAction.delete(chat); await showTasks(chat, from); return; }
  if (clean.includes("shop")) {
    const s = await getSettings();
    const webUrl = s.bot_website_url || BASE;
    await send(chat, `🛒 <b>Visit Zoru Shop:</b>\n<a href="${webUrl.replace(/\/+$/, "")}/shop">${webUrl.replace(/\/+$/, "")}/shop</a>\n\nInstant automated delivery upon checkout!`, {
      reply_markup: { inline_keyboard: [[{ text: "🛒 Open Shop Now", url: `${webUrl.replace(/\/+$/, "")}/shop` }]] }
    });
    return;
  }
  if (clean.includes("channel")) {
    await send(chat, `📢 <b>Official Channel:</b>\n<a href="https://t.me/zorushop">@zorushop</a>\n\nJoin for real-time base restocks and exclusive announcements!`, {
      reply_markup: { inline_keyboard: [[{ text: "📢 Join Channel", url: "https://t.me/zorushop" }]] }
    });
    return;
  }
  if (clean.includes("support") || clean.includes("contact")) {
    await send(chat, `💬 <b>Customer Support:</b>\n<a href="https://t.me/Zorushop_service">@Zorushop_service</a>\n\n24/7 dedicated customer assistance.`, {
      reply_markup: { inline_keyboard: [[{ text: "💬 Contact Support", url: "https://t.me/Zorushop_service" }]] }
    });
    return;
  }

  const waiting = pendingAction.get(chat);
  if (waiting === "deposit") {
    const amount = Number(text.replace(/[^0-9.]/g, ""));
    pendingAction.delete(chat);
    if (!Number.isFinite(amount) || amount < 5) {
      await menu(chat, `❌ <b>Invalid Amount:</b> Minimum deposit is <code>$5.00</code>.`);
      return;
    }
    await createDeposit(chat, from, amount);
    return;
  }

  const cards = extractCards(text);
  if (cards.length) {
    pendingAction.delete(chat);
    await runCheck(chat, from, cards);
    return;
  }

  await showAccount(chat, from);
}

async function handleCallback(q) {
  const chat = q.message.chat.id;
  const from = q.from;
  await tg("answerCallbackQuery", { callback_query_id: q.id });
  const data = q.data || "";

  if (data.startsWith("gate:")) {
    const gate = data.slice(5);
    await api("setgate", from, { gate });
    await menu(chat, `⚡ Gate set to <code>${esc(gate)}</code>`);
    return;
  }

  if (data.startsWith("dep_status:")) {
    const depositId = data.slice(11);
    await checkDepositStatus(chat, from, depositId);
    return;
  }

  if (data.startsWith("recharge:")) {
    const amt = Number(data.slice(9));
    if (amt > 0) {
      pendingAction.delete(chat);
      await createDeposit(chat, from, amt);
      return;
    }
  }

  switch (data) {
    case "balance": return showAccount(chat, from);
    case "deposit": return startDeposit(chat);
    case "check": return startCheck(chat);
    case "latest_bases": return showLatestBases(chat, from);
    case "gates": return showGates(chat, from);
    case "refer": return showReferrals(chat, from);
    case "api": return showApi(chat, from);
    case "tasks": return showTasks(chat, from);
    default: return showAccount(chat, from);
  }
}

/* ------------------------------------------------------------------ */
/* Main Polling Loop                                                  */
/* ------------------------------------------------------------------ */
async function main() {
  const identity = await tg("getMe", {});
  console.log("=================================================");
  console.log(`🤖 Zoru Bot Authenticated: @${identity.username} (ID: ${identity.id})`);
  console.log(`Website API: ${BASE}`);
  console.log("=================================================");

  await tg("deleteWebhook", { drop_pending_updates: false }).catch(() => {});

  await tg("setMyCommands", {
    commands: [
      { command: "menu", description: "📱 Main interactive menu" },
      { command: "balance", description: "👤 Profile & wallet balance" },
      { command: "deposit", description: "💎 Recharge balance (LTC)" },
      { command: "check", description: "💳 Check cards (single/bulk)" },
      { command: "latest", description: "📦 View latest base restocks" },
      { command: "shop", description: "🛒 Official card shop" },
      { command: "gate", description: "⚡ Select checking gate" },
      { command: "refer", description: "💰 Referral program & earn" },
      { command: "tasks", description: "📊 Check statistics & history" },
      { command: "help", description: "📖 Commands list" },
    ],
  }).catch(() => {});

  await refreshSettings().catch(() => {});

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
      // transient network wait
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

main().catch((err) => {
  console.error("Fatal bot error:", err);
  process.exit(1);
});
