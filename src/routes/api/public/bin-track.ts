import { createFileRoute } from "@tanstack/react-router";

// In-memory fallback cache so demand stats persist even if DB migration is delayed
interface MemoryBinStat {
  bin: string;
  count: number;
  country: string | null;
  brand: string | null;
  bank: string | null;
  card_type: string | null;
  card_level: string | null;
  last_at: number;
}

export const inMemoryBinStats = new Map<string, MemoryBinStat>();

export const Route = createFileRoute("/api/public/bin-track")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const raw = await request.text();
          let body: Record<string, unknown> = {};
          try {
            body = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
          }

          const rawBin = String(body.bin ?? "").replace(/\D/g, "").slice(0, 8);
          if (rawBin.length < 6) {
            return Response.json({ ok: false, error: "bin_too_short" }, { status: 400 });
          }

          const brand = body.brand ? String(body.brand).trim().toUpperCase() : null;
          const country = body.country ? String(body.country).trim().toUpperCase() : null;
          const bank = body.bank ? String(body.bank).trim() : null;
          const card_type = body.card_type ? String(body.card_type).trim().toUpperCase() : null;
          const card_level = body.card_level ? String(body.card_level).trim().toUpperCase() : null;

          // 1. Update in-memory tracker (instant, never fails)
          const mem = inMemoryBinStats.get(rawBin);
          if (mem) {
            mem.count += 1;
            mem.last_at = Date.now();
            if (brand && !mem.brand) mem.brand = brand;
            if (country && !mem.country) mem.country = country;
            if (bank && !mem.bank) mem.bank = bank;
            if (card_type && !mem.card_type) mem.card_type = card_type;
            if (card_level && !mem.card_level) mem.card_level = card_level;
          } else {
            inMemoryBinStats.set(rawBin, {
              bin: rawBin,
              count: 1,
              country,
              brand,
              bank,
              card_type,
              card_level,
              last_at: Date.now(),
            });
          }

          // 2. Persist to Supabase bin_searches table
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const db = supabaseAdmin as any;

            const { data: existing } = await db
              .from("bin_searches")
              .select("id, search_count, country, brand, bank, card_type, card_level")
              .eq("bin", rawBin)
              .maybeSingle();

            if (existing) {
              await db
                .from("bin_searches")
                .update({
                  search_count: (existing.search_count ?? 1) + 1,
                  last_searched_at: new Date().toISOString(),
                  country: existing.country || country,
                  brand: existing.brand || brand,
                  bank: existing.bank || bank,
                  card_type: existing.card_type || card_type,
                  card_level: existing.card_level || card_level,
                })
                .eq("id", existing.id);
            } else {
              await db.from("bin_searches").insert({
                bin: rawBin,
                search_count: 1,
                last_searched_at: new Date().toISOString(),
                country,
                brand,
                bank,
                card_type,
                card_level,
              });
            }
          } catch {
            // DB write may fail if table is not yet migrated; in-memory buffer holds the data safely
          }

          return Response.json({ ok: true, bin: rawBin });
        } catch (e) {
          return Response.json({ ok: false, error: e instanceof Error ? e.message : "server_error" }, { status: 500 });
        }
      },
    },
  },
});
