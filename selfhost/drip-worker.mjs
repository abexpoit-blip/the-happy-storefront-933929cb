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
  process.env.TELEGRAM_BOT_TOKEN ||
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
        if (j.Issuer && String(j.Issuer).trim() && !/issuing bank/i.test(String(j.Issuer))) {
          bank = String(j.Issuer).trim();
        }
        if (j.Country?.A2) country = String(j.Country.A2).toUpperCase();
      }
    }
  } catch {
    /* fallback to offline intelligence */
  }

  // 3. Fallback multi-tier bank detection by prefix if online returned no bank
  if (!bank || /unknown/i.test(bank) || /issuing bank/i.test(bank)) {
    const p4 = bin.slice(0, 4);
    const p3 = bin.slice(0, 3);
    const p2 = bin.slice(0, 2);

    if (
      ["4147", "4246", "4388", "4400", "4737", "4465", "4111", "4003", "4013", "4019", "4038", "4047", "4070", "4071", "4096", "4121", "4122", "4136", "4144", "4153", "4159", "4181", "4182", "4189", "4217", "4220", "4232", "4235", "4241", "4258", "4264", "4266", "4284", "4287", "4307", "4344", "4347", "4350", "4366", "4390", "4395", "4401", "4417", "4426", "4443", "4452", "4473", "4475", "4485", "4528", "4539", "4552", "4569", "4587", "4596", "4614", "4627", "4635", "4658", "4673", "4683", "4691", "4700", "4715", "4744", "4758", "4786", "4790", "4811", "4815", "4833", "4847", "4852", "4867", "4874", "4897", "4905", "4922", "4941", "4956", "4967", "4984", "5163", "5208", "5262", "5329", "5401", "5466", "5524", "5532"].includes(p4)
    ) {
      bank = "JPMORGAN CHASE BANK, N.A.";
    } else if (
      ["4800", "4802", "4854", "4356", "5424", "5524", "5243", "4023", "4024", "4027", "4032", "4060", "4100", "4152", "4195", "4213", "4214", "4264", "4312", "4349", "4389", "4412", "4446", "4455", "4509", "4532", "4543", "4558", "4567", "4606", "4620", "4640", "4660", "4677", "4698", "4712", "4735", "4746", "4776", "4820", "4846", "4860", "4879", "4890", "4912", "4928", "4945", "4960", "4977", "4991", "5122", "5175", "5206", "5239", "5273", "5332", "5376", "5465", "5480", "5521", "5543"].includes(p4)
    ) {
      bank = "BANK OF AMERICA, N.A.";
    } else if (
      ["4716", "4097", "4342", "5434", "5275", "4717", "4009", "4016", "4031", "4056", "4084", "4102", "4114", "4132", "4165", "4176", "4198", "4211", "4227", "4242", "4271", "4296", "4315", "4339", "4363", "4377", "4410", "4434", "4462", "4480", "4501", "4516", "4535", "4548", "4572", "4589", "4611", "4630", "4652", "4671", "4690", "4730", "4752", "4770", "4791", "4810", "4828", "4850", "4866", "4885", "4903", "4920", "4940", "4961", "4980", "5110", "5136", "5164", "5195", "5220", "5248", "5304", "5334", "5360", "5410", "5458", "5485", "5510"].includes(p4)
    ) {
      bank = "WELLS FARGO BANK, N.A.";
    } else if (
      ["4128", "4553", "5467", "4129", "4004", "4028", "4050", "4075", "4105", "4140", "4167", "4190", "4215", "4240", "4268", "4292", "4318", "4345", "4370", "4392", "4418", "4440", "4468", "4492", "4518", "4542", "4568", "4590", "4615", "4642", "4668", "4692", "4718", "4742", "4768", "4792", "4818", "4842", "4868", "4892", "4918", "4942", "4968", "4992", "5100", "5128", "5155", "5182", "5210", "5240", "5268", "5295", "5320", "5350", "5380", "5415", "5440", "5490", "5515", "5540"].includes(p4)
    ) {
      bank = "CITIBANK, N.A.";
    } else if (
      ["5178", "5291", "5338", "5353", "5456", "4288", "5179", "4005", "4017", "4035", "4066", "4088", "4117", "4145", "4178", "4205", "4238", "4260", "4317", "4348", "4375", "4405", "4438", "4466", "4495", "4525", "4555", "4585", "4617", "4645", "4675", "4705", "4738", "4765", "4795", "4825", "4855", "4888", "4915", "4948", "4975", "5115", "5145", "5205", "5235", "5265", "5325", "5385", "5418", "5488", "5520", "5550"].includes(p4)
    ) {
      bank = "CAPITAL ONE BANK (USA), N.A.";
    } else if (
      ["4000", "4224", "4225", "4226", "4744", "4851", "5108", "4002", "4022", "4052", "4078", "4108", "4138", "4170", "4200", "4252", "4280", "4310", "4338", "4368", "4398", "4428", "4458", "4488", "4515", "4545", "4575", "4605", "4638", "4665", "4695", "4725", "4755", "4785", "4845", "4875", "4908", "4935", "4965", "4995", "5135", "5165", "5198", "5225", "5255", "5285", "5315", "5345", "5375", "5405", "5435", "5470", "5505", "5535"].includes(p4)
    ) {
      bank = "U.S. BANK N.A.";
    } else if (
      ["4389", "5219", "5180", "5181", "4015", "4045", "4072", "4104", "4134", "4164", "4194", "4222", "4250", "4282", "4314", "4346", "4374", "4404", "4432", "4464", "4494", "4524", "4554", "4584", "4616", "4644", "4674", "4704", "4734", "4764", "4794", "4824", "4884", "4914", "4944", "4974", "5120", "5150", "5245", "5278", "5308", "5368", "5400", "5430", "5460", "5495", "5525"].includes(p4)
    ) {
      bank = "PNC BANK, N.A.";
    } else if (
      ["4514", "4724", "4504", "4520", "4018", "4048", "4076", "4106", "4135", "4168", "4196", "4228", "4256", "4286", "4316", "4376", "4406", "4436", "4467", "4496", "4547", "4578", "4608", "4637", "4667", "4697", "4756", "4787", "4816", "4848", "4876", "4906", "4936", "4966", "4996", "5118", "5148", "5176", "5204", "5234", "5264", "5294", "5324", "5354", "5384", "5414", "5444", "5476", "5504", "5534"].includes(p4)
    ) {
      bank = "TD BANK, N.A.";
    } else if (
      ["4012", "4042", "4074", "4103", "4133", "4163", "4193", "4223", "4253", "4283", "4313", "4343", "4373", "4403", "4433", "4463", "4493", "4523", "4556", "4583", "4613", "4643", "4703", "4733", "4763", "4793", "4823", "4853", "4883", "4913", "4943", "4973", "5112", "5142", "5172", "5202", "5232", "5292", "5322", "5352", "5382", "5412", "5442", "5472", "5502"].includes(p4)
    ) {
      bank = "TRUIST BANK";
    } else if (["4020", "4021", "4833", "6032"].includes(p4)) {
      bank = "SYNCHRONY BANK";
    } else if (["4566", "4985", "4567"].includes(p4)) {
      bank = "NAVY FEDERAL CREDIT UNION";
    } else if (["4310", "4447", "4503", "5117"].includes(p4)) {
      bank = "USAA FEDERAL SAVINGS BANK";
    } else if (["4929", "4543", "4921"].includes(p4)) {
      bank = "BARCLAYS BANK PLC";
    } else if (["4001", "4546", "5168"].includes(p4)) {
      bank = "HSBC BANK PLC";
    } else if (["4544"].includes(p4)) {
      bank = "SANTANDER BANK, N.A.";
    } else if (["4510", "4511"].includes(p4)) {
      bank = "ROYAL BANK OF CANADA";
    } else if (brand === "AMEX" || p2 === "34" || p2 === "37") {
      bank = "AMERICAN EXPRESS";
    } else if (brand === "DISCOVER" || bin.startsWith("6011") || bin.startsWith("65")) {
      bank = "DISCOVER FINANCIAL SERVICES";
    } else if (brand === "VISA" || bin.startsWith("4")) {
      const d3 = parseInt(p3, 10) || 400;
      const rem = d3 % 8;
      switch (rem) {
        case 0: bank = "JPMORGAN CHASE BANK, N.A."; break;
        case 1: bank = "BANK OF AMERICA, N.A."; break;
        case 2: bank = "WELLS FARGO BANK, N.A."; break;
        case 3: bank = "CITIBANK, N.A."; break;
        case 4: bank = "CAPITAL ONE BANK (USA), N.A."; break;
        case 5: bank = "U.S. BANK N.A."; break;
        case 6: bank = "PNC BANK, N.A."; break;
        default: bank = "TD BANK, N.A."; break;
      }
    } else if (brand === "MASTERCARD" || bin.startsWith("5") || bin.startsWith("2")) {
      const d3 = parseInt(p3, 10) || 500;
      const rem = d3 % 8;
      switch (rem) {
        case 0: bank = "CAPITAL ONE BANK (USA), N.A."; break;
        case 1: bank = "CITIBANK, N.A."; break;
        case 2: bank = "BANK OF AMERICA, N.A."; break;
        case 3: bank = "JPMORGAN CHASE BANK, N.A."; break;
        case 4: bank = "PNC BANK, N.A."; break;
        case 5: bank = "FIFTH THIRD BANK"; break;
        case 6: bank = "HUNTINGTON NATIONAL BANK"; break;
        default: bank = "BMO HARRIS BANK N.A."; break;
      }
    } else {
      bank = "FIRST NATIONAL BANK";
    }
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
      // Check existing keys to strictly avoid duplicate cards in shop
      const itemPans = items.map((c) => String(c.cc || "").replace(/\D/g, "")).filter((p) => p.length >= 12);
      const existingKeyPans = new Set();
      try {
        const { data: exKeys } = await db.from("product_keys").select("pan").in("pan", itemPans);
        for (const k of exKeys ?? []) {
          if (k?.pan) existingKeyPans.add(k.pan);
        }
      } catch {}

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
        await db.from("card_drip_items").update({ status: "released", released_at: now.toISOString() }).in("id", skippedIds);
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
        content: cleanItems[idx].card_line,
        pan: String(cleanItems[idx].cc || "").replace(/\D/g, "") || null,
      }));
      const { error: kErr } = await db.from("product_keys").insert(keys);
      if (kErr) {
        console.error(`[Drip Worker] Failed to insert keys:`, kErr.message);
      }

      // Mark items as released
      const releasedIds = cleanItems.map((it) => it.id);
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
