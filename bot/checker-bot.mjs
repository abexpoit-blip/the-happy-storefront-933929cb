#!/usr/bin/env node
/**
 * Zoru Telegram Checker Bot
 * -------------------------
 * Standalone long-polling bot. It never touches the database directly — every
 * action goes through the public checker API, exactly like any third-party bot
 * would, so billing / limits / refunds stay identical to the web checker.
 *
 * Env (see /etc/zoru/telegram.env):
 *   TELEGRAM_BOT_TOKEN   bot token from @BotFather                (required)
 *   API_BASE             https://zoru.cc                          (default)
 *   TELEGRAM_ADMIN_IDS   comma separated telegram user ids (admins)
 *   BOT_ADMIN_SECRET     same secret the site has, lets admins mint API keys
 *   BOT_DATA_FILE        where per-user API keys are stored
 *
 * Run:  bash selfhost/bot-start.sh
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

const TOKEN = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
if (!TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN missing. bash selfhost/set-secrets.sh telegram TELEGRAM_BOT_TOKEN=xxx");
  process.exit(1);
}
const API_BASE = (process.env.API_BASE ?? "https://zoru.cc").replace(/\/+$/, "");
const TG = `https://api.telegram.org/bot${TOKEN}`;
const ADMINS = new Set(
  (process.env.TELEGRAM_ADMIN_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
);
const BOT_ADMIN_SECRET = (process.env.BOT_ADMIN_SECRET ?? "").trim();
const DATA_FILE = process.env.BOT_DATA_FILE ?? "/var/lib/zoru-bot/users.json";
const MAX_CARDS = 500;

/* ---------------------------------------------------------------- storage */
function loadStore() {
  try {
    return JSON.parse(readFileSync(DATA_FILE, "utf8"));
  } catch {
    return {};
  }
}
let store = loadStore();
function saveStore() {
  mkdirSync(dirname(DATA_FILE), { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), { mode: 0o600 });
}
const userOf = (id) => (store[String(id)] ??= {});
const keyOf = (id) => userOf(id).apiKey ?? null;

/* ------------------------------------------------------------ telegram io */
async function tg(method, payload) {
  const res = await fetch(`${TG}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) console.error(`telegram ${method} failed:`, data.description ?? res.status);
  return data.result;
}
const send = (chat, text, extra = {}) =>
  tg("sendMessage", { chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });

async function sendFile(chat, filename, content, caption) {
  const form = new FormData();
  form.append("chat_id", String(chat));
  if (caption) form.append("caption", caption);
  form.append("document", new Blob([content], { type: "text/plain" }), filename);
  const res = await fetch(`${TG}/sendDocument`, { method: "POST", body: form });
  if (!res.ok) console.error("sendDocument failed:", await res.text());
}

async function downloadTgFile(fileId) {
  const info = await tg("getFile", { file_id: fileId });
  if (!info?.file_path) return "";
  const res = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${info.file_path}`);
  return res.ok ? await res.text() : "";
}

/* ----------------------------------------------------------------- shop api */
async function api(path, { method = "POST", body, apiKey, adminSecret } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey;
  if (adminSecret) headers["x-bot-admin-secret"] = adminSecret;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`bad response from server (${res.status})`);
  }
  if (!res.ok || data.status === "error") throw new Error(data.message ?? `http_${res.status}`);
  return data;
}

/* ------------------------------------------------------------------- cards */
const digits = (s) => String(s).replace(/\D/g, "");
function parseCardLine(raw) {
  const p = String(raw).trim().split(/[|:/\s,]+/).filter(Boolean);
  if (p.length < 4) return null;
  const pan = digits(p[0]);
  let mm = digits(p[1]);
  let yy = digits(p[2]);
  const cvv = digits(p[3]);
  if (pan.length < 12 || !mm || !yy || !cvv) return null;
  if (mm.length === 1) mm = `0${mm}`;
  if (yy.length === 2) yy = `20${yy}`;
  return `${pan}|${mm}|${yy}|${cvv}`;
}
const parseCards = (text) => [
  ...new Set(String(text).split(/\r?\n/).map(parseCardLine).filter(Boolean)),
];

/* ------------------------------------------------------------------ texts */
const HELP = `<b>Zoru Checker Bot</b>

<b>Setup</b>
/setkey &lt;api_key&gt; — save your API key
/mykey — show the saved key (masked)
/balance — key credits + owner balance

<b>Checking</b>
/check — reply or paste cards, one per line
  <code>4111111111111111|12|2027|123</code>
Or just upload a <code>.txt</code> file with cards (max ${MAX_CARDS}).
/gate &lt;name&gt; — set a gate for your checks
/task &lt;task_id&gt; — re-fetch a task result

<b>Build your own bot</b>
Every command above is a plain HTTP call:
<code>POST ${API_BASE}/api/public/checker/check</code>
<code>POST ${API_BASE}/api/public/checker/result</code>
<code>GET  ${API_BASE}/api/public/checker/balance</code>
Header: <code>x-api-key: YOUR_KEY</code>
/api — full request/response examples`;

const API_DOC = `<b>API for your own bot</b>

1) Balance
<pre>curl ${API_BASE}/api/public/checker/balance \\
 -H "x-api-key: KEY"</pre>

2) Submit cards
<pre>curl -X POST ${API_BASE}/api/public/checker/check \\
 -H "x-api-key: KEY" -H "Content-Type: application/json" \\
 -d '{"cards":["4111111111111111|12|2027|123"],"gate":"CCV_Braintree_Auth"}'</pre>
→ <code>{"task_id":"...","cost_usd":0.02}</code>

3) Poll result (every ~5s until <code>done:true</code>)
<pre>curl -X POST ${API_BASE}/api/public/checker/result \\
 -H "x-api-key: KEY" -H "Content-Type: application/json" \\
 -d '{"task_id":"TASK"}'</pre>

Billing: $0.02 per card — key credits first, then the owner's account balance.
Cards the gateway never answers are refunded automatically.`;

const ADMIN_HELP = `<b>Admin</b>
/newkey &lt;label&gt; [credits] [daily_limit] — issue a new API key
/whoami — your telegram id`;

/* ---------------------------------------------------------------- checking */
const running = new Map(); // chatId -> true

async function runCheck(chat, userId, lines) {
  const apiKey = keyOf(userId);
  if (!apiKey) return send(chat, "No API key yet. Use /setkey &lt;api_key&gt; first.");
  if (running.get(chat)) return send(chat, "A check is already running for you. Please wait.");
  if (lines.length > MAX_CARDS) lines = lines.slice(0, MAX_CARDS);

  running.set(chat, true);
  try {
    const gate = userOf(userId).gate;
    const started = await api("/api/public/checker/check", {
      apiKey,
      body: gate ? { cards: lines, gate } : { cards: lines },
    });
    userOf(userId).lastTask = started.task_id;
    saveStore();

    const status = await send(
      chat,
      `Started <b>${started.total}</b> cards\nGate: <code>${started.gate}</code>\nCost: $${started.cost_usd}\nTask: <code>${started.task_id}</code>`,
    );

    await pollTask(chat, apiKey, started.task_id, status?.message_id);
  } catch (e) {
    await send(chat, `Check failed: <code>${e.message}</code>`);
  } finally {
    running.delete(chat);
  }
}

async function pollTask(chat, apiKey, taskId, messageId) {
  const deadline = Date.now() + 30 * 60 * 1000;
  let last = "";
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    let res;
    try {
      res = await api("/api/public/checker/result", { apiKey, body: { task_id: taskId } });
    } catch (e) {
      await send(chat, `Result error: <code>${e.message}</code>`);
      return;
    }
    const rows = res.results ?? [];
    const live = rows.filter((r) => r.status === "live");
    const dead = rows.filter((r) => r.status === "dead");
    const line = `Progress ${res.answered}/${res.total} — LIVE ${live.length} | DEAD ${dead.length}`;
    if (messageId && line !== last) {
      last = line;
      await tg("editMessageText", { chat_id: chat, message_id: messageId, text: line }).catch(() => {});
    }
    if (res.done) {
      await finish(chat, taskId, res, live, dead);
      return;
    }
  }
  await send(chat, `Timed out waiting for <code>${taskId}</code>. Use /task ${taskId} later.`);
}

async function finish(chat, taskId, res, live, dead) {
  const fmt = (r) => `${r.card} | ${r.status.toUpperCase()} | ${r.category} | ${r.msg}`;
  const refund =
    res.credits_refunded || res.balance_refunded
      ? `\nRefunded: ${res.credits_refunded} credits / $${res.balance_refunded}`
      : "";
  await send(
    chat,
    `<b>Done</b> — task <code>${taskId}</code>\nTotal ${res.total} | LIVE ${live.length} | DEAD ${dead.length}${refund}`,
  );
  if (live.length) {
    const preview = live.slice(0, 20).map(fmt).join("\n");
    await send(chat, `<b>LIVE</b>\n<pre>${preview}</pre>`);
  }
  const all = (res.results ?? []).map(fmt).join("\n");
  if (all) await sendFile(chat, `result-${taskId}.txt`, all, "Full result");
}

/* --------------------------------------------------------------- commands */
async function handleMessage(msg) {
  const chat = msg.chat?.id;
  const userId = msg.from?.id;
  if (!chat || !userId) return;
  const isAdmin = ADMINS.has(String(userId));
  const text = (msg.text ?? msg.caption ?? "").trim();
  const [rawCmd, ...args] = text.split(/\s+/);
  const cmd = rawCmd?.split("@")[0]?.toLowerCase() ?? "";

  // file upload -> cards
  if (msg.document) {
    const content = await downloadTgFile(msg.document.file_id);
    const cards = parseCards(content);
    if (!cards.length) return send(chat, "No valid cards found in that file.");
    await send(chat, `Found <b>${cards.length}</b> cards. Starting…`);
    return runCheck(chat, userId, cards);
  }

  switch (cmd) {
    case "/start":
    case "/help":
      return send(chat, HELP + (isAdmin ? `\n\n${ADMIN_HELP}` : ""));

    case "/api":
      return send(chat, API_DOC);

    case "/whoami":
      return send(chat, `Your telegram id: <code>${userId}</code>`);

    case "/setkey": {
      const key = args[0]?.trim();
      if (!key) return send(chat, "Usage: /setkey &lt;api_key&gt;");
      userOf(userId).apiKey = key;
      saveStore();
      try {
        const bal = await api("/api/public/checker/balance", { method: "GET", apiKey: key });
        return send(
          chat,
          `Key saved ✅\nLabel: <b>${bal.label}</b>\nCredits: ${bal.credits}\nBalance: $${bal.balance}`,
        );
      } catch (e) {
        return send(chat, `Key saved, but the server said: <code>${e.message}</code>`);
      }
    }

    case "/mykey": {
      const key = keyOf(userId);
      if (!key) return send(chat, "No key saved. Use /setkey &lt;api_key&gt;");
      return send(chat, `Saved key: <code>${key.slice(0, 10)}…${key.slice(-4)}</code>`);
    }

    case "/gate": {
      const gate = args.join(" ").trim();
      if (!gate) return send(chat, "Usage: /gate &lt;gate_name&gt;");
      userOf(userId).gate = gate;
      saveStore();
      return send(chat, `Gate set to <code>${gate}</code>`);
    }

    case "/balance": {
      const key = keyOf(userId);
      if (!key) return send(chat, "No key saved. Use /setkey &lt;api_key&gt;");
      try {
        const bal = await api("/api/public/checker/balance", { method: "GET", apiKey: key });
        return send(
          chat,
          `<b>${bal.label}</b>\nCredits: ${bal.credits}\nBalance: $${bal.balance}\nPrice/card: $${bal.price_per_card}\nCards affordable: ${bal.cards_affordable}`,
        );
      } catch (e) {
        return send(chat, `Error: <code>${e.message}</code>`);
      }
    }

    case "/task": {
      const key = keyOf(userId);
      const taskId = args[0] ?? userOf(userId).lastTask;
      if (!key || !taskId) return send(chat, "Usage: /task &lt;task_id&gt;");
      try {
        const res = await api("/api/public/checker/result", { apiKey: key, body: { task_id: taskId } });
        const rows = res.results ?? [];
        return finish(
          chat,
          taskId,
          res,
          rows.filter((r) => r.status === "live"),
          rows.filter((r) => r.status === "dead"),
        );
      } catch (e) {
        return send(chat, `Error: <code>${e.message}</code>`);
      }
    }

    case "/newkey": {
      if (!isAdmin) return send(chat, "Admins only.");
      if (!BOT_ADMIN_SECRET) return send(chat, "BOT_ADMIN_SECRET is not configured on the bot.");
      const label = args[0];
      if (!label) return send(chat, "Usage: /newkey &lt;label&gt; [credits] [daily_limit]");
      try {
        const out = await api("/api/public/checker/key", {
          adminSecret: BOT_ADMIN_SECRET,
          body: {
            label,
            credits: Number(args[1] ?? 0) || 0,
            daily_limit: Number(args[2] ?? 5000) || 5000,
          },
        });
        return send(
          chat,
          `New key for <b>${out.label}</b>\n<code>${out.api_key}</code>\nCredits: ${out.credits} | Daily limit: ${out.daily_limit}\n\nShown once — save it now.`,
        );
      } catch (e) {
        return send(chat, `Error: <code>${e.message}</code>`);
      }
    }

    case "/check": {
      const body = text.slice(rawCmd.length);
      const source = msg.reply_to_message?.text ?? "";
      const cards = parseCards(`${body}\n${source}`);
      if (!cards.length)
        return send(chat, "Send cards after /check (one per line) or reply to a message with cards.");
      return runCheck(chat, userId, cards);
    }

    default: {
      if (cmd.startsWith("/")) return send(chat, "Unknown command. /help");
      const cards = parseCards(text);
      if (cards.length) return runCheck(chat, userId, cards);
      return send(chat, "Send cards (one per line), a .txt file, or /help.");
    }
  }
}

/* ------------------------------------------------------------- poll loop */
async function main() {
  console.log(`Zoru checker bot started. API base: ${API_BASE}`);
  if (existsSync(DATA_FILE)) store = loadStore();
  await tg("deleteWebhook", { drop_pending_updates: false });
  let offset = 0;
  for (;;) {
    try {
      const updates =
        (await tg("getUpdates", { offset, timeout: 50, allowed_updates: ["message"] })) ?? [];
      for (const u of updates) {
        offset = u.update_id + 1;
        if (u.message) handleMessage(u.message).catch((e) => console.error("handler:", e));
      }
    } catch (e) {
      console.error("poll error:", e.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

main();
