#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://api.zoru.cc";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";

if (!serviceKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY");
  process.exit(1);
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
    console.error("Error fetching announcements:", error);
    process.exit(1);
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
      .replace(/dragon-fire delivery/gi, "instant delivery");

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

  console.log("Done! Announcements cleaned up successfully.");
}

main().catch(console.error);
