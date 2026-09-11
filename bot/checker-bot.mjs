#!/usr/bin/env node
/**
 * Zoru Telegram bot — Premium UI edition.
 *
 * Every Telegram user automatically gets a real website account on /start.
 * Balance, deposits (Plisio LTC), referrals, single + bulk checking and API
 * access all run through the site's own API.
 *
 * NEW in this version:
 *   - Premium inline-keyboard layout with emoji icons
 *   - Rich deposit popup with tap-to-copy LTC address + countdown timer
 *   - "Check payment status" callback button
 *   - Maintenance mode (reads bot_maintenance from site_settings)
 *   - Persistent bot notice banner (bot_notice setting)
 *
 * Env:
 *   TELEGRAM_BOT_TOKEN   bot token from @BotFather
 *   BOT_API_BASE         site base url, default https://zoru.cc
 *   BOT_ADMIN_SECRET     shared secret, must match the site's .env
 */

const TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const BASE = (process.env.BOT_API_BASE || process.env.API_BASE || "https://zoru.cc")
  .trim()
  .replace(/\/+$/, "");
const SECRET = (process.env.BOT_ADMIN_SECRET || process.env.TELEGRAM_BOT_ADMIN_SECRET || "").trim();

if (!TOKEN) { console.error("TELEGRAM_BOT_TOKEN is missing"); process.exit(1); }
if (!SECRET) { console.error("BOT_ADMIN_SECRET is missing (must match the website .env)"); process.exit(1); }

const API = `https://api.telegram.org/bot${TOKEN}`;
const TELEGRAM_REQUEST_TIMEOUT_MS = 20_000;
const TELEGRAM_POLL_TIMEOUT_SECONDS = 30;
const TELEGRAM_POLL_REQUEST_TIMEOUT_MS = (TELEGRAM_POLL_TIMEOUT_SECONDS + 15) * 1000;
const WEBSITE_REQUEST_TIMEOUT_MS = 45_000;
const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]);

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

/* ── Premium MENU (Modern 2-Column Grid) ── */
function buildMenuKeyboard(settings = settingsCache) {
  const adminContactUrl = settings.bot_admin_contact || "https://t.me/samexpoit";
  const websiteUrl = settings.bot_website_url || BASE;

  return {
    inline_keyboard: [
      [
        { text: "💳 Check Card", callback_data: "check" },
        { text: "💰 Earn Credit", callback_data: "refer" },
      ],
      [
        { text: "💰 Balance", callback_data: "balance" },
        { text: "⚡ Gate", callback_data: "gates" },
      ],
      [
        { text: "💎 Recharge", callback_data: "deposit" },
        { text: "📊 Statistics", callback_data: "tasks" },
      ],
      [
        { text: "🔑 API Info", callback_data: "api" },
        { text: "🌐 Website", url: websiteUrl },
      ],
      [
        { text: "📩 Contact Admin", url: adminContactUrl },
      ],
    ],
  };
}

const send = (chat, text, extra = {}) =>
  tg("sendMessage", { chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });

const edit = (chat, msgId, text, extra = {}) =>
  tg("editMessageText", { chat_id: chat, message_id: msgId, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra }).catch(() => {});

const menu = async (chat, text) => {
  const s = await getSettings();
  const notice = s.bot_notice;
  const fullText = notice ? `${text}\n\n<i>📢 ${esc(notice)}</i>` : text;
  return send(chat, fullText, { reply_markup: buildMenuKeyboard(s) });
};

/* ------------------------------------------------------------------ */
/* Bot settings cache (refreshed every 2 min)                         */
/* ------------------------------------------------------------------ */

let settingsCache = {
  bot_maintenance: false,
  bot_maintenance_msg: "",
  bot_notice: "",
  checker_enabled: true,
  bot_admin_contact: "https://t.me/samexpoit",
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
      bot_admin_contact: String(d.bot_admin_contact || "https://t.me/samexpoit"),
      bot_website_url: String(d.bot_website_url || BASE),
    };
  } catch { /* keep previous */ }
  settingsCachedAt = Date.now();
}

async function getSettings() {
  if (Date.now() - settingsCachedAt > 2 * 60 * 1000) await refreshSettings();
  return settingsCache;
}

async function getBotNotice() {
  const s = await getSettings();
  return s.bot_notice;
}

/* ------------------------------------------------------------------ */
/* Website bridge                                                      */
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

/* ------------------------------------------------------------------ */
/* Card parsing                                                        */
/* ------------------------------------------------------------------ */

function extractCards(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /\d{12,}/.test(l))
    .slice(0, 500);
}

/* ------------------------------------------------------------------ */
/* Deposit countdown state                                             */
/* ------------------------------------------------------------------ */

// pendingDeposits: chatId -> { messageId, depositId, expiresMs, timerId }
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

function startDepositTimer(chat, msgId, depositId, expiresMs) {
  // Cancel any existing timer for this chat
  clearDepositTimer(chat);

  const tick = async () => {
    const d = pendingDeposits.get(chat);
    if (!d || d.messageId !== msgId) return; // stale
    if (Date.now() >= expiresMs + 30_000) {
      // Grace period passed — stop ticking
      clearDepositTimer(chat);
      return;
    }
    // Rebuild card and edit message (ignore edit failures due to "message not modified")
    const current = pendingDeposits.get(chat);
    if (current) {
      await edit(chat, msgId,
        buildDepositCard({ credit: current.credit, fee: current.fee, charged: current.charged, crypto_amount: current.crypto_amount, wallet_address: current.wallet_address, invoice_url: current.invoice_url }, expiresMs),
        { reply_markup: depositButtons(depositId) }
      );
    }
  };

  const timerId = setInterval(tick, 60_000);
  const existing = pendingDeposits.get(chat);
  if (existing) existing.timerId = timerId;
}

function clearDepositTimer(chat) {
  const d = pendingDeposits.get(chat);
  if (d?.timerId) { clearInterval(d.timerId); d.timerId = null; }
}

/* ------------------------------------------------------------------ */
/* Feature handlers                                                    */
/* ------------------------------------------------------------------ */

const pendingAction = new Map(); // chat id -> "deposit" | "check"
const chatQueues = new Map();    // serialize updates from the same chat

function friendlyError(error) {
  const raw = String(error instanceof Error ? error.message : error || "server_error");
  if (raw.includes("unauthorized")) return "Bot authorization failed. Please contact support.";
  if (raw.includes("account_banned")) return "🚫 This account is banned.";
  if (raw.includes("insufficient_balance")) return "💸 Not enough balance. Use 📥 Deposit to top up.";
  if (raw.includes("invalid_gate")) return "That checking gate is not available.";
  if (raw.includes("deposit_already_pending")) return "You already have a pending deposit. Use ✅ Check payment status or wait for it to expire.";
  if (raw.includes("checker_not_configured")) return "The checker service is temporarily unavailable.";
  if (raw.includes("refund_settlement_failed")) return "Result saved, but refund settlement needs support.";
  if (raw.includes("server_error") || raw.includes("fetch failed")) return "The website service is temporarily unavailable.";
  return raw.replace(/^.*?:\s*/, "").slice(0, 180);
}

function enqueue(chat, job) {
  const previous = chatQueues.get(chat) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(job);
  chatQueues.set(chat, current);
  current.finally(() => { if (chatQueues.get(chat) === current) chatQueues.delete(chat); });
  return current;
}

async function showAccount(chat, from) {
  const { account } = await api("session", from);
  const handle = account.username ? `@${account.username}` : esc(from.first_name || "User");
  const tgId = from.id;
  const gateName = account.gate || account.default_gate;
  const isBanned = Boolean(account.blocked);

  const lines = [
    `━━━━━━━━━━━━━━━━━━━`,
    `👤 <b>USER PROFILE</b>`,
    `━━━━━━━━━━━━━━━━━━━`,
    `<b>Username:</b> ${handle}`,
    `<b>User ID:</b> <code>${tgId}</code>`,
    `<b>Status:</b> ${isBanned ? "🔴 Banned" : "🟢 Active Member"}`,
    ``,
    `💰 <b>WALLET DETAILS</b>`,
    `┌ <b>Balance:</b> <code>${money(account.balance)}</code>`,
    `├ <b>Bonus Balance:</b> <code>${money(account.bonus_balance)}</code>`,
    `└ <b>Total Available:</b> <code>${money((account.balance || 0) + (account.bonus_balance || 0))}</code>`,
    ``,
    `⚙️ <b>CHECKER CONFIG</b>`,
    `┌ <b>Active Gate:</b> <code>${esc(gateName)}</code>`,
    `└ <b>Rate:</b> <code>${money(account.price_per_card)}</code> / card`,
    ``,
    `🤝 <b>AFFILIATE & REWARDS</b>`,
    `┌ <b>Invited:</b> <b>${account.referral_count}</b> users`,
    `└ <b>Earned:</b> <code>${money(account.referral_earned)}</code>`,
    `━━━━━━━━━━━━━━━━━━━`,
  ];

  if (isBanned) {
    lines.push("", "⚠️ <i>Your account is currently suspended. Please contact support.</i>");
  }

  await menu(chat, lines.join("\n"));
}

async function startDeposit(chat) {
  pendingAction.set(chat, "deposit");
  const s = await getSettings();
  await send(chat, [
    `━━━━━━━━━━━━━━━━━━━`,
    `💎 <b>RECHARGE BALANCE (LTC)</b>`,
    `━━━━━━━━━━━━━━━━━━━`,
    `Please type the amount in USD you want to deposit into your account:`,
    ``,
    `💡 <i>Examples:</i> <code>10</code>, <code>25</code>, <code>50</code>, <code>100</code>`,
    ``,
    `⚡ <b>Payment Method:</b> Litecoin (LTC)`,
    `💵 <b>Minimum Recharge:</b> <code>$${s.min_deposit || 5}</code>`,
    `━━━━━━━━━━━━━━━━━━━`,
  ].join("\n"), {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "$10", callback_data: "recharge:10" },
          { text: "$25", callback_data: "recharge:25" },
          { text: "$50", callback_data: "recharge:50" },
          { text: "$100", callback_data: "recharge:100" },
        ],
        [{ text: "🔙 Cancel", callback_data: "balance" }],
      ],
    },
  });
}

async function createDeposit(chat, from, amount) {
  const d = await api("deposit", from, { amount });
  const expiresMs = Number(d.expires_ms || Date.now() + 25 * 60 * 1000);

  const msgText = buildDepositCard(d, expiresMs);
  const msg = await send(chat, msgText, { reply_markup: depositButtons(d.deposit_id) });

  // Store state for timer and status check
  pendingDeposits.set(chat, {
    messageId: msg.message_id,
    depositId: d.deposit_id,
    expiresMs,
    credit: d.credit,
    fee: d.fee,
    charged: d.charged,
    crypto_amount: d.crypto_amount,
    wallet_address: d.wallet_address,
    invoice_url: d.invoice_url,
    timerId: null,
  });

  startDepositTimer(chat, msg.message_id, d.deposit_id, expiresMs);
}

async function checkDepositStatus(chat, from, depositId) {
  try {
    const d = await api("deposit_status", from, { deposit_id: depositId });
    const status = String(d.deposit_status || "unknown");
    const statusEmoji = { approved: "✅", pending: "⏳", rejected: "❌", expired: "⏰" }[status] || "❓";
    await menu(chat, [
      `${statusEmoji} <b>Deposit status: ${status.toUpperCase()}</b>`,
      ``,
      `Amount: <b>${money(d.amount)}</b>`,
      d.charged_amount ? `Charged: <b>${money(d.charged_amount)}</b>` : "",
      d.crypto_amount ? `Crypto: <code>${esc(d.crypto_amount)} LTC</code>` : "",
      status === "approved" ? `\n🎉 Your balance has been updated!` : "",
      status === "pending" ? `\n⏳ Still waiting for payment confirmation.` : "",
    ].filter(Boolean).join("\n"));
    if (status === "approved" || status === "rejected" || status === "expired") {
      clearDepositTimer(chat);
      pendingDeposits.delete(chat);
    }
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
      `Invite friends or customers to our platform and earn automatic cash bonuses directly to your balance!`,
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
    await menu(chat, "🚫 <b>Checker is currently disabled by admin.</b>\n\nPlease check back later.");
    return;
  }
  if (!cards.length) {
    await send(chat, "❌ No valid cards found. Format: <code>PAN|MM|YYYY|CVV</code>");
    return;
  }
  let task;
  try {
    task = await api("check", from, { cards });
  } catch (e) {
    const msg = String(e.message || "");
    if (msg.includes("insufficient_balance")) {
      await menu(chat, "❌ <b>Insufficient Balance</b>\nPlease recharge your balance first using 💎 Recharge.");
      return;
    }
    await menu(chat, `❌ ${esc(msg)}`);
    return;
  }

  const status = await send(
    chat,
    [
      `⏳ <b>Checking Started...</b>`,
      `Cards: <b>${task.total}</b>`,
      `Gate: <code>${esc(task.gate)}</code>`,
      `Charged: <b>${money(task.cost)}</b>`,
    ].join("\n"),
  );

  void pollCheck(chat, from, task, status).catch(async (error) => {
    console.error("check polling error", error);
    await menu(chat, `⚠️ ${esc(friendlyError(error))}`).catch(() => {});
  });
}

async function pollCheck(chat, from, task, status) {
  const started = Date.now();
  let last = "";
  while (Date.now() - started < 20 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 4000));
    let res;
    try { res = await api("result", from, { task_id: task.task_id }); } catch { continue; }
    const line = `⏳ <b>Checking:</b> ${res.answered}/${res.total} | 🟢 <b>${res.live} Live</b> | 🔴 <b>${res.dead} Dead</b>`;
    if (line !== last && status) {
      last = line;
      await tg("editMessageText", { chat_id: chat, message_id: status.message_id, text: line, parse_mode: "HTML" }).catch(() => {});
    }
    if (res.done) { await sendResults(chat, task, res); return; }
  }
  await menu(chat, "⚠️ Task took longer than expected — use 📊 Statistics to fetch the result.");
}

async function sendResults(chat, task, res) {
  const lives = res.rows.filter((r) => r.status === "live");
  const summary = [
    `━━━━━━━━━━━━━━━━━━━`,
    `✅ <b>CHECK COMPLETED</b>`,
    `━━━━━━━━━━━━━━━━━━━`,
    `📊 <b>Results:</b>`,
    `┌ Total: <b>${res.total}</b>`,
    `├ 🟢 Live: <b>${res.live}</b>`,
    `├ 🔴 Dead: <b>${res.dead}</b>`,
    res.refunded > 0 ? `└ 💸 Refunded: <b>${money(res.refunded)}</b>` : `└ Unresolved: <b>${res.total - res.live - res.dead}</b>`,
    ``,
    `🟢 <b>LIVE CARDS:</b>`,
    lives.length
      ? lives.slice(0, 20).map((r) => `✅ <code>${esc(r.card)}</code> — <i>${esc(r.category || "Approved")}</i>`).join("\n")
      : "<i>No live cards in this batch.</i>",
    `━━━━━━━━━━━━━━━━━━━`,
  ].join("\n");
  await menu(chat, summary);

  const body = res.rows.map((r) => `${r.status.toUpperCase()} | ${r.card} | ${r.category} | ${r.msg}`).join("\n");
  const form = new FormData();
  form.append("chat_id", String(chat));
  form.append("document", new Blob([body], { type: "text/plain" }), `${task.task_id}.txt`);
  await fetch(`${API}/sendDocument`, { method: "POST", body: form }).catch(() => {});
}

async function showTasks(chat, from) {
  const t = await api("tasks", from);
  if (!t.tasks.length) {
    await menu(chat, "📊 <b>Statistics & History</b>\n\nNo check tasks performed yet.");
    return;
  }
  const lines = [
    `━━━━━━━━━━━━━━━━━━━`,
    `📊 <b>CHECK STATISTICS & RECENT RUNS</b>`,
    `━━━━━━━━━━━━━━━━━━━`,
    ...t.tasks.map(
      (x) =>
        `• <code>${esc(x.task_id)}</code>\n  └ <b>${x.total}</b> cards | Gate: <code>${esc(x.gate)}</code> | ${x.status === "finished" ? "🟢 Done" : "⏳ " + x.status} | ${money(x.cost)}`,
    ),
    ``,
    `🔍 <i>Fetch details of any task:</i>`,
    `<code>/task &lt;id&gt;</code>`,
    `━━━━━━━━━━━━━━━━━━━`,
  ];
  await menu(chat, lines.join("\n"));
}

async function showApi(chat, from) {
  const { account } = await api("session", from);
  const webOrigin = settingsCache.bot_website_url || BASE;

  if (account.api_key?.active) {
    await menu(chat, [
      `━━━━━━━━━━━━━━━━━━━`,
      `🔑 <b>REST API ACCESS (ACTIVE)</b>`,
      `━━━━━━━━━━━━━━━━━━━`,
      `<b>Status:</b> 🟢 Active & Ready`,
      `<b>Key Prefix:</b> <code>${esc(account.api_key.prefix)}…</code>`,
      ``,
      `📡 <b>API Endpoints:</b>`,
      `• <b>Check Cards:</b>`,
      `  <code>POST ${webOrigin}/api/public/checker/check</code>`,
      `• <b>Check Status / Result:</b>`,
      `  <code>POST ${webOrigin}/api/public/checker/result</code>`,
      `• <b>Balance & Limits:</b>`,
      `  <code>GET  ${webOrigin}/api/public/checker/balance</code>`,
      ``,
      `🛡 <b>Authentication:</b>`,
      `Pass your secret API key in the header:`,
      `<code>x-api-key: YOUR_API_KEY</code>`,
      ``,
      `📖 <i>Tip: For documentation, open the website API section.</i>`,
      `━━━━━━━━━━━━━━━━━━━`,
    ].join("\n"));
    return;
  }

  await send(
    chat,
    [
      `━━━━━━━━━━━━━━━━━━━`,
      `🔑 <b>DEVELOPER API ACCESS</b>`,
      `━━━━━━━━━━━━━━━━━━━`,
      `Integrate our high-speed CCV & CCN checker directly into your own tools, scripts, or custom bots.`,
      ``,
      `⚡ <b>Features:</b>`,
      `• Real-time CCV & CCN auth check results`,
      `• High concurrency & minimal latency`,
      `• JSON response with card bins & status`,
      `• Auto-refund for unresolved checks`,
      ``,
      `💳 <b>Lifetime Setup Fee:</b> <code>${money(account.api_fee)}</code>`,
      `<i>Charged once from your bot balance. Your key will be generated immediately.</i>`,
      `━━━━━━━━━━━━━━━━━━━`,
    ].join("\n"),
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: `🔑 Purchase API Key (${money(account.api_fee)})`, callback_data: "buyapi" }],
          [{ text: "🔙 Main Menu", callback_data: "balance" }],
        ],
      },
    },
  );
}

async function buyApi(chat, from) {
  try {
    const r = await api("apikey", from);
    await menu(
      chat,
      [
        `━━━━━━━━━━━━━━━━━━━`,
        `✅ <b>API ACCESS ACTIVATED!</b>`,
        `━━━━━━━━━━━━━━━━━━━`,
        `Your secret API Key has been generated:`,
        ``,
        `<code>${esc(r.key)}</code>`,
        ``,
        `⚠️ <b>IMPORTANT:</b> Copy and save this key safely now! It will <b>not</b> be shown again for security.`,
        `━━━━━━━━━━━━━━━━━━━`,
      ].join("\n"),
    );
  } catch (e) {
    const msg = String(e.message || "");
    if (msg.includes("insufficient_balance")) await menu(chat, "❌ <b>Insufficient Balance</b>\nPlease recharge your balance first using 💎 Recharge.");
    else if (msg.includes("api_already_active")) await menu(chat, "ℹ️ You already have an active API key.");
    else await menu(chat, `❌ ${esc(msg)}`);
  }
}

/* ------------------------------------------------------------------ */
/* Update routing                                                      */
/* ------------------------------------------------------------------ */

async function handleMessage(msg) {
  const chat = msg.chat.id;
  const from = msg.from;
  const text = (msg.text || msg.caption || "").trim();

  // Maintenance mode check
  const settings = await getSettings();
  if (settings.bot_maintenance) {
    await send(chat, `🔧 <b>Maintenance</b>\n\n${esc(settings.bot_maintenance_msg)}`);
    return;
  }

  if (msg.document) {
    if (Number(msg.document.file_size ?? 0) > 1024 * 1024) {
      await menu(chat, "The file is too large. Upload a text file under 1 MB (max 500 cards).");
      return;
    }
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
        await api("session", from, ref);
        const name = esc(from.first_name || from.username || "Member");
        await menu(
          chat,
          [
            `━━━━━━━━━━━━━━━━━━━`,
            `👋 <b>WELCOME TO ZORU CHECKER, ${name.toUpperCase()}!</b>`,
            `━━━━━━━━━━━━━━━━━━━`,
            `Your Telegram profile is <b>automatically synced</b> with our website platform with instant zero-fee LTC funding.`,
            ``,
            `🚀 <b>What you can do:</b>`,
            `┌ 💳 <b>Check Card:</b> Real-time fast CCV/CCN validation`,
            `├ 💎 <b>Recharge:</b> Instant automated LTC deposit`,
            `├ ⚡ <b>Gateways:</b> 7 Auth gates (Amazon, DoorDash, Braintree)`,
            `├ 💰 <b>Affiliate:</b> Earn bonuses per referred user`,
            `└ 🔑 <b>API Info:</b> Developer access & endpoints`,
            ``,
            `👇 <i>Select an option from the menu below:</i>`,
            `━━━━━━━━━━━━━━━━━━━`,
          ].join("\n"),
        );
        return;
      }
      case "/menu":
      case "/profile":
      case "/balance":
        await showAccount(chat, from);
        return;
      case "/deposit":
        if (args[0] && Number(args[0]) > 0) await createDeposit(chat, from, Number(args[0]));
        else await startDeposit(chat);
        return;
      case "/check":
        if (args.length) await runCheck(chat, from, extractCards(args.join("\n")));
        else await startCheck(chat);
        return;
      case "/gate":
        if (args[0]) {
          await api("setgate", from, { gate: args[0] });
          await menu(chat, `⚡ Gate set to <code>${esc(args[0])}</code>`);
        } else await showGates(chat, from);
        return;
      case "/refer":
        await showReferrals(chat, from);
        return;
      case "/api":
        await showApi(chat, from);
        return;
      case "/tasks":
        await showTasks(chat, from);
        return;
      case "/task": {
        if (!args[0]) { await send(chat, "Usage: <code>/task &lt;id&gt;</code>"); return; }
        const res = await api("result", from, { task_id: args[0] });
        await sendResults(chat, { task_id: args[0] }, res);
        return;
      }
      case "/status": {
        const d = pendingDeposits.get(chat);
        if (!d) { await menu(chat, "No active deposit found. Use 📥 Deposit to create one."); return; }
        await checkDepositStatus(chat, from, d.depositId);
        return;
      }
      case "/help":
      default:
        await menu(
          chat,
          [
            `━━━━━━━━━━━━━━━━━━━`,
            `📖 <b>BOT COMMANDS</b>`,
            `━━━━━━━━━━━━━━━━━━━`,
            `• /balance — 👤 User profile & wallet balance`,
            `• /deposit [amount] — 💎 Recharge funds via LTC`,
            `• /check — 💳 Check cards (single/bulk or file)`,
            `• /gate — ⚡ Select checker gateway`,
            `• /refer — 💰 Earn credit & referral code`,
            `• /api — 🔑 REST API documentation & key`,
            `• /tasks — 📊 Recent check tasks & stats`,
            `• /status — 🔍 Check active deposit invoice`,
            `• /menu — 📱 Main interactive menu`,
            `━━━━━━━━━━━━━━━━━━━`,
          ].join("\n"),
        );
        return;
    }
  }

  const waiting = pendingAction.get(chat);
  if (waiting === "deposit") {
    const amount = Number(text.replace(/[^0-9.]/g, ""));
    pendingAction.delete(chat);
    if (!Number.isFinite(amount) || amount < 1) {
      await menu(chat, "Enter a valid amount, for example <code>50</code>.");
      return;
    }
    await createDeposit(chat, from, amount);
    return;
  }

  const cards = extractCards(text);
  if (cards.length) { pendingAction.delete(chat); await runCheck(chat, from, cards); return; }

  await showAccount(chat, from);
}

async function handleCallback(q) {
  const chat = q.message.chat.id;
  const from = q.from;
  await tg("answerCallbackQuery", { callback_query_id: q.id });
  const data = q.data || "";

  // Maintenance check
  const settings = await getSettings();
  if (settings.bot_maintenance && data !== "balance") {
    await send(chat, `🔧 <b>Maintenance</b>\n\n${esc(settings.bot_maintenance_msg)}`);
    return;
  }

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
    case "gates": return showGates(chat, from);
    case "refer": return showReferrals(chat, from);
    case "api": return showApi(chat, from);
    case "buyapi": return buyApi(chat, from);
    case "tasks": return showTasks(chat, from);
    default: return showAccount(chat, from);
  }
}

/* ------------------------------------------------------------------ */
/* Long polling                                                         */
/* ------------------------------------------------------------------ */

async function main() {
  const identity = await tg("getMe", {});
  if (!identity?.id || !identity?.username) {
    throw new Error("Telegram token validation returned an incomplete bot identity");
  }
  await tg("deleteWebhook", { drop_pending_updates: false });
  await tg("setMyCommands", {
    commands: [
      { command: "menu", description: "📱 Main interactive menu" },
      { command: "balance", description: "👤 Profile & balance" },
      { command: "deposit", description: "💎 Recharge balance (LTC)" },
      { command: "check", description: "💳 Check cards (single/bulk)" },
      { command: "gate", description: "⚡ Select checking gate" },
      { command: "refer", description: "💰 Referral program & earn" },
      { command: "api", description: "🔑 REST API documentation" },
      { command: "tasks", description: "📊 Check statistics & history" },
      { command: "status", description: "🔍 Check active deposit invoice" },
      { command: "help", description: "📖 Commands list" },
    ],
  });
  console.log(`Zoru bot authenticated as @${identity.username}`);
  console.log(`Zoru website API base: ${BASE}`);
  console.log(`Zoru website bridge: ${BASE}/api/public/bot/<action>`);

  // Warm up settings cache
  await refreshSettings().catch(() => {});

  let offset = 0;
  let consecutivePollFailures = 0;
  for (;;) {
    try {
      const updates = await tg(
        "getUpdates",
        { offset, timeout: TELEGRAM_POLL_TIMEOUT_SECONDS, allowed_updates: ["message", "callback_query"] },
        TELEGRAM_POLL_REQUEST_TIMEOUT_MS,
      );
      if (consecutivePollFailures > 0) console.log("Telegram polling connection restored");
      consecutivePollFailures = 0;
      for (const u of updates ?? []) {
        offset = u.update_id + 1;
        const chat = u.message?.chat?.id ?? u.callback_query?.message?.chat?.id;
        if (chat) {
          enqueue(chat, () => (u.message ? handleMessage(u.message) : handleCallback(u.callback_query))).catch(async (e) => {
            console.error("handler error", e);
            await menu(chat, `⚠️ ${esc(friendlyError(e))}`).catch(() => {});
          });
        }
      }
    } catch (e) {
      consecutivePollFailures += 1;
      const detail = String(e instanceof Error ? e.message : e || "unknown error");
      const cause = e instanceof Error && e.cause && typeof e.cause === "object" ? e.cause : null;
      const code = cause && "code" in cause ? String(cause.code) : "";
      const transient =
        detail.includes("fetch failed") ||
        detail.includes("timed out") ||
        detail.includes("aborted") ||
        ["ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "ENETUNREACH"].includes(code);
      if (consecutivePollFailures === 1 || consecutivePollFailures % 10 === 0) {
        console.warn(
          transient
            ? `Telegram polling temporarily unavailable (${code || detail}); retrying`
            : `Telegram polling failed: ${detail}`,
        );
      }
      const delay = Math.min(30_000, 2_000 * consecutivePollFailures);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
