#!/usr/bin/env node
/**
 * Standalone Utility: Re-enrich Products Bank & BIN Metadata
 * Scans products table, looks up real issuing bank & metadata from global BIN database (HandyAPI),
 * and updates bank, brand, card_level, card_type, country in Supabase.
 * 
 * Usage:
 *   node selfhost/enrich-banks.mjs [--all] [--limit=5000]
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

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://api.zoru.cc";
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

if (!serviceKey) {
  console.error("❌ Error: SUPABASE_SERVICE_ROLE_KEY is required in .env or /etc/zoru/backend.env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

const binCache = new Map();

async function lookupBin(bin) {
  const cleanBin = String(bin).replace(/\D/g, "").slice(0, 6);
  if (cleanBin.length < 6) return null;
  if (binCache.has(cleanBin)) return binCache.get(cleanBin);

  try {
    const res = await fetch(`https://data.handyapi.com/bin/${cleanBin}`, {
      headers: { "User-Agent": "ZoruShop-Enricher/1.0", Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.Status === "SUCCESS") {
        const info = {
          bank: (data.Issuer || "").trim() || null,
          brand: (data.Scheme || "").toUpperCase().trim() || null,
          card_type: (data.Type || "CREDIT").toUpperCase().trim(),
          card_level: (data.CardTier || "CLASSIC").toUpperCase().trim(),
          country: (data.Country?.A2 || "").toUpperCase().trim() || null,
        };
        binCache.set(cleanBin, info);
        return info;
      }
    }
  } catch (err) {
    // network or timeout
  }

  binCache.set(cleanBin, null);
  return null;
}

async function main() {
  console.log("🔍 Scanning products to re-enrich real bank names...");
  
  // Select distinct BINs that need enrichment (or all active products)
  const { data: prods, error } = await supabase
    .from("products")
    .select("id, bin, bank, brand, country")
    .not("bin", "is", null)
    .limit(10000);

  if (error) {
    console.error("❌ Failed to query products:", error.message);
    process.exit(1);
  }

  if (!prods || prods.length === 0) {
    console.log("✅ No products found in database.");
    return;
  }

  console.log(`📦 Found ${prods.length} total products. Extracting distinct 6-digit BINs...`);
  const binToProds = new Map();
  for (const p of prods) {
    const b = String(p.bin).replace(/\D/g, "").slice(0, 6);
    if (b.length === 6) {
      const list = binToProds.get(b) || [];
      list.push(p);
      binToProds.set(b, list);
    }
  }

  console.log(`🌐 Found ${binToProds.size} unique BINs to inspect.`);
  let updatedCount = 0;
  let binIdx = 0;

  for (const [bin, productList] of binToProds.entries()) {
    binIdx++;
    process.stdout.write(`[${binIdx}/${binToProds.size}] Inspecting BIN ${bin}... `);
    const info = await lookupBin(bin);

    if (info && info.bank) {
      // Update all products with this BIN
      const pids = productList.map(p => p.id);
      const updateData = { bank: info.bank };
      if (info.brand) updateData.brand = info.brand;
      if (info.card_type) updateData.card_type = info.card_type;
      if (info.card_level) updateData.card_level = info.card_level;
      if (info.country) updateData.country = info.country;

      const { error: updErr } = await supabase
        .from("products")
        .update(updateData)
        .in("id", pids);

      if (updErr) {
        console.log(`❌ Update failed: ${updErr.message}`);
      } else {
        console.log(`✅ ${info.bank} (${info.country || "?"}) -> updated ${pids.length} items`);
        updatedCount += pids.length;
      }
    } else {
      console.log(`⚠️ No bank issuer found in global DB.`);
    }

    // Small delay to be polite to the API
    await new Promise((r) => setTimeout(r, 80));
  }

  console.log(`\n🎉 Finished! Re-enriched ${updatedCount} product rows with real issuing bank names.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
