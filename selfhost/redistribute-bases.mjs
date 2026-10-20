#!/usr/bin/env node
/**
 * Zoru Shop — Base & Date Reconciler
 *
 * Redistributes any inadvertently future-dated or December-dated cards
 * into the 10-day historical window: 2026_10_10 to 2026_10_19.
 *
 * Also adjusts announcements so no announcement shows a future date.
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

loadEnv(join(__dirname, "../.env"));

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://api.zoru.cc";
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

if (!serviceKey) {
  console.error("No service key found.");
  process.exit(1);
}

const db = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

// Target 10 dates: 2026-10-10 to 2026-10-19
const TARGET_DATES = [
  { str: "2026_10_10", iso: "2026-10-10T06:00:00.000Z" },
  { str: "2026_10_11", iso: "2026-10-11T06:00:00.000Z" },
  { str: "2026_10_12", iso: "2026-10-12T06:00:00.000Z" },
  { str: "2026_10_13", iso: "2026-10-13T06:00:00.000Z" },
  { str: "2026_10_14", iso: "2026-10-14T06:00:00.000Z" },
  { str: "2026_10_15", iso: "2026-10-15T06:00:00.000Z" },
  { str: "2026_10_16", iso: "2026-10-16T06:00:00.000Z" },
  { str: "2026_10_17", iso: "2026-10-17T06:00:00.000Z" },
  { str: "2026_10_18", iso: "2026-10-18T06:00:00.000Z" },
  { str: "2026_10_19", iso: "2026-10-19T06:00:00.000Z" },
];

async function main() {
  console.log("==> Fetching products with misconfigured future/December base dates...");

  // Fetch all products with base matching 2026_12_* or 2026_10_2*
  const { data: allProds, error: fetchErr } = await db
    .from("products")
    .select("id, base, brand, created_at")
    .or("base.ilike.ADMIN_2026_12_%,base.ilike.ADMIN_2026_10_21_%,base.ilike.ADMIN_2026_10_22_%,base.ilike.ADMIN_2026_10_23_%,base.ilike.ADMIN_2026_10_24_%,base.ilike.ADMIN_2026_10_25_%")
    .order("id");

  if (fetchErr) {
    console.error("Fetch error:", fetchErr);
    process.exit(1);
  }

  console.log(`Found ${allProds.length} cards to redistribute.`);
  if (allProds.length === 0) {
    console.log("No misconfigured cards found. Everything is already up to date.");
    return;
  }

  // Shuffle / mix slightly so cards from various batches blend naturally across days
  const mixed = [...allProds];
  for (let i = mixed.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [mixed[i], mixed[j]] = [mixed[j], mixed[i]];
  }

  // Distribute across the 10 days
  const updates = [];
  const countsPerDay = new Map();

  for (let i = 0; i < mixed.length; i++) {
    const p = mixed[i];
    const targetIdx = i % TARGET_DATES.length;
    const target = TARGET_DATES[targetIdx];
    const brand = p.brand || "OTHER";
    const newBase = `ADMIN_${target.str}_${brand}`;

    countsPerDay.set(target.str, (countsPerDay.get(target.str) || 0) + 1);

    updates.push({
      id: p.id,
      base: newBase,
      created_at: target.iso,
    });
  }

  console.log("Planned distribution across days:");
  for (const [day, count] of countsPerDay.entries()) {
    console.log(`  • ${day}: +${count} cards`);
  }

  // Batch update in chunks of 50
  const CHUNK = 50;
  for (let c = 0; c < updates.length; c += CHUNK) {
    const slice = updates.slice(c, c + CHUNK);
    await Promise.all(
      slice.map((item) =>
        db
          .from("products")
          .update({ base: item.base, created_at: item.created_at })
          .eq("id", item.id)
      )
    );
    console.log(`Updated ${Math.min(c + CHUNK, updates.length)} / ${updates.length} cards...`);
  }

  console.log("==> Card base & date updates complete!");

  // Fix announcements: find any future or December announcements
  console.log("==> Reconciling announcements...");
  const { data: annList, error: aErr } = await db
    .from("announcements")
    .select("id, title, body, created_at")
    .order("created_at", { ascending: false });

  if (!aErr && annList) {
    for (const a of annList) {
      const cDate = a.created_at || "";
      let needsFix = false;
      let newDate = cDate;
      let newBody = a.body || "";
      let newTitle = a.title || "";

      // Check if dated in December 2026 or after October 20 2026
      if (cDate.startsWith("2026-12")) {
        needsFix = true;
        newDate = "2026-10-10T06:00:00.000Z";
        newBody = newBody.replace(/2026_12_/g, "2026_10_");
      } else if (cDate.startsWith("2026-10-25")) {
        needsFix = true;
        newDate = "2026-10-19T06:00:00.000Z";
      } else if (cDate.startsWith("2026-10-24")) {
        needsFix = true;
        newDate = "2026-10-18T18:00:00.000Z";
      } else if (cDate.startsWith("2026-10-23")) {
        needsFix = true;
        newDate = "2026-10-18T06:00:00.000Z";
      } else if (cDate.startsWith("2026-10-22")) {
        needsFix = true;
        newDate = "2026-10-17T06:00:00.000Z";
      } else if (cDate.startsWith("2026-10-21")) {
        needsFix = true;
        newDate = "2026-10-16T06:00:00.000Z";
      }

      if (needsFix) {
        // also clean up any future base references in body
        newBody = newBody
          .replace(/2026_10_25/g, "2026_10_19")
          .replace(/2026_10_24/g, "2026_10_18")
          .replace(/2026_10_23/g, "2026_10_17")
          .replace(/2026_10_22/g, "2026_10_16")
          .replace(/2026_10_21/g, "2026_10_15");

        await db
          .from("announcements")
          .update({
            created_at: newDate,
            body: newBody,
            title: newTitle,
          })
          .eq("id", a.id);
        console.log(`Reconciled announcement: ${a.id} -> ${newDate.slice(0, 10)}`);
      }
    }
  }

  console.log("==> All bases and announcements are now strictly between 2026_10_10 and 2026_10_20!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
