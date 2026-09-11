#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read .env file without any external dependency
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
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

if (!serviceKey) {
  console.log("No service key found in .env, announcements will be cleaned client-side by store.ts automatically.");
  process.exit(0);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

async function main() {
  console.log("Cleaning announcements in database...");
  const { data: rows, error } = await supabase
    .from("announcements")
    .select("id, title, body");

  if (error) {
    console.error("Database query note:", error.message || error);
    process.exit(0);
  }

  const seen = new Set();
  const toDelete = [];

  for (const r of rows || []) {
    let cleanTitle = (r.title || "")
      .replace(/🐲\s*/g, "⚡ ")
      .replace(/Cruzer\s*CC/gi, "Zoru Shop")
      .replace(/CruzerCC/gi, "Zoru Shop")
      .replace(/Cruzer/gi, "Zoru Shop")
      .replace(/Scorpion\s*Shop/gi, "Zoru Shop")
      .replace(/Scorpion/gi, "Zoru Shop")
      .replace(/dragon-fire delivery/gi, "instant automated delivery");

    let cleanBody = (r.body || "")
      .replace(/Cruzer\s*CC/gi, "Zoru Shop")
      .replace(/CruzerCC/gi, "Zoru Shop")
      .replace(/Cruzer/gi, "Zoru Shop")
      .replace(/Scorpion\s*Shop/gi, "Zoru Shop")
      .replace(/Scorpion/gi, "Zoru Shop");

    const key = `${cleanTitle}:::${cleanBody}`;
    if (seen.has(key)) {
      toDelete.push(r.id);
    } else {
      seen.add(key);
      if (cleanTitle !== r.title || cleanBody !== r.body) {
        await supabase
          .from("announcements")
          .update({ title: cleanTitle, body: cleanBody })
          .eq("id", r.id);
        console.log(`Updated announcement ID: ${r.id}`);
      }
    }
  }

  for (const id of toDelete) {
    await supabase.from("announcements").delete().eq("id", id);
    console.log(`Deleted duplicate announcement ID: ${id}`);
  }

  console.log("Database announcement cleanup completed.");
}

main().catch((err) => {
  console.error("Cleanup note:", err.message || err);
  process.exit(0);
});
