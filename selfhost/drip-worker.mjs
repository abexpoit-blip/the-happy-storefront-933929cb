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

const binCache = new Map();

async function detectBinMeta(rawCC) {
  const digits = String(rawCC || "").replace(/\D/g, "");
  const bin = digits.slice(0, 6);
  if (!bin || bin.length < 6) {
    return { bin: bin || "400000", brand: "VISA", level: "CLASSIC", type: "CREDIT", bank: "VISA ISSUING BANK", refundable: false, country: "US" };
  }

  if (binCache.has(bin)) {
    return binCache.get(bin);
  }

  // 1. Precise Brand detection
  let brand = "OTHER";
  if (/^4/.test(digits)) brand = "VISA";
  else if (/^(5[1-5]|2[2-7])/.test(digits)) brand = "MASTERCARD";
  else if (/^3[47]/.test(digits)) brand = "AMEX";
  else if (/^(6011|65|64[4-9]|622)/.test(digits)) brand = "DISCOVER";
  else if (/^35/.test(digits)) brand = "JCB";
  else if (/^3(0[0-5]|[68])/.test(digits)) brand = "DINERS";
  else if (/^62/.test(digits)) brand = "UNIONPAY";

  let level = "STANDARD";
  let type = "CREDIT";
  let refundable = false;
  let country = "US";
  let bank = null;

  // 2. Try online handyapi lookup for 100% accurate live bank & details
  try {
    const r = await fetch(`https://data.handyapi.com/bin/${bin}`, {
      headers: { "User-Agent": "zoru-worker/1.0", Accept: "application/json" },
      signal: AbortSignal.timeout(2500),
    });
    if (r.ok) {
      const j = await r.json();
      if (j && j.Status === "SUCCESS") {
        if (j.Scheme) brand = String(j.Scheme).toUpperCase();
        if (j.Type) type = String(j.Type).toUpperCase();
        if (j.CardTier) level = String(j.CardTier).toUpperCase();
        if (j.Issuer && String(j.Issuer).trim()) bank = String(j.Issuer).trim();
        if (j.Country?.A2) country = String(j.Country.A2).toUpperCase();
      }
    }
  } catch {
    /* fallback to offline intelligence */
  }

  // 3. Fallback bank detection by prefix if online returned no bank
  if (!bank || /unknown/i.test(bank)) {
    const p4 = bin.slice(0, 4);
    const p2 = bin.slice(0, 2);
    if (["4147", "4246", "4388", "4400", "4737", "4465", "4111"].includes(p4)) bank = "JPMORGAN CHASE BANK, N.A.";
    else if (["4800", "4802", "4854", "4356", "5424", "5524", "5243"].includes(p4)) bank = "BANK OF AMERICA, N.A.";
    else if (["4716", "4097", "4342", "5434", "5275", "4717"].includes(p4)) bank = "WELLS FARGO BANK, N.A.";
    else if (["4128", "4553", "5424", "5466", "5467", "4129"].includes(p4)) bank = "CITIBANK, N.A.";
    else if (["5178", "5291", "5338", "5353", "5456", "4288", "5179"].includes(p4)) bank = "CAPITAL ONE BANK (USA), N.A.";
    else if (["4000", "4224", "4225", "4226", "4744", "4851", "5108"].includes(p4)) bank = "U.S. BANK N.A.";
    else if (["4389", "5219", "5180", "5181"].includes(p4)) bank = "PNC BANK, N.A.";
    else if (["4514", "4724", "4504", "4520"].includes(p4)) bank = "TD BANK, N.A.";
    else if (["4020", "4021", "4833", "6032"].includes(p4)) bank = "SYNCHRONY BANK";
    else if (["4566", "4985", "4567"].includes(p4)) bank = "NAVY FEDERAL CREDIT UNION";
    else if (["4310", "4447", "4503", "5117"].includes(p4)) bank = "USAA FEDERAL SAVINGS BANK";
    else if (["4929", "4543", "4921"].includes(p4)) bank = "BARCLAYS BANK PLC";
    else if (["4001", "4546", "5168"].includes(p4)) bank = "HSBC BANK PLC";
    else if (["4544"].includes(p4)) bank = "SANTANDER BANK, N.A.";
    else if (["4510", "4511"].includes(p4)) bank = "ROYAL BANK OF CANADA";
    else if (brand === "AMEX" || p2 === "34" || p2 === "37") bank = "AMERICAN EXPRESS";
    else if (brand === "DISCOVER" || bin.startsWith("6011") || bin.startsWith("65")) bank = "DISCOVER FINANCIAL SERVICES";
    else if (brand === "VISA") bank = "VISA ISSUING BANK";
    else if (brand === "MASTERCARD") bank = "MASTERCARD ISSUING BANK";
    else bank = "COMMERCIAL BANK";
  }

  // 4. Level & Refundable determination
  const binNum = parseInt(bin, 10) || 0;
  if (!level || level === "STANDARD") {
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
  } else {
    refundable = ["PLATINUM", "INFINITE", "SIGNATURE", "WORLD", "WORLD ELITE", "BLACK", "CENTURION", "BUSINESS", "GOLD"].some(k => level.includes(k));
  }

  const res = { bin, brand, level, type, bank, refundable, country };
  binCache.set(bin, res);
  return res;
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

function isExpiringThisMonthOrPast(monthStr, yearStr, referenceDate = new Date()) {
  if (!monthStr || !yearStr) return false;
  const m = parseInt(String(monthStr).replace(/\D/g, ""), 10);
  let y = parseInt(String(yearStr).replace(/\D/g, ""), 10);
  if (!m || !y || m < 1 || m > 12) return false;
  if (y < 100) y = 2000 + y;
  const curY = referenceDate.getUTCFullYear();
  const curM = referenceDate.getUTCMonth() + 1;
  return y < curY || (y === curY && m <= curM);
}

async function autoDiscountExpiringProducts(db) {
  try {
    const now = new Date();
    const { data: prods, error } = await db
      .from("products")
      .select("id, exp_month, exp_year, price")
      .eq("active", true)
      .gt("price", 0.20)
      .not("exp_month", "is", null)
      .not("exp_year", "is", null)
      .limit(1000);

    if (error || !prods || prods.length === 0) return;

    const toDiscount = [];
    for (const p of prods) {
      if (isExpiringThisMonthOrPast(p.exp_month, p.exp_year, now)) {
        toDiscount.push(p.id);
      }
    }

    if (toDiscount.length > 0) {
      console.log(`[Drip Worker] Auto-discounting ${toDiscount.length} cards expiring this month to $0.20...`);
      for (let i = 0; i < toDiscount.length; i += 100) {
        const chunk = toDiscount.slice(i, i + 100);
        await db
          .from("products")
          .update({ price: 0.20, updated_at: now.toISOString() })
          .in("id", chunk);
      }
    }
  } catch (err) {
    console.error("[Drip Worker] Error in autoDiscountExpiringProducts:", err.message);
  }
}

async function processActiveQueues() {
  const now = new Date();
  const dhakaNow = getDhakaDateAndHour(now);
  console.log(
    `[Drip Worker] Checking queues at ${now.toISOString()} (Dhaka local: ${dhakaNow.dateStr} ${String(dhakaNow.hour).padStart(2, "0")}:${String(dhakaNow.minute).padStart(2, "0")})...`
  );

  // Run running-month auto-discount check for existing active products
  await autoDiscountExpiringProducts(db);

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
    try {
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
        console.log(`[Drip Worker] No pending items left for queue ${queue.id}. Marking completed.`);
        await db
          .from("card_drip_queues")
          .update({ status: "completed", cards_remaining: 0, updated_at: now.toISOString() })
          .eq("id", queue.id);
        continue;
      }

      // Format today's base date with Dhaka local date (e.g. 2026_09_19)
      const baseDateStr = dhakaNow.dateStr.replace(/-/g, "_");
      const stamp = Date.now().toString(36);
      const clean = (s) => (!s || String(s).toLowerCase() === "null" ? "" : s);

      const products = await Promise.all(
        items.map(async (c, idx) => {
          const meta = await detectBinMeta(c.cc || c.bin);
          const isRef = queue.refundable === true ? true : meta.refundable;
          const cardCountry = clean(c.country) || meta.country || null;
          const cardBrand = (c.brand && c.brand !== "OTHER" && c.brand !== "UNKNOWN") ? c.brand : (meta.brand || "VISA");
          const cardBase = `ADMIN_${baseDateStr}_${cardBrand}`;

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
            cardPrice = Math.round(Math.max(minP, Math.min(maxP, minP + range * weight + variance + boost)) * 100) / 100;
          }

          // Clearance discount rule: any card expiring in running month (or past) auto drops to $0.20
          if (isExpiringThisMonthOrPast(c.month, c.year, now)) {
            cardPrice = 0.20;
          }

          return {
            category_id: queue.category_id || null,
            title: `${cardBrand} ${c.bin} · ${clean(c.city) || clean(c.state) || cardCountry || "—"}`,
            slug: `${c.bin}-${stamp}-${idx}-${Math.random().toString(36).slice(2, 8)}`,
            price: cardPrice,
            delivery_type: "key",
            active: true,
            stock: 1,
            bin: c.bin,
            brand: cardBrand,
            country: cardCountry,
            state: clean(c.state) || null,
            city: clean(c.city) || null,
            zip: clean(c.zip) || null,
            exp_month: clean(c.month) || null,
            exp_year: clean(c.year) || null,
            base: cardBase,
            refundable: isRef,
            card_type: meta.type,
            card_level: meta.level,
            bank: meta.bank,
            last_digits: (c.cc || "").replace(/\D/g, "").slice(-3) || null,
            has_phone: !!clean(c.tel),
            has_email: !!clean(c.email),
            created_at: now.toISOString(),
          };
        })
      );

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

      // Announcements for all distinct bases released
      const distinctBases = [...new Set(products.map((p) => p.base))];
      if (queue.auto_announce) {
        for (const bName of distinctBases) {
          const pub = bName.replace(/^\s*(admin|seller)[\s_\-.:]+/i, "");
          await db.from("announcements").insert({
            title: `Base Update: ${pub}`,
            body: `Fresh batch of verified cards added for base ${pub}. Available in shop now.`,
            kind: "update",
            created_at: now.toISOString(),
          }).catch((e) => console.error("Announcement insert error:", e.message));
        }
      }

      // Telegram Broadcast
      if (queue.telegram_broadcast) {
        const brandsList = [...new Set(products.map((p) => p.brand))].join(", ");
        const countries = [...new Set(products.map((it) => it.country).filter(Boolean))].join(", ") || "MIX";
        const cleanBases = distinctBases.map((b) => b.replace(/^\s*(admin|seller)[\s_\-.:]+/i, "")).join(" / ");
        await sendTelegramBroadcast(cleanBases, items.length, brandsList, countries, queue.price);
      }
    } catch (qErr) {
      console.error(`[Drip Worker] Error processing queue '${queue.name}' (${queue.id}):`, qErr.message);
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
