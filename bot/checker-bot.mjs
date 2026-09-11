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

/* ── Premium MENU ── */
const MENU = {
  inline_keyboard: [
    [
      { text: "💎 Balance & Profile", callback_data: "balance" },
      { text: "📥 Deposit", callback_data: "deposit" },
    ],
    [
      { text: "🃏 Check Cards", callback_data: "check" },
      { text: "⚡ Gate", callback_data: "gates" },
    ],
    [
      { text: "👥 Referrals", callback_data: "refer" },
      { text: "🔑 API Access", callback_data: "api" },
    ],
    [
      { text: "📋 My Tasks", callback_data: "tasks" },
      { text: "🌐 Website", url: BASE },
    ],
  ],
};

const send = (chat, text, extra = {}) =>
  tg("sendMessage", { chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });

const edit = (chat, msgId, text, extra = {}) =>
  tg("editMessageText", { chat_id: chat, message_id: msgId, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra }).catch(() => {});

const menu = async (chat, text) => {
  const notice = await getBotNotice();
  const fullText = notice ? `${text}\n\n<i>${esc(notice)}</i>` : text;
  return send(chat, fullText, { reply_markup: MENU });
};

/* ------------------------------------------------------------------ */
/* Bot settings cache (refreshed every 5 min)                         */
/* ------------------------------------------------------------------ */

let settingsCache = { bot_maintenance: false, bot_maintenance_msg: "", bot_notice: "", checker_enabled: true };
let settingsCachedAt = 0;

async function refreshSettings() {
  try {
    const d = await api("bot_settings", { id: 0, username: null, first_name: null }, {});
    settingsCache = {
      bot_maintenance: Boolean(d.bot_maintenance),
      bot_maintenance_msg: String(d.bot_maintenance_msg || "🔧 Under maintenance. Please check back shortly."),
      bot_notice: String(d.bot_notice || ""),
      checker_enabled: Boolean(d.checker_enabled !== false),
    };
  } catch { /* keep previous */ }
  settingsCachedAt = Date.now();
}

async function getSettings() {
  if (Date.now() - settingsCachedAt > 5 * 60 * 1000) await refreshSettings();
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
    `💳 <b>Deposit Invoice</b>`,
    ``,
    `💵 You will receive: <b>${money(d.credit)}</b>`,
    d.fee > 0 ? `💸 Fee: ${money(d.fee)} · Total charged: <b>${money(d.charged)}</b>` : `💵 Amount: <b>${money(d.charged)}</b>`,
    ``,
    `🔗 Send exactly:`,
    `<code>${esc(d.crypto_amount)} LTC</code>`,
    ``,
    `📬 To wallet address:`,
    `<code>${esc(d.wallet_address)}</code>`,
    ``,
    formatCountdown(expiresMs),
    ``,
    d.invoice_url ? `<a href="${esc(d.invoice_url)}">🌐 Open payment page</a>` : ``,
    ``,
    `✅ Balance is credited <b>automatically</b> once confirmed.`,
  ].filter((l) => l !== undefined).join("\n");
}

function depositButtons(depositId) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Check payment status", callback_data: `dep_status:${depositId}` },
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
  const lines = [
    `<b>👤 ${esc(account.username || from.first_name || "user")}</b>`,
    ``,
    `💎 Balance: <b>${money(account.balance)}</b>`,
    `🎁 Bonus: <b>${money(account.bonus_balance)}</b>`,
    `🃏 Price per check: <b>${money(account.price_per_card)}</b>`,
    `⚡ Gate: <code>${esc(account.gate || account.default_gate)}</code>`,
    `👥 Referrals: <b>${account.referral_count}</b> · earned <b>${money(account.referral_earned)}</b>`,
    `🔑 API: ${account.api_key?.active ? `active (<code>${esc(account.api_key.prefix)}…</code>)` : `not active — ${money(account.api_fee)}`}`,
  ];
  if (account.blocked) lines.push("", "🚫 <b>This account is banned.</b>");
  await menu(chat, lines.join("\n"));
}

async function startDeposit(chat) {
  pendingAction.set(chat, "deposit");
  await send(chat, [
    `📥 <b>Add funds</b>`,
    ``,
    `Send the amount in USD you want to deposit.`,
    `Example: <code>50</code>`,
    ``,
    `Minimum: $5 · Payment method: <b>LTC (Litecoin)</b>`,
  ].join("\n"));
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
  const link = `${BASE}/auth?ref=${account.referral_code || ""}`;
  await menu(
    chat,
    [
      `<b>👥 Referral program</b>`,
      ``,
      `Your code: <code>${esc(account.referral_code || "-")}</code>`,
      `Your link: ${esc(link)}`,
      ``,
      `You earn <b>${money(account.referral_bonus)}</b> for every referred user who makes a successful deposit (paid once per user).`,
      `Referrals: <b>${account.referral_count}</b> · Earned: <b>${money(account.referral_earned)}</b>`,
    ].join("\n"),
  );
}

async function showGates(chat, from) {
  const g = await api("gates", from);
  const rows = g.gates.slice(0, 20).map((gate) => [{ text: `⚡ ${gate.id}`, callback_data: `gate:${gate.id}` }]);
  await send(chat, `⚡ Current gate: <code>${esc(g.selected)}</code>\nPick a gate:`, {
    reply_markup: { inline_keyboard: rows.length ? rows : MENU.inline_keyboard },
  });
}

async function startCheck(chat) {
  pendingAction.set(chat, "check");
  await send(
    chat,
    [
      "🃏 <b>Send cards to check</b>",
      "",
      "Single card or bulk — one per line, or upload a <code>.txt</code> file (max 500).",
      "Format: <code>PAN|MM|YYYY|CVV</code>",
      "",
      "Example: <code>4111111111111111|12|2028|123</code>",
    ].join("\n"),
  );
}

async function runCheck(chat, from, cards) {
  const settings = await getSettings();
  if (!settings.checker_enabled) {
    await menu(chat, "🚫 <b>Checker is currently disabled.</b>\n\nPlease check back later.");
    return;
  }
  if (!cards.length) {
    await send(chat, "No valid cards found. Format: <code>PAN|MM|YYYY|CVV</code>");
    return;
  }
  let task;
  try {
    task = await api("check", from, { cards });
  } catch (e) {
    const msg = String(e.message || "");
    if (msg.includes("insufficient_balance")) {
      await menu(chat, "❌ Not enough balance. Use 📥 Deposit to top up.");
      return;
    }
    await menu(chat, `❌ ${esc(msg)}`);
    return;
  }

  const status = await send(
    chat,
    `⏳ Checking <b>${task.total}</b> card(s) on <code>${esc(task.gate)}</code>\nCharged: <b>${money(task.cost)}</b>`,
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
    const line = `⏳ ${res.answered}/${res.total} done · ✅ ${res.live} live · ❌ ${res.dead} dead`;
    if (line !== last && status) {
      last = line;
      await tg("editMessageText", { chat_id: chat, message_id: status.message_id, text: line, parse_mode: "HTML" }).catch(() => {});
    }
    if (res.done) { await sendResults(chat, task, res); return; }
  }
  await menu(chat, "Task is taking too long — use 📋 My tasks to fetch the result later.");
}

async function sendResults(chat, task, res) {
  const lives = res.rows.filter((r) => r.status === "live");
  const summary = [
    `<b>✅ Check finished</b>`,
    ``,
    `Total: <b>${res.total}</b> · Live: <b>${res.live}</b> · Dead: <b>${res.dead}</b>`,
    res.refunded > 0 ? `Refunded (no answer): <b>${money(res.refunded)}</b>` : "",
    ``,
    lives.length
      ? lives.slice(0, 20).map((r) => `✅ <code>${esc(r.card)}</code> — ${esc(r.category)}`).join("\n")
      : "No live cards.",
  ]
    .filter(Boolean)
    .join("\n");
  await menu(chat, summary);

  const body = res.rows.map((r) => `${r.status.toUpperCase()} | ${r.card} | ${r.category} | ${r.msg}`).join("\n");
  const form = new FormData();
  form.append("chat_id", String(chat));
  form.append("document", new Blob([body], { type: "text/plain" }), `${task.task_id}.txt`);
  await fetch(`${API}/sendDocument`, { method: "POST", body: form }).catch(() => {});
}

async function showTasks(chat, from) {
  const t = await api("tasks", from);
  if (!t.tasks.length) { await menu(chat, "No checks yet."); return; }
  await menu(
    chat,
    [
      "<b>📋 Recent checks</b>",
      "",
      ...t.tasks.map((x) => `<code>${esc(x.task_id)}</code> · ${x.total} cards · ${x.status} · ${money(x.cost)}`),
      "",
      "Fetch one with <code>/task &lt;id&gt;</code>",
    ].join("\n"),
  );
}

async function showApi(chat, from) {
  const { account } = await api("session", from);
  if (account.api_key?.active) {
    await menu(chat, [
      "<b>🔑 API access — active</b>",
      "",
      `Key prefix: <code>${esc(account.api_key.prefix)}…</code>`,
      "",
      "Endpoints:",
      `<code>POST ${BASE}/api/public/checker/check</code>`,
      `<code>POST ${BASE}/api/public/checker/result</code>`,
      `<code>GET  ${BASE}/api/public/checker/balance</code>`,
      "",
      "Send your key in the <code>x-api-key</code> header.",
    ].join("\n"));
    return;
  }
  await send(
    chat,
    [
      "<b>🔑 API access</b>",
      "",
      `One-time fee: <b>${money(account.api_fee)}</b> — same as the website.`,
      "It is charged from your balance and the key is shown once.",
    ].join("\n"),
    { reply_markup: { inline_keyboard: [[{ text: `🔑 Buy API access (${money(account.api_fee)})`, callback_data: "buyapi" }]] } },
  );
}

async function buyApi(chat, from) {
  try {
    const r = await api("apikey", from);
    await menu(chat, `✅ API access active.\n\nYour key (shown once):\n<code>${esc(r.key)}</code>`);
  } catch (e) {
    const msg = String(e.message || "");
    if (msg.includes("insufficient_balance")) await menu(chat, "❌ Not enough balance for API access.");
    else if (msg.includes("api_already_active")) await menu(chat, "You already have an active API key.");
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
        await menu(
          chat,
          [
            `<b>🎉 Welcome to Zoru Checker Bot!</b>`,
            ``,
            `Your account is <b>instantly linked</b> to the website — same balance, same history.`,
            ``,
            `<b>What you can do here:</b>`,
            `💎 Check your balance &amp; profile`,
            `📥 Deposit LTC to add funds`,
            `🃏 Check cards (single or bulk up to 500)`,
            `⚡ Choose your checking gate`,
            `👥 Earn from the referral program`,
            `🔑 Purchase API access`,
            ``,
            `Use the buttons below to get started 👇`,
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
            "<b>📖 Commands</b>",
            "",
            "/balance — 💎 Profile &amp; balance",
            "/deposit [amount] — 📥 Add funds with LTC",
            "/check — 🃏 Check one card or bulk (or send a .txt)",
            "/gate — ⚡ Pick a checking gate",
            "/refer — 👥 Referral link &amp; earnings",
            "/api — 🔑 API access",
            "/tasks — 📋 Recent checks",
            "/status — 🔍 Active deposit status",
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
      { command: "menu", description: "Main menu" },
      { command: "balance", description: "💎 Profile & balance" },
      { command: "deposit", description: "📥 Add funds (LTC)" },
      { command: "check", description: "🃏 Check cards" },
      { command: "gate", description: "⚡ Choose gate" },
      { command: "refer", description: "👥 Referral program" },
      { command: "api", description: "🔑 API access" },
      { command: "tasks", description: "📋 Recent checks" },
      { command: "status", description: "🔍 Active deposit status" },
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
