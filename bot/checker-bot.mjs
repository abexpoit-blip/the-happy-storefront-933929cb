#!/usr/bin/env node
/**
 * Zoru Telegram bot — fully connected to the website backend.
 *
 * Every Telegram user automatically gets a real website account on /start.
 * Balance, deposits (Plisio), referrals, single + bulk checking and $100 API
 * access all run through the site's own API, so the rules are identical
 * everywhere and the admin panel manages bot users like any other user.
 *
 * Env (loaded by selfhost/bot-start.sh from /etc/zoru/telegram.env):
 *   TELEGRAM_BOT_TOKEN   bot token from @BotFather
 *   BOT_API_BASE         site base url, default https://zoru.cc
 *   BOT_ADMIN_SECRET     shared secret, must match the site's .env
 */

const TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const BASE = (process.env.BOT_API_BASE || process.env.API_BASE || "https://zoru.cc")
  .trim()
  .replace(/\/+$/, "");
const SECRET = (process.env.BOT_ADMIN_SECRET || process.env.TELEGRAM_BOT_ADMIN_SECRET || "").trim();

if (!TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN is missing");
  process.exit(1);
}
if (!SECRET) {
  console.error("BOT_ADMIN_SECRET is missing (must match the website .env)");
  process.exit(1);
}

const API = `https://api.telegram.org/bot${TOKEN}`;
const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]);

/* ------------------------------------------------------------------ */
/* Telegram helpers                                                    */
/* ------------------------------------------------------------------ */

async function tg(method, payload) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    const description = data.description || `HTTP ${res.status}`;
    throw new Error(`Telegram ${method} failed: ${description}`);
  }
  return data.result;
}

const MENU = {
  inline_keyboard: [
    [
      { text: "💰 Balance", callback_data: "balance" },
      { text: "➕ Deposit", callback_data: "deposit" },
    ],
    [
      { text: "🧪 Check cards", callback_data: "check" },
      { text: "⚙️ Gate", callback_data: "gates" },
    ],
    [
      { text: "👥 Referrals", callback_data: "refer" },
      { text: "🔑 API access", callback_data: "api" },
    ],
    [{ text: "📜 My tasks", callback_data: "tasks" }],
  ],
};

const send = (chat, text, extra = {}) =>
  tg("sendMessage", { chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });

const menu = (chat, text) => send(chat, text, { reply_markup: MENU });

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
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`server_error_${res.status}`);
  }
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
/* Feature handlers                                                    */
/* ------------------------------------------------------------------ */

const pendingAction = new Map(); // chat id -> "deposit" | "check"
const chatQueues = new Map(); // serialize updates from the same chat

function friendlyError(error) {
  const raw = String(error instanceof Error ? error.message : error || "server_error");
  if (raw.includes("unauthorized")) return "Bot authorization failed. Please contact support.";
  if (raw.includes("account_banned")) return "This account is banned.";
  if (raw.includes("insufficient_balance")) return "Not enough balance. Use ➕ Deposit to top up.";
  if (raw.includes("invalid_gate")) return "That checking gate is not available.";
  if (raw.includes("deposit_already_pending")) return "You already have a pending deposit. Open Deposit history before creating another.";
  if (raw.includes("checker_not_configured")) return "The checker service is temporarily unavailable.";
  if (raw.includes("refund_settlement_failed")) return "Result saved, but refund settlement needs support.";
  if (raw.includes("server_error") || raw.includes("fetch failed")) return "The website service is temporarily unavailable.";
  return raw.replace(/^.*?:\s*/, "").slice(0, 180);
}

function enqueue(chat, job) {
  const previous = chatQueues.get(chat) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(job);
  chatQueues.set(chat, current);
  current.finally(() => {
    if (chatQueues.get(chat) === current) chatQueues.delete(chat);
  });
  return current;
}

async function showAccount(chat, from) {
  const { account } = await api("session", from);
  const lines = [
    `<b>👤 ${esc(account.username || from.first_name || "user")}</b>`,
    ``,
    `💰 Balance: <b>${money(account.balance)}</b>`,
    `🎁 Bonus: <b>${money(account.bonus_balance)}</b>`,
    `🧪 Price per check: <b>${money(account.price_per_card)}</b>`,
    `⚙️ Gate: <code>${esc(account.gate || account.default_gate)}</code>`,
    `👥 Referrals: <b>${account.referral_count}</b> · earned <b>${money(account.referral_earned)}</b>`,
    `🔑 API: ${account.api_key?.active ? `active (<code>${esc(account.api_key.prefix)}…</code>)` : `not active — ${money(account.api_fee)}`}`,
  ];
  if (account.blocked) lines.push("", "🚫 <b>This account is banned.</b>");
  await menu(chat, lines.join("\n"));
}

async function startDeposit(chat) {
  pendingAction.set(chat, "deposit");
  await send(chat, "💵 Send the amount in USD you want to add (example: <code>50</code>).");
}

async function createDeposit(chat, from, amount) {
  const d = await api("deposit", from, { amount });
  await send(
    chat,
    [
      `<b>Deposit created</b>`,
      ``,
      `Credited on payment: <b>${money(d.credit)}</b>`,
      `Fee: ${money(d.fee)} · You pay: <b>${money(d.charged)}</b>`,
      `Send exactly <b>${esc(d.crypto_amount)} LTC</b> to:`,
      `<code>${esc(d.wallet_address)}</code>`,
      ``,
      d.invoice_url ? `Pay page: ${esc(d.invoice_url)}` : "",
      `Balance is credited automatically once the payment confirms.`,
    ]
      .filter(Boolean)
      .join("\n"),
    { reply_markup: MENU },
  );
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
  const rows = g.gates.slice(0, 20).map((gate) => [{ text: gate.id, callback_data: `gate:${gate.id}` }]);
  await send(chat, `⚙️ Current gate: <code>${esc(g.selected)}</code>\nPick a gate:`, {
    reply_markup: { inline_keyboard: rows.length ? rows : MENU.inline_keyboard },
  });
}

async function startCheck(chat) {
  pendingAction.set(chat, "check");
  await send(
    chat,
    [
      "🧪 <b>Send cards to check</b>",
      "",
      "Single card or bulk — one per line, or upload a <code>.txt</code> file (max 500).",
      "Format: <code>PAN|MM|YYYY|CVV</code>",
    ].join("\n"),
  );
}

async function runCheck(chat, from, cards) {
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
      await menu(chat, "❌ Not enough balance. Use ➕ Deposit to top up.");
      return;
    }
    await menu(chat, `❌ ${esc(msg)}`);
    return;
  }

  const status = await send(
    chat,
    `⏳ Checking <b>${task.total}</b> card(s) on <code>${esc(task.gate)}</code>\nCharged: <b>${money(task.cost)}</b>`,
  );

  // Poll in the background so this chat can still use balance/menu commands.
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
    try {
      res = await api("result", from, { task_id: task.task_id });
    } catch {
      continue;
    }
    const line = `⏳ ${res.answered}/${res.total} done · ✅ ${res.live} live · ❌ ${res.dead} dead`;
    if (line !== last && status) {
      last = line;
      await tg("editMessageText", {
        chat_id: chat,
        message_id: status.message_id,
        text: line,
        parse_mode: "HTML",
      }).catch(() => {});
    }
    if (res.done) {
      await sendResults(chat, task, res);
      return;
    }
  }
  await menu(chat, "Task is taking too long — use 📜 My tasks to fetch the result later.");
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

  const body = res.rows
    .map((r) => `${r.status.toUpperCase()} | ${r.card} | ${r.category} | ${r.msg}`)
    .join("\n");
  const form = new FormData();
  form.append("chat_id", String(chat));
  form.append("document", new Blob([body], { type: "text/plain" }), `${task.task_id}.txt`);
  await fetch(`${API}/sendDocument`, { method: "POST", body: form }).catch(() => {});
}

async function showTasks(chat, from) {
  const t = await api("tasks", from);
  if (!t.tasks.length) {
    await menu(chat, "No checks yet.");
    return;
  }
  await menu(
    chat,
    [
      "<b>📜 Recent checks</b>",
      "",
      ...t.tasks.map(
        (x) => `<code>${esc(x.task_id)}</code> · ${x.total} cards · ${x.status} · ${money(x.cost)}`,
      ),
      "",
      "Fetch one with <code>/task &lt;id&gt;</code>",
    ].join("\n"),
  );
}

async function showApi(chat, from) {
  const { account } = await api("session", from);
  if (account.api_key?.active) {
    await menu(
      chat,
      [
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
      ].join("\n"),
    );
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
    { reply_markup: { inline_keyboard: [[{ text: `Buy API access (${money(account.api_fee)})`, callback_data: "buyapi" }]] } },
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
            "<b>Welcome to Zoru Checker</b>",
            "",
            "Your account is ready — it is the same account as the website.",
            "Deposit, check cards (single or bulk), invite friends and buy API access right here.",
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
          await menu(chat, `⚙️ Gate set to <code>${esc(args[0])}</code>`);
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
        if (!args[0]) {
          await send(chat, "Usage: <code>/task &lt;id&gt;</code>");
          return;
        }
        const res = await api("result", from, { task_id: args[0] });
        await sendResults(chat, { task_id: args[0] }, res);
        return;
      }
      case "/help":
      default:
        await menu(
          chat,
          [
            "<b>Commands</b>",
            "/balance — profile & balance",
            "/deposit [amount] — add funds with crypto",
            "/check — check one card or bulk (or send a .txt)",
            "/gate — pick a checking gate",
            "/refer — referral link & earnings",
            "/api — API access",
            "/tasks — recent checks",
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
      await menu(chat, "Enter a valid amount, for example 50.");
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
    await menu(chat, `⚙️ Gate set to <code>${esc(gate)}</code>`);
    return;
  }

  switch (data) {
    case "balance":
      return showAccount(chat, from);
    case "deposit":
      return startDeposit(chat);
    case "check":
      return startCheck(chat);
    case "gates":
      return showGates(chat, from);
    case "refer":
      return showReferrals(chat, from);
    case "api":
      return showApi(chat, from);
    case "buyapi":
      return buyApi(chat, from);
    case "tasks":
      return showTasks(chat, from);
    default:
      return showAccount(chat, from);
  }
}

/* ------------------------------------------------------------------ */
/* Long polling — updates are handled concurrently so the bot stays fast */
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
      { command: "balance", description: "Profile & balance" },
      { command: "deposit", description: "Add funds" },
      { command: "check", description: "Check cards" },
      { command: "gate", description: "Choose gate" },
      { command: "refer", description: "Referral program" },
      { command: "api", description: "API access" },
      { command: "tasks", description: "Recent checks" },
    ],
  });
  console.log(`Zoru bot authenticated as @${identity.username}`);
  console.log(`Zoru website API base: ${BASE}`);
  console.log(`Zoru website bridge: ${BASE}/api/public/bot/<action>`);

  let offset = 0;
  for (;;) {
    try {
      const updates = await tg("getUpdates", { offset, timeout: 30, allowed_updates: ["message", "callback_query"] });
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
      console.error("poll error", e);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
