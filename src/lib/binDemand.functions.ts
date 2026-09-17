import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("forbidden");
}

export interface BinDemandItem {
  id: string;
  bin: string;
  search_count: number;
  country: string | null;
  brand: string | null;
  bank: string | null;
  card_type: string | null;
  card_level: string | null;
  last_searched_at: string;
  in_stock: number;
}

export interface BinDemandSummary {
  totalSearches: number;
  uniqueBinsTracked: number;
  outOfStockDemanded: number;
  topCountry: string | null;
  topBrand: string | null;
  items: BinDemandItem[];
}

export const getBinDemandStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      search: z.string().optional(),
      onlyOutOfStock: z.boolean().optional(),
      limit: z.number().min(1).max(500).optional(),
    }).parse(input ?? {})
  )
  .handler(async ({ data, context }): Promise<BinDemandSummary> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;

    const limit = data.limit ?? 100;
    const filter = (data.search ?? "").trim().toLowerCase();

    // 1. Fetch from database
    let dbRows: any[] = [];
    try {
      let q = db
        .from("bin_searches")
        .select("id, bin, search_count, country, brand, bank, card_type, card_level, last_searched_at")
        .order("search_count", { ascending: false })
        .limit(limit);

      if (filter) {
        q = q.or(`bin.ilike.%${filter}%,brand.ilike.%${filter}%,country.ilike.%${filter}%,bank.ilike.%${filter}%`);
      }
      const { data: rows } = await q;
      if (Array.isArray(rows)) dbRows = rows;
    } catch {
      dbRows = [];
    }

    // 2. Merge with in-memory stats from bin-track.ts
    const { inMemoryBinStats } = await import("@/routes/api/public/bin-track");
    const mergedMap = new Map<string, any>();

    for (const r of dbRows) {
      mergedMap.set(r.bin, {
        id: r.id,
        bin: r.bin,
        search_count: Number(r.search_count ?? 1),
        country: r.country,
        brand: r.brand,
        bank: r.bank,
        card_type: r.card_type,
        card_level: r.card_level,
        last_searched_at: r.last_searched_at,
      });
    }

    for (const [bin, mem] of inMemoryBinStats.entries()) {
      if (filter && !bin.includes(filter) && !(mem.brand ?? "").toLowerCase().includes(filter) && !(mem.country ?? "").toLowerCase().includes(filter)) {
        continue;
      }
      const existing = mergedMap.get(bin);
      if (existing) {
        existing.search_count = Math.max(existing.search_count, mem.count);
        if (new Date(mem.last_at).toISOString() > existing.last_searched_at) {
          existing.last_searched_at = new Date(mem.last_at).toISOString();
        }
      } else {
        mergedMap.set(bin, {
          id: `mem-${bin}`,
          bin,
          search_count: mem.count,
          country: mem.country,
          brand: mem.brand,
          bank: mem.bank,
          card_type: mem.card_type,
          card_level: mem.card_level,
          last_searched_at: new Date(mem.last_at).toISOString(),
        });
      }
    }

    const allItems = [...mergedMap.values()].sort((a, b) => b.search_count - a.search_count);

    // 3. Check live stock for these BINs in products table
    const topBins = allItems.map((i) => i.bin);
    const stockMap = new Map<string, number>();

    if (topBins.length > 0) {
      try {
        const { data: prods } = await db
          .from("products")
          .select("bin, stock")
          .in("bin", topBins)
          .eq("active", true)
          .gt("stock", 0);

        for (const p of prods ?? []) {
          const b = String(p.bin ?? "");
          stockMap.set(b, (stockMap.get(b) ?? 0) + Number(p.stock ?? 1));
        }
      } catch {
        /* ignore */
      }
    }

    // Attach stock counts
    let finalItems: BinDemandItem[] = allItems.map((item) => ({
      ...item,
      in_stock: stockMap.get(item.bin) ?? 0,
    }));

    if (data.onlyOutOfStock) {
      finalItems = finalItems.filter((i) => i.in_stock === 0);
    }

    finalItems = finalItems.slice(0, limit);

    // Compute summary analytics
    let totalSearches = 0;
    let outOfStockDemanded = 0;
    const countryCounts = new Map<string, number>();
    const brandCounts = new Map<string, number>();

    for (const it of allItems) {
      totalSearches += it.search_count;
      if ((stockMap.get(it.bin) ?? 0) === 0) outOfStockDemanded++;
      if (it.country) countryCounts.set(it.country, (countryCounts.get(it.country) ?? 0) + it.search_count);
      if (it.brand) brandCounts.set(it.brand, (brandCounts.get(it.brand) ?? 0) + it.search_count);
    }

    let topCountry: string | null = null;
    let maxCountryCount = 0;
    for (const [c, n] of countryCounts.entries()) {
      if (n > maxCountryCount) {
        maxCountryCount = n;
        topCountry = c;
      }
    }

    let topBrand: string | null = null;
    let maxBrandCount = 0;
    for (const [b, n] of brandCounts.entries()) {
      if (n > maxBrandCount) {
        maxBrandCount = n;
        topBrand = b;
      }
    }

    return {
      totalSearches,
      uniqueBinsTracked: allItems.length,
      outOfStockDemanded,
      topCountry,
      topBrand,
      items: finalItems,
    };
  });

export const deleteBinDemandItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ bin: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;

    try {
      await db.from("bin_searches").delete().eq("bin", data.bin);
    } catch {
      /* ignore */
    }

    const { inMemoryBinStats } = await import("@/routes/api/public/bin-track");
    inMemoryBinStats.delete(data.bin);

    return { success: true };
  });
