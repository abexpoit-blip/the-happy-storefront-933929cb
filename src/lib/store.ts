import { supabase } from "@/integrations/supabase/client";

export type DeliveryType = "key" | "download" | "instant";

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  sort_order: number;
  active: boolean;
}

export interface Product {
  id: string;
  category_id: string | null;
  title: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  image_url: string | null;
  price: number;
  compare_at_price: number | null;
  delivery_type: DeliveryType;
  download_url: string | null;
  instant_content: string | null;
  featured: boolean;
  active: boolean;
  sold_count: number;
  stock: number;
  created_at: string;
  bin: string | null;
  brand: string | null;
  country: string | null;
  base: string | null;
  exp_month: string | null;
  exp_year: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  has_phone: boolean;
  has_email: boolean;
  refundable: boolean;
  /** Present after the last-digits migration; optional so generated types stay compatible. */
  last_digits?: string | null;
}


export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  title: string;
  unit_price: number;
  quantity: number;
  delivered_content: string | null;
}

export interface Order {
  id: string;
  user_id: string;
  order_no: string;
  status: string;
  total: number;
  created_at: string;
  order_items?: OrderItem[];
}

export interface Deposit {
  id: string;
  user_id: string;
  amount: number;
  method: string;
  status: string;
  reference: string | null;
  admin_note: string | null;
  created_at: string;
}

export interface PaymentMethod {
  id: string;
  name: string;
  code: string;
  instructions: string | null;
  address: string | null;
  active: boolean;
  sort_order: number;
}

export interface AdminUserRow {
  id: string;
  username: string;
  email: string | null;
  balance: number;
  blocked: boolean;
  created_at: string;
  roles: string[];
}

const num = (v: unknown) => Number(v ?? 0);

/* ---------------- catalog ---------------- */

export const listCategories = async (includeInactive = false): Promise<Category[]> => {
  let q = supabase.from("categories").select("*").order("sort_order");
  if (!includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Category[];
};

const PRODUCT_COLUMNS =
  "id, category_id, title, slug, price, compare_at_price, active, stock, bin, brand, country, state, city, zip, exp_month, exp_year, base, refundable, card_type, card_level, bank, created_at";

let productCache: { at: number; data: Product[] } | null = null;
const CACHE_TTL_MS = 15_000; // 15s short RAM cache (prevents duplicate queries on tab switches without showing stale data)

export const invalidateProductCache = () => {
  productCache = null;
};

/** Performance cap: keeps client and Supabase DB snappy and resilient even under huge traffic */
export const PRODUCT_FETCH_LIMIT = 3000;

export const listProducts = async (
  opts: {
    categoryId?: string | null;
    search?: string;
    includeInactive?: boolean;
    limit?: number;
    forceFresh?: boolean;
    onBatchProgress?: (batch: Product[], isFinal: boolean) => void;
  } = {},
) => {
  const isDefaultFetch = !opts.categoryId && !opts.search && !opts.includeInactive && !opts.limit;
  
  // Fast in-memory cache check (0ms) - only if not forced fresh
  if (isDefaultFetch && !opts.forceFresh && productCache && Date.now() - productCache.at < CACHE_TTL_MS) {
    opts.onBatchProgress?.(productCache.data, true);
    return productCache.data;
  }

  const CHUNK_SIZE = 1000;
  const maxLimit = Math.min(opts.limit ?? PRODUCT_FETCH_LIMIT, PRODUCT_FETCH_LIMIT);

  const buildQuery = (withCount = false) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any)
      .from("products")
      .select(PRODUCT_COLUMNS, withCount ? { count: "exact" } : undefined)
      .order("created_at", { ascending: false });

    // A sold-out card must never stay on the shelf, even if `active` was not flipped.
    if (!opts.includeInactive) q = q.eq("active", true).or("delivery_type.neq.key,stock.gt.0");
    if (opts.categoryId) q = q.eq("category_id", opts.categoryId);
    if (opts.search?.trim()) q = q.ilike("title", `%${opts.search.trim()}%`);
    return q;
  };

  // If specific small limit was explicitly requested (e.g. 50 or 100)
  if (opts.limit && opts.limit <= CHUNK_SIZE) {
    const { data, error } = await buildQuery().range(0, opts.limit - 1);
    if (error) throw error;
    const mapped = ((data ?? []) as Record<string, unknown>[]).map((p) => ({
      ...p,
      price: num(p.price as number | string),
      compare_at_price: p.compare_at_price == null ? null : num(p.compare_at_price as number | string),
    })) as Product[];
    opts.onBatchProgress?.(mapped, true);
    return mapped;
  }

  // Fetch initial batch (0..999) WITH count on the first request only
  const firstRes = await buildQuery(true).range(0, CHUNK_SIZE - 1);
  if (firstRes.error) throw firstRes.error;
  const firstBatch = (firstRes.data ?? []) as Record<string, unknown>[];

  const firstMapped = firstBatch.map((p) => ({
    ...p,
    price: num(p.price as number | string),
    compare_at_price: p.compare_at_price == null ? null : num(p.compare_at_price as number | string),
  })) as Product[];

  // Stream first batch immediately to UI so user sees products in <100ms!
  const isFinal = firstBatch.length < CHUNK_SIZE || (firstRes.count != null && firstRes.count <= CHUNK_SIZE);
  opts.onBatchProgress?.(firstMapped, isFinal);

  // If 1000 or fewer cards exist, return immediately
  if (isFinal) {
    if (isDefaultFetch) {
      productCache = { at: Date.now(), data: firstMapped };
    }
    return firstMapped;
  }

  // If more cards exist, fetch up to maxLimit in minimal parallel chunks
  const totalCount = Math.min(firstRes.count ?? maxLimit, maxLimit);
  const allRows = [...firstMapped];
  const probeRanges: [number, number][] = [];

  for (let from = CHUNK_SIZE; from < totalCount; from += CHUNK_SIZE) {
    probeRanges.push([from, Math.min(from + CHUNK_SIZE - 1, totalCount - 1)]);
  }

  if (probeRanges.length > 0) {
    const remainingPages = await Promise.all(
      probeRanges.map(([from, to]) =>
        buildQuery()
          .range(from, to)
          .then((r: { data: Record<string, unknown>[] | null; error: unknown }) => {
            if (r.error) throw r.error;
            return (r.data ?? []) as Record<string, unknown>[];
          }),
      ),
    );

    for (const page of remainingPages) {
      if (page.length > 0) {
        const pageMapped = page.map((p: Record<string, unknown>) => ({
          ...p,
          price: num(p.price as number | string),
          compare_at_price: p.compare_at_price == null ? null : num(p.compare_at_price as number | string),
        })) as Product[];
        allRows.push(...pageMapped);
      }
    }
  }

  const finalMapped = allRows as Product[];
  opts.onBatchProgress?.(finalMapped, true);

  if (isDefaultFetch) {
    productCache = { at: Date.now(), data: finalMapped };
  }
  return finalMapped;
};


export const purchaseProduct = async (productId: string, quantity: number) => {
  const { data, error } = await supabase.rpc("purchase_product", { _product_id: productId, _quantity: quantity });
  if (error) throw new Error(translatePurchaseError(error.message));
  return data as string;
};

/** Buy several cards atomically in ONE order with one order item per card. */
export const purchaseCart = async (productIds: string[]): Promise<string | null> => {
  const uniqueIds = [...new Set(productIds)];
  if (uniqueIds.length === 0) throw new Error("Select at least one card");
  if (uniqueIds.length !== productIds.length) throw new Error("Duplicate cards were removed. Please refresh your cart and try again.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("purchase_cart", { _product_ids: uniqueIds });
  if (!error) return data as string;
  const msg = String(error.message ?? "");
  const missing = msg.includes("purchase_cart") || msg.includes("function") || msg.includes("404");
  if (missing) throw new Error("Multi-card checkout is not installed on the server. Please contact support.");
  throw new Error(translatePurchaseError(msg));
};


/** Purchase then return the actually delivered content (keys / link / text). */
export const purchaseAndDeliver = async (
  productId: string,
  quantity = 1,
): Promise<{ orderId: string; content: string }> => {
  const orderId = await purchaseProduct(productId, quantity);
  const { data, error } = await supabase
    .from("order_items")
    .select("delivered_content, title")
    .eq("order_id", orderId);
  if (error) throw error;
  const content = (data ?? [])
    .map((i) => (i.delivered_content ?? "").trim())
    .filter(Boolean)
    .join("\n");
  return { orderId, content };
};


/** Buy checking credits with the account balance ($1 = 1000 credits). */
export const buyCheckCredits = async (usd: number): Promise<number> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("buy_check_credits", { _usd: usd });
  if (error) throw new Error(translatePurchaseError(error.message));
  return Number(data ?? 0);
};

export const translatePurchaseError = (msg: string) => {
  if (msg.includes("insufficient_credits")) return "Not enough check credits. Buy credits on the Checker page.";
  if (msg.includes("insufficient_balance")) return "Недостаточно средств на балансе.";
  if (msg.includes("out_of_stock")) return "Товар закончился.";
  if (msg.includes("product_unavailable")) return "Товар недоступен.";
  if (msg.includes("invalid_quantity")) return "Некорректное количество.";
  if (msg.includes("not_authenticated")) return "Войдите в аккаунт.";
  return msg;
};

/* ---------------- orders ---------------- */

export const listMyOrders = async (): Promise<Order[]> => {
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Order[];
};

/* ---------------- deposits ---------------- */

export const listPaymentMethods = async (includeInactive = false): Promise<PaymentMethod[]> => {
  let q = supabase.from("payment_methods").select("*").order("sort_order");
  if (!includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as PaymentMethod[];
};

export const listMyDeposits = async (): Promise<Deposit[]> => {
  const { data, error } = await supabase.from("deposits").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Deposit[];
};

export const createDeposit = async (input: { amount: number; method: string; reference: string }) => {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Войдите в аккаунт.");
  const { error } = await supabase.from("deposits").insert({
    user_id: auth.user.id,
    amount: input.amount,
    method: input.method,
    reference: input.reference,
    status: "pending",
  });
  if (error) throw error;
};

/* ---------------- admin ---------------- */

export const adminListUsers = async (): Promise<AdminUserRow[]> => {
  const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
    supabase.from("profiles").select("id, username, email, balance, blocked, created_at").order("created_at", { ascending: false }),
    supabase.from("user_roles").select("user_id, role"),
  ]);
  if (pErr) throw pErr;
  if (rErr) throw rErr;
  const byUser = new Map<string, string[]>();
  (roles ?? []).forEach((r) => {
    const list = byUser.get(r.user_id) ?? [];
    list.push(r.role as string);
    byUser.set(r.user_id, list);
  });
  return (profiles ?? []).map((p) => ({
    id: p.id,
    username: p.username,
    email: p.email,
    balance: num(p.balance),
    blocked: Boolean(p.blocked),
    created_at: p.created_at,
    roles: byUser.get(p.id) ?? [],
  }));
};

export const adminAdjustBalance = async (userId: string, amount: number, description: string) => {
  const { error } = await supabase.rpc("admin_adjust_balance", { _user_id: userId, _amount: amount, _description: description });
  if (error) throw error;
};

export const adminSetRole = async (userId: string, role: "admin" | "seller" | "buyer", grant: boolean) => {
  const { error } = await supabase.rpc("admin_set_role", { _user_id: userId, _role: role, _grant: grant });
  if (error) throw error;
};

export const adminSetBlocked = async (userId: string, blocked: boolean) => {
  const { error } = await supabase.from("profiles").update({ blocked }).eq("id", userId);
  if (error) throw error;
};

export const adminListDeposits = async (): Promise<(Deposit & { username?: string })[]> => {
  const { data, error } = await supabase.from("deposits").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  const ids = [...new Set((data ?? []).map((d) => d.user_id))];
  if (ids.length === 0) return [];
  const { data: profs } = await supabase.from("profiles").select("id, username").in("id", ids);
  const nameById = new Map((profs ?? []).map((p) => [p.id, p.username]));
  return (data ?? []).map((d) => ({ ...d, amount: num(d.amount), username: nameById.get(d.user_id) })) as (Deposit & { username?: string })[];
};

export const adminSetDepositStatus = async (id: string, status: string, note?: string) => {
  const { error } = await supabase.rpc("admin_set_deposit_status", { _deposit_id: id, _status: status, _note: note });
  if (error) throw error;
};

export const adminListOrders = async (): Promise<(Order & { username?: string })[]> => {
  const { data, error } = await supabase.from("orders").select("*, order_items(*)").order("created_at", { ascending: false }).limit(300);
  if (error) throw error;
  const ids = [...new Set((data ?? []).map((o) => o.user_id))];
  if (ids.length === 0) return [];
  const { data: profs } = await supabase.from("profiles").select("id, username").in("id", ids);
  const nameById = new Map((profs ?? []).map((p) => [p.id, p.username]));
  return (data ?? []).map((o) => ({ ...o, username: nameById.get(o.user_id) })) as unknown as (Order & { username?: string })[];
};

export const adminStats = async () => {
  const [users, products, orders, deposits] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase.from("orders").select("total"),
    supabase.from("deposits").select("amount, status"),
  ]);
  const revenue = (orders.data ?? []).reduce((s, o) => s + num(o.total), 0);
  const pendingDeposits = (deposits.data ?? []).filter((d) => d.status === "pending").length;
  return {
    users: users.count ?? 0,
    products: products.count ?? 0,
    orders: (orders.data ?? []).length,
    revenue,
    pendingDeposits,
  };
};

/* ---------------- site settings ---------------- */

export const readSiteSettings = async (): Promise<Record<string, string>> => {
  const { data, error } = await supabase.from("site_settings").select("key, value");
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value ?? ""]));
};

export const writeSiteSetting = async (key: string, value: string) => {
  const { error } = await supabase.from("site_settings").upsert({ key, value }, { onConflict: "key" });
  if (error) throw error;
};

/* ---------------- admin: catalog ---------------- */

export interface ProductInput {
  id?: string;
  category_id: string | null;
  title: string;
  slug: string;
  short_description?: string | null;
  description?: string | null;
  image_url?: string | null;
  price: number;
  compare_at_price?: number | null;
  delivery_type: DeliveryType;
  download_url?: string | null;
  instant_content?: string | null;
  featured?: boolean;
  active?: boolean;
  bin?: string | null;
  brand?: string | null;
  country?: string | null;
  base?: string | null;
  exp_month?: string | null;
  exp_year?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  has_phone?: boolean;
  has_email?: boolean;
  refundable?: boolean;
}

export const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || `item-${Date.now()}`;

export const adminSaveProduct = async (input: ProductInput): Promise<string> => {
  if (input.id) {
    const { id, ...rest } = input;
    const { error } = await supabase.from("products").update(rest).eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await supabase.from("products").insert(input).select("id").single();
  if (error) throw error;
  return data.id as string;
};

export const adminDeleteProduct = async (id: string) => {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw error;
};

export const adminSaveCategory = async (input: { id?: string; name: string; slug: string; icon?: string | null; sort_order?: number; active?: boolean }) => {
  if (input.id) {
    const { id, ...rest } = input;
    const { error } = await supabase.from("categories").update(rest).eq("id", id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("categories").insert(input);
  if (error) throw error;
};

export const adminDeleteCategory = async (id: string) => {
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw error;
};

/** Bulk-add card/key lines to a product and re-sync its stock. */
export const adminAddKeys = async (productId: string, lines: string[]) => {
  const rows = lines
    .map((l) => l.trim())
    .filter(Boolean)
    .map((content) => {
      const match = content.match(/[0-9]{12,19}/);
      return { product_id: productId, content, pan: match ? match[0] : null };
    });
  if (rows.length === 0) return 0;
  const { error } = await supabase.from("product_keys").insert(rows);
  if (error) throw error;
  await adminSyncStock(productId);
  return rows.length;
};

export const adminSyncStock = async (productId: string) => {
  const { count, error } = await supabase
    .from("product_keys")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId)
    .eq("is_sold", false);
  if (error) throw error;
  const stock = count ?? 0;
  await supabase
    .from("products")
    .update({ stock, ...(stock <= 0 ? { active: false } : {}) })
    .eq("id", productId);
  return stock;
};

/* ---------------- admin: bulk CSV upload ----------------
   Format: bin,brand,country,state,city,zip,exp_month,exp_year,price
--------------------------------------------------------- */

export interface BulkCardRow {
  bin: string;
  brand: string;
  country: string;
  state: string;
  city: string;
  zip: string;
  exp_month: string;
  exp_year: string;
  price: number;
}

export const parseBulkCards = (text: string): { rows: BulkCardRow[]; errors: string[] } => {
  const rows: BulkCardRow[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const raw = line.trim();
    if (!raw) return;
    if (/^bin\s*,/i.test(raw)) return; // header
    const parts = raw.split(",").map((p) => p.trim());
    if (parts.length < 9) { errors.push(`Строка ${i + 1}: нужно 9 полей`); return; }
    const [bin, brand, country, state, city, zip, m, y, price] = parts;
    if (!/^\d{6,8}$/.test(bin)) { errors.push(`Строка ${i + 1}: неверный BIN «${bin}»`); return; }
    const p = Number(price);
    if (!Number.isFinite(p) || p < 0) { errors.push(`Строка ${i + 1}: неверная цена «${price}»`); return; }
    rows.push({
      bin,
      brand: (brand || "").toUpperCase(),
      country: (country || "").toUpperCase(),
      state: state || "",
      city: city || "",
      zip: zip || "",
      exp_month: String(Number(m) || m).padStart(2, "0").slice(0, 2),
      exp_year: (y || "").slice(-2),
      price: p,
    });
  });
  return { rows, errors };
};

/** Split a list into fixed-size chunks so big uploads never blow up a single request. */
const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const CHUNK = 100;

/** Retries a database chunk on transient network, 502/504, or timeout errors */
const withRetry = async <T,>(
  fn: () => Promise<{ data: T; error: { message?: string; code?: string; details?: string; hint?: string } | null }>,
  attempts = 4
): Promise<{ data: T; error: null }> => {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fn();
      if (!res.error) {
        return res as { data: T; error: null };
      }
      lastError = res.error;
      const code = res.error.code || "";
      const msg = (res.error.message || "").toLowerCase();
      // If duplicate constraint on product_keys, throw immediately without useless retry
      if (code === "23505" || msg.includes("duplicate key") || msg.includes("unique constraint")) {
        throw res.error;
      }
      const transient =
        msg.includes("fetch") ||
        msg.includes("network") ||
        msg.includes("timeout") ||
        msg.includes("504") ||
        msg.includes("502") ||
        msg.includes("503") ||
        msg.includes("500") ||
        msg.includes("connection") ||
        msg.includes("bad gateway") ||
        msg.includes("gateway time-out") ||
        msg.includes("statement timeout");
      if (!transient || i === attempts - 1) {
        throw res.error;
      }
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message.toLowerCase() : typeof e === "object" && e && "message" in e ? String((e as { message: string }).message).toLowerCase() : "";
      const transient =
        msg.includes("fetch") ||
        msg.includes("network") ||
        msg.includes("timeout") ||
        msg.includes("504") ||
        msg.includes("502") ||
        msg.includes("503") ||
        msg.includes("500") ||
        msg.includes("connection") ||
        msg.includes("bad gateway") ||
        msg.includes("gateway time-out") ||
        msg.includes("statement timeout");
      if (!transient || i === attempts - 1) throw e;
    }
    await new Promise((r) => setTimeout(r, 600 * (i + 1)));
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
};


export const adminBulkCreateCards = async (rows: BulkCardRow[], categoryId: string | null = null) => {
  if (!rows.length) return 0;
  const payload = rows.map((r) => ({
    category_id: categoryId,
    title: `${r.brand || "CARD"} ${r.bin} · ${r.city || r.state || r.country}`,
    slug: `${r.bin}-${r.zip || "x"}-${Math.random().toString(36).slice(2, 8)}`,
    price: r.price,
    delivery_type: "instant" as DeliveryType,
    instant_content: `${r.bin} | ${r.exp_month}/${r.exp_year} | ${r.city} ${r.state} ${r.zip} | ${r.country}`,
    active: true,
    bin: r.bin,
    brand: r.brand || null,
    country: r.country || null,
    state: r.state || null,
    city: r.city || null,
    zip: r.zip || null,
    exp_month: r.exp_month || null,
    exp_year: r.exp_year || null,
  }));
  for (const part of chunk(payload, CHUNK)) {
    await withRetry(async () => await supabase.from("products").insert(part));
  }
  return payload.length;
};


/* -------- admin: publish full cards (Admin → Card Upload tab) --------
   Each parsed card becomes its own product with one product_key holding
   the full pipe-delimited line that the buyer downloads as .txt.
--------------------------------------------------------------------- */

export interface FullCardInput {
  cc: string;
  month: string;
  year: string;
  cvv: string;
  name: string;
  addr: string;
  city: string;
  state: string;
  zip: string;
  country: string | null;
  tel: string;
  email: string;
  brand: string;
  bin: string;
  base: string;
  price: number;
  refundable: boolean;
  category_id?: string | null;
  card_type?: string | null;
  card_level?: string | null;
  bank?: string | null;
  created_at?: string;
}

export const adminPublishFullCards = async (
  cards: FullCardInput[],
  onProgress?: (done: number, total: number, stage?: string, percent?: number) => void,
) => {
  if (!cards.length) return 0;

  onProgress?.(0, cards.length, "Deduplicating cards in batch...", 2);

  // 1. Deduplicate within the uploaded batch
  const seenInBatch = new Set<string>();
  const dedupedBatch: FullCardInput[] = [];
  for (const c of cards) {
    const pan = (c.cc || "").replace(/\D/g, "");
    if (pan.length >= 12) {
      if (seenInBatch.has(pan)) continue;
      seenInBatch.add(pan);
    }
    dedupedBatch.push(c);
  }
  if (!dedupedBatch.length) return 0;

  // 2. Check existing cards in database (product_keys) safely with safe chunk size (80)
  onProgress?.(0, dedupedBatch.length, "Checking database for existing cards...", 5);
  const existingPans = new Set<string>();
  const pansToCheck = dedupedBatch
    .map((c) => (c.cc || "").replace(/\D/g, ""))
    .filter((p) => p.length >= 12);

  const PAN_CHUNK = 80;
  const panChunks = chunk(pansToCheck, PAN_CHUNK);
  let checkedCount = 0;

  // Process in small parallel groups of 3 to stay fast and avoid overloading connection pool
  const CONCURRENCY = 3;
  for (let i = 0; i < panChunks.length; i += CONCURRENCY) {
    const group = panChunks.slice(i, i + CONCURRENCY);
    await Promise.all(
      group.map(async (pChunk) => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const { data: rows, error: rErr } = await supabase
              .from("product_keys")
              .select("pan")
              .in("pan", pChunk);
            if (!rErr && rows) {
              for (const r of rows as { pan?: string }[]) {
                if (r?.pan) existingPans.add(r.pan);
              }
              break;
            }
          } catch {
            // retry
          }
          await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
        }
        checkedCount += pChunk.length;
      })
    );
    const dbPct = Math.min(25, Math.round(5 + (checkedCount / Math.max(1, pansToCheck.length)) * 20));
    onProgress?.(checkedCount, pansToCheck.length, `Checked ${checkedCount}/${pansToCheck.length} against database`, dbPct);
  }

  // Filter out any card whose PAN already exists in database
  const finalCards = dedupedBatch.filter((c) => {
    const pan = (c.cc || "").replace(/\D/g, "");
    return !existingPans.has(pan);
  });
  if (!finalCards.length) return 0;

  onProgress?.(0, finalCards.length, `Preparing ${finalCards.length} verified products...`, 28);

  const clean = (s: string | null | undefined) => (!s || s.toLowerCase() === "null" ? "" : s);
  const stamp = Date.now().toString(36);

  const products = finalCards.map((c, i) => {
    const cleanBin = (c.bin || "").replace(/\D/g, "").slice(0, 6) || (c.cc || "").replace(/\D/g, "").slice(0, 6) || "000000";
    return {
      category_id: c.category_id ?? null,
      title: `${c.brand || "CARD"} ${cleanBin} · ${clean(c.city) || clean(c.state) || clean(c.country) || "—"}`,
      slug: `${cleanBin}-${stamp}-${i}-${Math.random().toString(36).slice(2, 8)}`,
      price: Number(c.price) || 1.5,
      delivery_type: "key" as DeliveryType,
      active: true,
      // Exactly one key per product, so stock is known up front — no extra round-trips.
      stock: 1,
      bin: cleanBin,
      brand: c.brand || null,
      country: clean(c.country) || null,
      state: clean(c.state) || null,
      city: clean(c.city) || null,
      zip: clean(c.zip) || null,
      exp_month: clean(c.month) || null,
      exp_year: clean(c.year) || null,
      base: c.base,
      refundable: c.refundable,
      card_type: c.card_type ?? null,
      card_level: c.card_level ?? null,
      bank: c.bank ?? null,
      last_digits: (c.cc || "").replace(/\D/g, "").slice(-3) || null,
      has_phone: !!clean(c.tel),
      has_email: !!clean(c.email),
      ...(c.created_at ? { created_at: c.created_at } : {}),
    };
  });

  const lineFor = (c: FullCardInput) => [
    c.base, c.price, c.cc, clean(c.month), clean(c.year), clean(c.cvv),
    clean(c.name), clean(c.addr), clean(c.city), clean(c.state), clean(c.zip),
    clean(c.country), clean(c.tel), clean(c.email), "", "",
  ].join("|");

  const bySlug = new Map(products.map((p, i) => [p.slug, finalCards[i]]));
  let created = 0;
  const productChunks = chunk(products, CHUNK);

  for (let cIdx = 0; cIdx < productChunks.length; cIdx++) {
    const part = productChunks[cIdx];
    const { data } = await withRetry(async () =>
      await supabase.from("products").insert(part as never).select("id, slug"),
    );
    const keys = (data ?? [])
      .map((row) => {
        const card = bySlug.get(row.slug as string);
        if (!card) return null;
        const pan = (card.cc || "").replace(/\D/g, "");
        return { product_id: row.id as string, content: lineFor(card), pan };
      })
      .filter(Boolean) as { product_id: string; content: string; pan?: string }[];
    if (keys.length) {
      try {
        await withRetry(async () => await supabase.from("product_keys").insert(keys));
      } catch (kerr: unknown) {
        const errObj = kerr as { code?: string; message?: string };
        // If a duplicate card slipped through into keys, insert individually to rescue non-duplicate cards
        if (errObj?.code === "23505" || (errObj?.message || "").toLowerCase().includes("duplicate") || (errObj?.message || "").toLowerCase().includes("unique")) {
          for (const k of keys) {
            try {
              await supabase.from("product_keys").insert(k);
            } catch {
              // ignore duplicate card
            }
          }
        } else {
          throw kerr;
        }
      }
    }
    created += data?.length ?? 0;
    const uploadPct = Math.min(99, Math.round(30 + (created / products.length) * 69));
    onProgress?.(created, products.length, `Uploaded ${created} / ${products.length} cards (${cIdx + 1}/${productChunks.length} chunks)`, uploadPct);
  }

  onProgress?.(created, products.length, `Completed! ${created} cards published successfully.`, 100);
  invalidateProductCache();
  return created;
};


/* ---------------- admin: overview + announcements (Supabase-backed) ---------------- */

export interface AdminOverview {
  totalRevenue: number;
  todayRevenue: number;
  weekRevenue: number;
  monthRevenue: number;
  totalUsers: number;
  totalSellers: number;
  cardsAvailable: number;
  todaySalesCount: number;
  todaySalesAmount: number;
  todayDeposits: number;
  totalDeposits: number;
  pendingPayouts: number;
  totalPayoutsPaid: number;
  openTickets: number;
  pendingApps: number;
  dailyRevenue: Array<{ day: string; revenue: number; orders: number }>;
  topSellers: Array<{ id: string; username: string; cards_sold: number; total_sold: number }>;
  recentOrders: Array<{ id: string; total: number; status: string; created_at: string; buyer: string }>;
}

export const adminOverview = async (): Promise<AdminOverview> => {
  const [orders, deposits, users, roles, availableKeysRes, totalKeysRes] = await Promise.all([
    supabase.from("orders").select("id, user_id, total, status, created_at").order("created_at", { ascending: false }).limit(1000),
    supabase.from("deposits").select("amount, status, created_at").limit(2000),
    supabase.from("profiles").select("id, username").limit(5000),
    supabase.from("user_roles").select("user_id, role").limit(5000),
    supabase.from("product_keys").select("*", { count: "exact", head: true }).eq("is_sold", false),
    supabase.from("product_keys").select("*", { count: "exact", head: true }),
  ]);

  const nameById = new Map((users.data ?? []).map((u) => [u.id, u.username]));
  const orderRows = orders.data ?? [];
  const depositRows = deposits.data ?? [];
  const totalCards = totalKeysRes.count ?? 0;
  const availableCards = availableKeysRes.count ?? totalCards;

  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const dayMs = 86_400_000;
  const since = (days: number) => Date.now() - days * dayMs;
  const revenueSince = (ts: number) =>
    orderRows.filter((o) => Date.parse(o.created_at) >= ts).reduce((s, o) => s + num(o.total), 0);

  const byDay = new Map<string, { revenue: number; orders: number }>();
  orderRows.forEach((o) => {
    const day = o.created_at.slice(0, 10);
    const cur = byDay.get(day) ?? { revenue: 0, orders: 0 };
    cur.revenue += num(o.total); cur.orders += 1;
    byDay.set(day, cur);
  });

  const todayOrders = orderRows.filter((o) => Date.parse(o.created_at) >= startOfDay.getTime());

  return {
    totalRevenue: orderRows.reduce((s, o) => s + num(o.total), 0),
    todayRevenue: revenueSince(startOfDay.getTime()),
    weekRevenue: revenueSince(since(7)),
    monthRevenue: revenueSince(since(30)),
    totalUsers: (users.data ?? []).length,
    totalSellers: (roles.data ?? []).filter((r) => r.role === "seller").length,
    cardsAvailable: availableCards,
    todaySalesCount: todayOrders.length,
    todaySalesAmount: todayOrders.reduce((s, o) => s + num(o.total), 0),
    todayDeposits: depositRows
      .filter((d) => d.status === "approved" && Date.parse(d.created_at) >= startOfDay.getTime())
      .reduce((s, d) => s + num(d.amount), 0),
    totalDeposits: depositRows.filter((d) => d.status === "approved").reduce((s, d) => s + num(d.amount), 0),
    pendingPayouts: 0,
    totalPayoutsPaid: 0,
    openTickets: 0,
    pendingApps: 0,
    dailyRevenue: [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(-14)
      .map(([day, v]) => ({ day, revenue: v.revenue, orders: v.orders })),
    topSellers: [],
    recentOrders: orderRows.slice(0, 10).map((o) => ({
      id: o.id,
      total: num(o.total),
      status: o.status,
      created_at: o.created_at,
      buyer: nameById.get(o.user_id) ?? "—",
    })),
  };
};

export interface SystemSnapshot {
  timestamp: string;
  users: { total: number; admins: number; sellers: number; buyers: number; banned: number };
  cards: { total: number; available: number; sold: number; reserved: number };
  wallets: { count: number; total_balance: number; max_balance: number; avg_balance: number };
  orders: { total: number; revenue: number };
  pending_seller_applications: number;
  sellers_breakdown: Array<{ id: string; username: string; balance: number }>;
}

export const adminSystemSnapshot = async (): Promise<SystemSnapshot> => {
  const [profiles, roles, totalKeysRes, soldKeysRes, ordersRes, orderTotals] = await Promise.all([
    supabase.from("profiles").select("id, username, balance, blocked").limit(10000),
    supabase.from("user_roles").select("user_id, role").limit(10000),
    supabase.from("product_keys").select("*", { count: "exact", head: true }),
    supabase.from("product_keys").select("*", { count: "exact", head: true }).eq("is_sold", true),
    supabase.from("orders").select("*", { count: "exact", head: true }),
    supabase.from("orders").select("total").limit(5000),
  ]);
  const profileRows = profiles.data ?? [];
  const roleRows = roles.data ?? [];
  const totalKeys = totalKeysRes.count ?? 0;
  const soldKeys = soldKeysRes.count ?? 0;
  const availableKeys = Math.max(0, totalKeys - soldKeys);
  const balances = profileRows.map((p) => num(p.balance));
  const sellerIds = new Set(roleRows.filter((r) => r.role === "seller").map((r) => r.user_id));

  return {
    timestamp: new Date().toISOString(),
    users: {
      total: profileRows.length,
      admins: roleRows.filter((r) => r.role === "admin").length,
      sellers: sellerIds.size,
      buyers: roleRows.filter((r) => r.role === "buyer").length,
      banned: profileRows.filter((p) => p.blocked).length,
    },
    cards: {
      total: totalKeys,
      available: availableKeys,
      sold: soldKeys,
      reserved: 0,
    },
    wallets: {
      count: balances.length,
      total_balance: balances.reduce((s, b) => s + b, 0),
      max_balance: balances.length ? Math.max(...balances) : 0,
      avg_balance: balances.length ? balances.reduce((s, b) => s + b, 0) / balances.length : 0,
    },
    orders: {
      total: ordersRes.count ?? (orderTotals.data ?? []).length,
      revenue: (orderTotals.data ?? []).reduce((s, o) => s + num(o.total), 0),
    },
    pending_seller_applications: 0,
    sellers_breakdown: profileRows
      .filter((p) => sellerIds.has(p.id))
      .map((p) => ({ id: p.id, username: p.username, balance: num(p.balance) })),
  };
};

export interface Announcement {
  id: string;
  title: string;
  body: string;
  kind: string;
  created_at: string;
}

export function sanitizeBrandText(text: string): string {
  if (!text) return "";
  return text
    .replace(/🐲\s*/g, "⚡ ")
    .replace(/Cruzer\s*CC/gi, "Zoru Shop")
    .replace(/CruzerCC/gi, "Zoru Shop")
    .replace(/Cruzer/gi, "Zoru Shop")
    .replace(/Scorpion\s*Shop/gi, "Zoru Shop")
    .replace(/Scorpion/gi, "Zoru Shop")
    .replace(/dragon-fire delivery/gi, "instant automated delivery");
}

export const listAnnouncements = async (): Promise<Announcement[]> => {
  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, body, kind, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  
  // Deduplicate identical announcements and sanitize brand references
  const seen = new Set<string>();
  const list: Announcement[] = [];
  for (const a of data ?? []) {
    const cleanTitle = sanitizeBrandText(a.title ?? "");
    const cleanBody = sanitizeBrandText(a.body ?? "");
    const key = `${cleanTitle}:::${cleanBody}`;
    if (!seen.has(key)) {
      seen.add(key);
      list.push({
        id: a.id,
        title: cleanTitle,
        body: cleanBody,
        kind: a.kind || "info",
        created_at: a.created_at,
      });
    }
  }
  return list;
};

export const adminCreateAnnouncement = async (input: {
  title: string;
  body: string;
  kind: string;
  created_at?: string;
}) => {
  const { error } = await supabase.from("announcements").insert({
    title: input.title,
    body: input.body,
    kind: input.kind,
    ...(input.created_at ? { created_at: input.created_at } : {}),
  });
  if (error) throw error;
};

export const adminDeleteAnnouncement = async (id: string) => {
  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) throw error;
};

/* ---------------- admin: card moderation ---------------- */

export interface AdminCardRow {
  id: string;
  bin: string;
  brand: string;
  country: string;
  price: number;
  status: "available" | "sold" | "hidden" | "expired";
  created_at: string;
  exp_month?: string;
  exp_year?: string;
  category_id: string | null;
  base?: string | null;
}

const cardStatus = (p: {
  active: boolean | null; stock: number | null; sold_count: number | null;
  exp_month: string | null; exp_year: string | null;
}): AdminCardRow["status"] => {
  const m = Number(p.exp_month), y = Number(p.exp_year);
  if (m >= 1 && m <= 12 && y > 0) {
    const full = y < 100 ? 2000 + y : y;
    const end = new Date(full, m, 1);
    if (end.getTime() < Date.now()) return "expired";
  }
  if (!p.active) return "hidden";
  if ((p.stock ?? 0) <= 0) return "sold";
  return "available";
};

export const adminListCards = async (opts: {
  search?: string;
  status?: "all" | "available" | "sold" | "hidden" | "expired";
} = {}): Promise<AdminCardRow[]> => {
  const CHUNK_SIZE = 1000;
  const maxLimit = 100000;

  const buildQuery = (withCount = false) => {
    let q = supabase
      .from("products")
      .select(
        "id, bin, brand, country, price, active, stock, sold_count, exp_month, exp_year, created_at, category_id, base",
        withCount ? { count: "exact" } : undefined,
      )
      .order("created_at", { ascending: false });
    const s = opts.search?.trim();
    if (s) q = q.or(`bin.ilike.%${s}%,brand.ilike.%${s}%,country.ilike.%${s}%,title.ilike.%${s}%`);
    return q;
  };

  const firstRes = await buildQuery(true).range(0, CHUNK_SIZE - 1);
  if (firstRes.error) throw firstRes.error;

  const allData = [...(firstRes.data ?? [])];
  const totalCount = Math.min(firstRes.count ?? firstRes.data?.length ?? 0, maxLimit);

  if (totalCount > CHUNK_SIZE) {
    const tasks = [];
    for (let from = CHUNK_SIZE; from < totalCount; from += CHUNK_SIZE) {
      const to = Math.min(from + CHUNK_SIZE - 1, totalCount - 1);
      tasks.push(
        buildQuery()
          .range(from, to)
          .then((r) => {
            if (r.error) throw r.error;
            return r.data ?? [];
          })
      );
    }
    const pages = await Promise.all(tasks);
    for (const page of pages) {
      allData.push(...page);
    }
  } else if (firstRes.count == null && firstRes.data && firstRes.data.length === CHUNK_SIZE) {
    let from = CHUNK_SIZE;
    while (from < maxLimit) {
      const to = Math.min(from + CHUNK_SIZE - 1, maxLimit - 1);
      const r = await buildQuery().range(from, to);
      if (r.error) throw r.error;
      const batch = r.data ?? [];
      if (!batch.length) break;
      allData.push(...batch);
      if (batch.length < CHUNK_SIZE) break;
      from += CHUNK_SIZE;
    }
  }

  const rows: AdminCardRow[] = allData.map((p) => ({
    id: p.id,
    bin: p.bin ?? "—",
    brand: p.brand ?? "—",
    country: p.country ?? "—",
    price: Number(p.price ?? 0),
    status: cardStatus(p),
    created_at: p.created_at,
    exp_month: p.exp_month ?? undefined,
    exp_year: p.exp_year ?? undefined,
    category_id: p.category_id ?? null,
    base: (p as { base?: string | null }).base ?? null,
  }));
  const f = opts.status ?? "all";
  return f === "all" ? rows : rows.filter((r) => r.status === f);
};

export const adminUpdateCards = async (
  ids: string[],
  patch: { price?: number; active?: boolean; category_id?: string | null; base?: string },
) => {
  if (ids.length === 0) return;
  // Chunked: a single .in() with thousands of ids overflows the request URL.
  for (const part of chunk(ids, 200)) {
    const { error } = await supabase.from("products").update(patch).in("id", part);
    if (error) throw error;
  }
};

export const adminDeleteCards = async (ids: string[]) => {
  if (ids.length === 0) return;
  for (const part of chunk(ids, 200)) {
    const { error } = await supabase.from("products").delete().in("id", part);
    if (error) throw error;
  }
};


/** Hides every card whose expiry month has passed. Returns how many were hidden. */
export const adminHideExpiredCards = async () => {
  const rows = await adminListCards({ status: "expired" });
  const ids = rows.map((r) => r.id);
  await adminUpdateCards(ids, { active: false });
  return ids.length;
};

/* ---------------- refund checker (card_checks) ---------------- */

export interface CardCheck {
  id: string;
  user_id: string;
  order_id: string | null;
  product_id: string | null;
  bin: string | null;
  last_digits: string | null;
  price: number;
  status: "live" | "dead" | "pending";
  refunded: number;
  fee: number;
  created_at: string;
}

// card_checks is created by selfhost/refund-checker.sql, so it is not in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rawDb = supabase as any;

const mapCheck = (r: Record<string, unknown>): CardCheck => ({
  id: String(r.id),
  user_id: String(r.user_id ?? ""),
  order_id: (r.order_id as string) ?? null,
  product_id: (r.product_id as string) ?? null,
  bin: (r.bin as string) ?? null,
  last_digits: (r.last_digits as string) ?? null,
  price: num(r.price),
  status: r.status === "dead" ? "dead" : r.status === "pending" ? "pending" : "live",
  refunded: num(r.refunded),
  fee: num(r.fee),
  created_at: String(r.created_at ?? ""),
});

/** Checker results for the orders that were just created. */
export const listChecksForOrders = async (orderIds: string[]): Promise<CardCheck[]> => {
  if (orderIds.length === 0) return [];
  const { data, error } = await rawDb
    .from("card_checks")
    .select("*")
    .in("order_id", orderIds)
    .order("created_at", { ascending: true });
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map(mapCheck);
};

/** Checks the buyer bought but has not run yet. */
export const listPendingChecks = async (): Promise<CardCheck[]> => {
  const { data, error } = await rawDb
    .from("card_checks")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map(mapCheck);
};

/** Recent checker history for the signed-in buyer (RLS scopes it to the user). */
export const listMyChecks = async (limit = 50): Promise<CardCheck[]> => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await rawDb
    .from("card_checks")
    .select("*")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map(mapCheck);
};

/** Manually run the checker for the given orders (or every pending check when empty). */
export const runCardChecks = async (orderIds: string[]): Promise<CardCheck[]> => {
  const { error } = await rawDb.rpc("run_card_checks", {
    _order_ids: orderIds.length ? orderIds : null,
  });
  if (error) throw new Error(error.message);
  if (!orderIds.length) return [];
  return listChecksForOrders(orderIds);
};

/** Admin: latest checker results across all users. */
export const adminListChecks = async (limit = 200): Promise<CardCheck[]> => {
  const { data, error } = await rawDb
    .from("card_checks")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(mapCheck);
};

/* ───────────────────────── Referral program ───────────────────────── */

export interface ReferralRow {
  id: string;
  referrer_id: string;
  referee_id: string;
  bonus_amount: number;
  paid_at: string;
}

export interface ReferralSummary {
  code: string;
  bonus: number;
  paidCount: number;
  earned: number;
  pendingCount: number;
}

/** Own referral code + payout stats for the signed-in user. */
export const getMyReferralSummary = async (): Promise<ReferralSummary> => {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("not_authenticated");

  const { data: prof } = await rawDb
    .from("profiles")
    .select("referral_code")
    .eq("id", uid)
    .maybeSingle();

  const { data: paidRows } = await rawDb
    .from("referrals")
    .select("bonus_amount")
    .eq("referrer_id", uid);

  const { count: invited } = await rawDb
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("referred_by", uid);

  const { data: setting } = await rawDb
    .from("site_settings")
    .select("value")
    .eq("key", "referral_bonus")
    .maybeSingle();

  const rows = (paidRows ?? []) as { bonus_amount: number | string }[];
  const earned = rows.reduce((s, r) => s + num(r.bonus_amount), 0);

  return {
    code: String((prof as { referral_code?: string } | null)?.referral_code ?? ""),
    bonus: (() => {
      const v = num((setting as { value?: string } | null)?.value);
      return v && v >= 1 ? v : 5;
    })(),
    paidCount: rows.length,
    earned,
    pendingCount: Math.max(0, (invited ?? 0) - rows.length),
  };
};
