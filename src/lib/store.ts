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

/** Hard cap so a huge stock table can never freeze the browser / blow up the response. */
export const PRODUCT_FETCH_LIMIT = 3000;

export const listProducts = async (
  opts: { categoryId?: string | null; search?: string; includeInactive?: boolean; limit?: number } = {},
) => {
  const limit = Math.min(opts.limit ?? PRODUCT_FETCH_LIMIT, PRODUCT_FETCH_LIMIT);
  let q = supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!opts.includeInactive) q = q.eq("active", true);
  if (opts.categoryId) q = q.eq("category_id", opts.categoryId);
  if (opts.search?.trim()) q = q.ilike("title", `%${opts.search.trim()}%`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((p) => ({ ...p, price: num(p.price), compare_at_price: p.compare_at_price == null ? null : num(p.compare_at_price) })) as Product[];
};


export const purchaseProduct = async (productId: string, quantity: number) => {
  const { data, error } = await supabase.rpc("purchase_product", { _product_id: productId, _quantity: quantity });
  if (error) throw new Error(translatePurchaseError(error.message));
  return data as string;
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


export const translatePurchaseError = (msg: string) => {
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
  const rows = lines.map((l) => l.trim()).filter(Boolean).map((content) => ({ product_id: productId, content }));
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
  await supabase.from("products").update({ stock: count ?? 0 }).eq("id", productId);
  return count ?? 0;
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

const CHUNK = 200;

/** Retries a chunk on transient network / timeout failures so a big upload never dies half-way silently. */
const withRetry = async <T,>(fn: () => Promise<T>, attempts = 3): Promise<T> => {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const msg = e instanceof Error ? e.message.toLowerCase() : "";
      const transient = msg.includes("fetch") || msg.includes("network") || msg.includes("timeout") || msg.includes("504") || msg.includes("502");
      if (!transient || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw last;
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
    const { error } = await supabase.from("products").insert(part);
    if (error) throw error;
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
  country: string;
  tel: string;
  email: string;
  brand: string;
  bin: string;
  base: string;
  price: number;
  refundable: boolean;
  category_id?: string | null;
}

export const adminPublishFullCards = async (
  cards: FullCardInput[],
  onProgress?: (done: number, total: number) => void,
) => {
  if (!cards.length) return 0;
  const clean = (s: string) => (!s || s.toLowerCase() === "null" ? "" : s);
  const stamp = Date.now().toString(36);

  const products = cards.map((c, i) => ({
    category_id: c.category_id ?? null,
    title: `${c.brand} ${c.bin} · ${clean(c.city) || clean(c.state) || clean(c.country) || "—"}`,
    slug: `${c.bin}-${stamp}-${i}-${Math.random().toString(36).slice(2, 8)}`,
    price: c.price,
    delivery_type: "key" as DeliveryType,
    active: true,
    // Exactly one key per product, so stock is known up front — no extra round-trips.
    stock: 1,
    bin: c.bin,
    brand: c.brand || null,
    country: clean(c.country) || null,
    state: clean(c.state) || null,
    city: clean(c.city) || null,
    zip: clean(c.zip) || null,
    exp_month: clean(c.month) || null,
    exp_year: clean(c.year) || null,
    base: c.base,
    refundable: c.refundable,
    last_digits: (c.cc || "").replace(/\D/g, "").slice(-3) || null,
    has_phone: !!clean(c.tel),
    has_email: !!clean(c.email),
  }));

  const lineFor = (c: FullCardInput) => [
    c.base, c.price, c.cc, clean(c.month), clean(c.year), clean(c.cvv),
    clean(c.name), clean(c.addr), clean(c.city), clean(c.state), clean(c.zip),
    clean(c.country), clean(c.tel), clean(c.email), "", "",
  ].join("|");

  const bySlug = new Map(products.map((p, i) => [p.slug, cards[i]]));
  let created = 0;

  for (const part of chunk(products, CHUNK)) {
    const { data, error } = await withRetry(async () =>
      await supabase.from("products").insert(part as never).select("id, slug"),
    );
    if (error) throw error;
    const keys = (data ?? [])
      .map((row) => {
        const card = bySlug.get(row.slug as string);
        return card ? { product_id: row.id as string, content: lineFor(card) } : null;
      })
      .filter(Boolean) as { product_id: string; content: string }[];
    if (keys.length) {
      const { error: kerr } = await withRetry(async () => await supabase.from("product_keys").insert(keys));
      if (kerr) throw kerr;
    }
    created += data?.length ?? 0;
    onProgress?.(created, products.length);
  }


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
  const [orders, deposits, users, roles, keys] = await Promise.all([
    supabase.from("orders").select("id, user_id, total, status, created_at").order("created_at", { ascending: false }).limit(500),
    supabase.from("deposits").select("amount, status, created_at"),
    supabase.from("profiles").select("id, username"),
    supabase.from("user_roles").select("user_id, role"),
    supabase.from("product_keys").select("is_sold"),
  ]);

  const nameById = new Map((users.data ?? []).map((u) => [u.id, u.username]));
  const orderRows = orders.data ?? [];
  const depositRows = deposits.data ?? [];
  const keyRows = keys.data ?? [];

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
    cardsAvailable: keyRows.filter((k) => !k.is_sold).length,
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
  const [profiles, roles, keys, orders] = await Promise.all([
    supabase.from("profiles").select("id, username, balance, blocked"),
    supabase.from("user_roles").select("user_id, role"),
    supabase.from("product_keys").select("is_sold"),
    supabase.from("orders").select("total"),
  ]);
  const profileRows = profiles.data ?? [];
  const roleRows = roles.data ?? [];
  const keyRows = keys.data ?? [];
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
      total: keyRows.length,
      available: keyRows.filter((k) => !k.is_sold).length,
      sold: keyRows.filter((k) => k.is_sold).length,
      reserved: 0,
    },
    wallets: {
      count: balances.length,
      total_balance: balances.reduce((s, b) => s + b, 0),
      max_balance: balances.length ? Math.max(...balances) : 0,
      avg_balance: balances.length ? balances.reduce((s, b) => s + b, 0) / balances.length : 0,
    },
    orders: {
      total: (orders.data ?? []).length,
      revenue: (orders.data ?? []).reduce((s, o) => s + num(o.total), 0),
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

export const listAnnouncements = async (): Promise<Announcement[]> => {
  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, body, kind, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((a) => ({ ...a, body: a.body ?? "" }));
};

export const adminCreateAnnouncement = async (input: { title: string; body: string; kind: string }) => {
  const { error } = await supabase.from("announcements").insert({
    title: input.title,
    body: input.body,
    kind: input.kind,
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
  let q = supabase
    .from("products")
    .select("id, bin, brand, country, price, active, stock, sold_count, exp_month, exp_year, created_at, category_id")
    .order("created_at", { ascending: false })
    .limit(1000);
  const s = opts.search?.trim();
  if (s) q = q.or(`bin.ilike.%${s}%,brand.ilike.%${s}%,country.ilike.%${s}%,title.ilike.%${s}%`);
  const { data, error } = await q;
  if (error) throw error;
  const rows: AdminCardRow[] = (data ?? []).map((p) => ({
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
  }));
  const f = opts.status ?? "all";
  return f === "all" ? rows : rows.filter((r) => r.status === f);
};

export const adminUpdateCards = async (
  ids: string[],
  patch: { price?: number; active?: boolean; category_id?: string | null },
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
  status: "live" | "dead";
  refunded: number;
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
  status: r.status === "dead" ? "dead" : "live",
  refunded: num(r.refunded),
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
    bonus: num((setting as { value?: string } | null)?.value ?? 5) || 5,
    paidCount: rows.length,
    earned,
    pendingCount: Math.max(0, (invited ?? 0) - rows.length),
  };
};
