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

const telegramToken = (
  process.env.TELEGRAM_UPDATE_BOT_TOKEN ||
  "8883627548:AAGrYhz6FNQXr5NRetLVbbke6lJ4EJEIk8g"
).trim();
const telegramChannel = (process.env.TELEGRAM_CHANNEL_ID || "@zorushop").trim();

if (!serviceKey) {
  console.error("[Drip Worker] No Supabase service key found. Exiting.");
  process.exit(1);
}

const db = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

const binCache = new Map();

const CSV_PATH = join(__dirname, "bins.csv");
let csvContent = null;

function loadCsvIfPresent() {
  if (!csvContent && existsSync(CSV_PATH)) {
    try {
      csvContent = readFileSync(CSV_PATH, "utf8");
    } catch {}
  }
}
loadCsvIfPresent();

function parseCsvLine(line) {
  const parts = [];
  let inQuotes = false;
  let cur = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return {
    bin: (parts[0] || "").replace(/"/g, "").trim(),
    brand: (parts[1] || "").replace(/"/g, "").trim().toUpperCase(),
    type: (parts[2] || "").replace(/"/g, "").trim().toUpperCase(),
    category: (parts[3] || "").replace(/"/g, "").trim().toUpperCase(),
    issuer: (parts[4] || "").replace(/"/g, "").trim(),
    country: (parts[7] || "").replace(/"/g, "").trim().toUpperCase(),
    countryName: (parts[9] || "").replace(/"/g, "").trim(),
  };
}

function lookupCsvBin(bin) {
  loadCsvIfPresent();
  if (!csvContent) return null;
  const target = `\n${bin},`;
  const idx = csvContent.indexOf(target);
  if (idx === -1) {
    if (csvContent.startsWith(`${bin},`)) {
      const end = csvContent.indexOf("\n");
      return parseCsvLine(csvContent.slice(0, end));
    }
    return null;
  }
  const start = idx + 1;
  const end = csvContent.indexOf("\n", start);
  const line = end === -1 ? csvContent.slice(start) : csvContent.slice(start, end);
  return parseCsvLine(line);
}

async function detectBinMeta(rawCC) {
  const digits = String(rawCC || "").replace(/\D/g, "");
  const bin = digits.slice(0, 6);
  if (!bin || bin.length < 6) {
    return { bin: bin || "400000", brand: "VISA", level: "CLASSIC", type: "CREDIT", bank: "JPMORGAN CHASE BANK, N.A.", refundable: false, country: "US" };
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

  // 2. Primary: Lightning-fast 374,000+ offline BIN database
  const csvHit = lookupCsvBin(bin);
  if (csvHit && csvHit.issuer && !/unknown/i.test(csvHit.issuer) && !/issuing bank/i.test(csvHit.issuer)) {
    bank = csvHit.issuer;
    if (csvHit.brand && csvHit.brand !== "OTHER") brand = csvHit.brand;
    if (csvHit.type) type = csvHit.type;
    if (csvHit.category) level = csvHit.category;
    if (csvHit.country) country = csvHit.country;
  }

  // 3. Secondary: Try Binlist if offline DB has no bank
  if (!bank) {
    try {
      const r = await fetch(`https://lookup.binlist.net/${bin}`, {
        headers: { "Accept-Version": "3", Accept: "application/json", "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(2500),
      });
      if (r.ok) {
        const j = await r.json();
        if (j && j.bank?.name) {
          bank = j.bank.name.trim();
          if (j.scheme) brand = String(j.scheme).toUpperCase();
          if (j.type) type = String(j.type).toUpperCase();
          if (j.brand) level = String(j.brand).toUpperCase();
          if (j.country?.alpha2) country = String(j.country.alpha2).toUpperCase();
        }
      }
    } catch {}
  }

  // 4. Tertiary: Try HandyAPI with real browser User-Agent
  if (!bank) {
    try {
      const r = await fetch(`https://data.handyapi.com/bin/${bin}`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", Accept: "application/json" },
        signal: AbortSignal.timeout(2500),
      });
      if (r.ok) {
        const j = await r.json();
        if (j && j.Status === "SUCCESS" && j.Issuer && !/unknown/i.test(j.Issuer) && !/issuing bank/i.test(j.Issuer)) {
          bank = String(j.Issuer).trim();
          if (j.Scheme) brand = String(j.Scheme).toUpperCase();
          if (j.Type) type = String(j.Type).toUpperCase();
          if (j.CardTier) level = String(j.CardTier).toUpperCase();
          if (j.Country?.A2) country = String(j.Country.A2).toUpperCase();
        }
      }
    } catch {}
  }

  // 5. Final fallback: Accurate country generic bank instead of fake random US names
  if (!bank || /unknown/i.test(bank) || /issuing bank/i.test(bank)) {
    bank = country ? `${country} COMMERCIAL BANK` : "COMMERCIAL BANK";
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
  const priceStr = price ? `$${Number(price).toFixed(2)}` : "$1.50";
  const text = [
    `⚡ <b>ZORU SHOP — NEW BASE UPDATE!</b> ⚡`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `📦 <b>Base:</b> <code>${cleanBase}</code>`,
    `🏷 <b>Brand:</b> ${brand || "VISA/MC"}`,
    `🌍 <b>Country:</b> ${country || "MIX"}`,
    count ? `💳 <b>Cards Added:</b> ${count} Verified Cards` : ``,
    `💰 <b>Price:</b> ${priceStr}`,
    `⚡ <b>Delivery:</b> Instant Automated Delivery`,
    ``,
    `🛒 <b>Shop Now:</b> <a href="https://zoru.cc/shop">zoru.cc/shop</a>`,
    `🤖 <b>Checker Bot:</b> <a href="https://t.me/ZoruCheckerbot">@ZoruCheckerbot</a>`,
    `📢 <b>Official Channel:</b> ${telegramChannel}`,
    `💬 <b>Support:</b> @Zorushop_service`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
  ]
    .filter(Boolean)
    .join("\n");

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

    // Also push to all registered update bot subscribers
    try {
      const { data: subs } = await db
        .from("update_bot_subscribers")
        .select("telegram_id")
        .eq("subscribed", true)
        .limit(500);

      for (const s of subs ?? []) {
        fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: s.telegram_id,
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
        }).catch(() => {});
      }
    } catch {}
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

        // 2. Check if current time in Asia/Dhaka has reached 10:00 AM (for recurring runs)
        if (dhakaNow.hour < TARGET_RELEASE_HOUR_DHAKA) {
          console.log(
            `[Drip Worker] Queue '${queue.name}' scheduled for 10:00 AM Asia/Dhaka (current Dhaka time: ${String(dhakaNow.hour).padStart(2, "0")}:${String(dhakaNow.minute).padStart(2, "0")}). Waiting.`
          );
          continue;
        }
      }

      console.log(`[Drip Worker] Triggering daily release for queue '${queue.name}' (${queue.id}) on Dhaka date ${dhakaNow.dateStr}...`);
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
      // Check existing keys in safe chunks to avoid URL length limit
      const itemPans = items.map((c) => String(c.cc || "").replace(/\D/g, "")).filter((p) => p.length >= 12);
      const existingKeyPans = new Set();
      const CHUNK_PAN = 200;
      for (let pIdx = 0; pIdx < itemPans.length; pIdx += CHUNK_PAN) {
        const slice = itemPans.slice(pIdx, pIdx + CHUNK_PAN);
        try {
          const { data: exKeys } = await db.from("product_keys").select("pan").in("pan", slice);
          for (const k of exKeys ?? []) {
            if (k?.pan) existingKeyPans.add(k.pan);
          }
        } catch {}
      }

      const cleanItems = [];
      const skippedIds = [];
      for (const it of items) {
        const p = String(it.cc || "").replace(/\D/g, "");
        if (existingKeyPans.has(p)) {
          skippedIds.push(it.id);
        } else {
          cleanItems.push(it);
        }
      }

      if (skippedIds.length > 0) {
        for (let sIdx = 0; sIdx < skippedIds.length; sIdx += 100) {
          const sSlice = skippedIds.slice(sIdx, sIdx + 100);
          await db.from("card_drip_items").update({ status: "released", released_at: now.toISOString() }).in("id", sSlice);
        }
        console.log(`[Drip Worker] Skipped ${skippedIds.length} duplicate cards already in shop for queue '${queue.name}'.`);
      }

      if (cleanItems.length === 0) {
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
        continue;
      }

      const stamp = Date.now().toString(36);
      const clean = (s) => (!s || String(s).toLowerCase() === "null" ? "" : s);

      const products = await Promise.all(
        cleanItems.map(async (c, idx) => {
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

            // Small deterministic variance based on last 4 digits
            let variance = 0;
            if (c.cc) {
              const digits = String(c.cc).replace(/\D/g, "");
              const seed = parseInt(digits.slice(-4) || "5555", 10) % 100;
              variance = ((seed - 50) / 100) * (range * 0.12);
            }

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

      // Safe batch chunk insertion (100 rows per chunk)
      const CHUNK_INSERT = 100;
      const allInserted = [];
      for (let i = 0; i < products.length; i += CHUNK_INSERT) {
        const pSlice = products.slice(i, i + CHUNK_INSERT);
        const { data: insSlice, error: pErr } = await db
          .from("products")
          .insert(pSlice)
          .select("id, slug");

        if (pErr) {
          console.error(`[Drip Worker] Failed to insert products chunk for queue ${queue.id}:`, pErr.message);
          continue;
        }

        const keys = (insSlice ?? []).map((prod, kIdx) => ({
          product_id: prod.id,
          content: cleanItems[i + kIdx].card_line,
          pan: String(cleanItems[i + kIdx].cc || "").replace(/\D/g, "") || null,
        }));
        const { error: kErr } = await db.from("product_keys").insert(keys);
        if (kErr) console.error(`[Drip Worker] Failed to insert keys chunk:`, kErr.message);

        const rIds = cleanItems.slice(i, i + CHUNK_INSERT).map((it) => it.id);
        const { error: rErr } = await db
          .from("card_drip_items")
          .update({ status: "released", released_at: now.toISOString() })
          .in("id", rIds);
        if (rErr) console.error(`[Drip Worker] Failed to update released status chunk:`, rErr.message);

        if (insSlice) allInserted.push(...insSlice);
      }

      // Update queue stats
      const remainingAfter = Math.max(0, queue.cards_remaining - cleanItems.length);
      await db
        .from("card_drip_queues")
        .update({
          cards_remaining: remainingAfter,
          last_run_at: now.toISOString(),
          status: remainingAfter === 0 ? "completed" : queue.status,
          updated_at: now.toISOString(),
        })
        .eq("id", queue.id);

      console.log(`[Drip Worker] Successfully released ${cleanItems.length} cards for '${queue.name}'! (${remainingAfter} left)`);

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

      // Telegram Broadcast (Option 2: Individual alert for every distinct base)
      if (queue.telegram_broadcast) {
        for (let bIdx = 0; bIdx < distinctBases.length; bIdx++) {
          const bName = distinctBases[bIdx];
          const bProds = products.filter((p) => p.base === bName);
          const bBrands = [...new Set(bProds.map((p) => p.brand))].join(", ") || "VISA/MC";
          const bCountries = [...new Set(bProds.map((it) => it.country).filter(Boolean))].join(", ") || "MIX";
          const avgP = bProds.length > 0
            ? (bProds.reduce((acc, x) => acc + (Number(x.price) || 1.5), 0) / bProds.length).toFixed(2)
            : queue.price;
          await sendTelegramBroadcast(bName, bProds.length, bBrands, bCountries, avgP);
          if (bIdx < distinctBases.length - 1) {
            await new Promise((r) => setTimeout(r, 600)); // 600ms rate limit protection
          }
        }
      }
    } catch (qErr) {
      console.error(`[Drip Worker] Error processing queue '${queue.name}' (${queue.id}):`, qErr.message);
    }
  }
}

// ----------------------------------------------------
// Automatic Crypto Deposit Reconciler
// ----------------------------------------------------
async function checkLtcBlockchainWorker(address) {
  if (!address || typeof address !== "string") return { confirmed: false, count: 0, txid: null, satoshis: 0 };
  const clean = address.trim();
  try {
    const res = await fetch(`https://litecoinspace.org/api/address/${clean}/txs`, {
      headers: { Accept: "application/json", "User-Agent": "zoru-worker/1.0" },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const txs = await res.json();
      if (Array.isArray(txs) && txs.length > 0) {
        let totalSatoshis = 0;
        let bestTxid = null;
        let isConfirmed = false;
        for (const tx of txs) {
          if (tx && Array.isArray(tx.vout)) {
            for (const out of tx.vout) {
              if (out.scriptpubkey_address === clean) {
                totalSatoshis += out.value || 0;
                if (!bestTxid) bestTxid = tx.txid;
                if (tx.status && tx.status.confirmed) isConfirmed = true;
              }
            }
          }
        }
        if (totalSatoshis > 0) {
          return { confirmed: isConfirmed, count: txs.length, txid: bestTxid, satoshis: totalSatoshis };
        }
      }
    }
  } catch {
    try {
      const bcRes = await fetch(`https://api.blockcypher.com/v1/ltc/main/addrs/${clean}/balance`, {
        signal: AbortSignal.timeout(5000),
      });
      if (bcRes.ok) {
        const bcData = await bcRes.json();
        const total = bcData.total_received ?? 0;
        if (total > 0) {
          return {
            confirmed: (bcData.n_tx ?? 0) > 0,
            count: bcData.n_tx ?? 1,
            txid: null,
            satoshis: total,
          };
        }
      }
    } catch {}
  }
  return { confirmed: false, count: 0, txid: null, satoshis: 0 };
}

async function reconcilePendingDeposits() {
  try {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: pendings, error: pErr } = await db
      .from("deposits")
      .select("id, invoice_id, wallet_address, amount, crypto_amount, currency, status, user_id, created_at")
      .eq("status", "pending")
      .gt("created_at", since)
      .order("created_at", { ascending: false })
      .limit(30);

    if (pErr || !pendings || pendings.length === 0) return;

    let plisioApiKey = (process.env.PLISIO_SECRET_KEY || "").trim();
    if (!plisioApiKey) {
      const { data: row } = await db.from("site_settings").select("value").eq("key", "plisio_secret_key").maybeSingle();
      if (row?.value) plisioApiKey = String(row.value).trim();
    }

    for (const dep of pendings) {
      let isApproved = false;
      let matchedTxid = null;

      // 1. Direct Blockchain check (100% decentralized & immediate)
      if (dep.wallet_address) {
        const bc = await checkLtcBlockchainWorker(dep.wallet_address);
        if (bc.confirmed && bc.count > 0) {
          isApproved = true;
          matchedTxid = bc.txid;
        }
      }

      // 2. Plisio Invoice check
      if (!isApproved && plisioApiKey && dep.invoice_id) {
        try {
          const pRes = await fetch(`https://api.plisio.net/api/v1/operations/${encodeURIComponent(dep.invoice_id)}?api_key=${encodeURIComponent(plisioApiKey)}`, {
            signal: AbortSignal.timeout(6000),
          });
          if (pRes.ok) {
            const pData = await pRes.json();
            const op = pData?.data;
            if (op) {
              const st = String(op.status || "").toLowerCase();
              const rec = Number(op.actual_fee ? op.received_amount : op.amount_received ?? op.received_amount ?? 0);
              const confs = Number(op.confirmations ?? 0);
              if (
                st.includes("completed") ||
                st === "paid" ||
                st === "confirmed" ||
                st === "success" ||
                st.includes("pending internal") ||
                (st === "mismatch" && (rec > 0 || confs >= 1))
              ) {
                isApproved = true;
                matchedTxid = op.tx_url || op.txn_id || null;
              }
            }
          }
        } catch {}
      }

      if (isApproved) {
        console.log(`[Deposit Reconciler] Settling approved deposit ${dep.id} (user: ${dep.user_id}, amount: $${dep.amount})`);
        const { data: settleResult, error: sErr } = await db.rpc("settle_crypto_deposit", {
          _invoice_id: dep.invoice_id || dep.id,
          _status: "approved",
          _confirmations: 1,
          _txid: matchedTxid,
        });

        if (sErr) {
          console.error(`[Deposit Reconciler] Settle error:`, sErr.message);
          continue;
        }

        if (settleResult === "approved") {
          console.log(`[Deposit Reconciler] Successfully credited $${dep.amount} to user ${dep.user_id}!`);
          await db.rpc("award_referral_bonus", { _referee_id: dep.user_id }).catch(() => {});

          // Fetch user's updated balance & notify Telegram if linked
          try {
            const { data: prof } = await db.from("profiles").select("balance").eq("id", dep.user_id).maybeSingle();
            const bal = prof?.balance != null ? Number(prof.balance).toFixed(2) : "0.00";

            const { data: tgAcct } = await db.from("telegram_accounts").select("telegram_id").eq("user_id", dep.user_id).maybeSingle();
            if (telegramToken && tgAcct?.telegram_id) {
              await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: tgAcct.telegram_id,
                  text: [
                    `━━━━━━━━━━━━━━━━━━━`,
                    `🎉 <b>DEPOSIT CONFIRMED!</b>`,
                    `━━━━━━━━━━━━━━━━━━━`,
                    `Your cryptocurrency recharge has been verified!`,
                    ``,
                    `💵 <b>Credited:</b> <code>$${Number(dep.amount).toFixed(2)}</code>`,
                    `💰 <b>Current Balance:</b> <code>$${bal}</code>`,
                    ``,
                    `⚡ <i>Your funds are ready for use immediately!</i>`,
                    `━━━━━━━━━━━━━━━━━━━`,
                  ].join("\n"),
                  parse_mode: "HTML",
                }),
              }).catch(() => {});
            }
          } catch (notifErr) {
            console.error(`[Deposit Reconciler] Notif error:`, notifErr.message);
          }
        }
      }
    }
  } catch (err) {
    console.error(`[Deposit Reconciler] Error:`, err.message);
  }
}

// Main execution loop
const runOnce = process.argv.includes("--once");

if (runOnce) {
  Promise.all([processActiveQueues(), reconcilePendingDeposits()]).then(() => {
    console.log("[Drip Worker] Single run completed.");
    process.exit(0);
  });
} else {
  console.log("[Drip Worker] Starting daemon loop (interval: 3 minutes, daily target: 10:00 AM Asia/Dhaka)...");
  processActiveQueues();
  reconcilePendingDeposits();
  setInterval(processActiveQueues, 3 * 60 * 1000);
  // Scan pending crypto deposits every 45 seconds
  setInterval(reconcilePendingDeposits, 45 * 1000);
}
