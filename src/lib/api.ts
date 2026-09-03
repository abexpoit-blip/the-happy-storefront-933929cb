/**
 * VPS API client — all backend calls go through here.
 * No Supabase, no Lovable Cloud. Pure VPS.
 */

export const AUTH_CHANGED_EVENT = "cruzercc-auth-changed";

export function resolveApiBase(): string {
  const envBase = import.meta.env.VITE_API_BASE as string | undefined;
  if (envBase && envBase.length > 0) return envBase.replace(/\/+$/, "");

  if (typeof window !== "undefined") {
    const { hostname, origin } = window.location;
    const host = hostname.toLowerCase();

    if (host === "cruzercc.shop" || host === "www.cruzercc.shop") {
      return `${origin.replace(/\/+$/, "")}/api`;
    }

    if (host.endsWith("lovable.app") || host.endsWith("lovableproject.com")) {
      return "https://cruzercc.shop/api";
    }

    return `${origin.replace(/\/+$/, "")}/api`;
  }

  return "/api";
}

export const API_BASE = resolveApiBase();

export function buildApiUrl(path: string): string {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

// ── Token helpers ──
const TOKEN_KEY = "cruzercc.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t);
  window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
}

export function decodeToken(t: string): Record<string, unknown> | null {
  try {
    return JSON.parse(atob(t.split(".")[1]));
  } catch {
    return null;
  }
}

// ── API Error ──
export class ApiError extends Error {
  status: number;
  contentType: string;
  bodySnippet: string;
  constructor(status: number, message: string, contentType = "", bodySnippet = "") {
    super(message);
    this.status = status;
    this.contentType = contentType;
    this.bodySnippet = bodySnippet;
  }
}

// ── Generic fetch wrapper ──
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

async function request<T = unknown>(
  method: Method,
  path: string,
  body?: unknown,
  opts?: { params?: Record<string, string | number | boolean | undefined> },
): Promise<T> {
  let url = buildApiUrl(path);
  if (opts?.params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.params)) {
      if (v !== undefined && v !== "") qs.set(k, String(v));
    }
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Network error — is the server running?");
  }

  const ct = res.headers.get("content-type") ?? "";

  if (!res.ok) {
    const rawBody = await res.text();
    let msg = `HTTP ${res.status}`;
    if (ct.includes("application/json")) {
      try {
        const j = JSON.parse(rawBody);
        msg = j.error ?? j.message ?? msg;
      } catch { /* keep generic */ }
    } else if (ct.includes("text/html")) {
      msg = `Server returned HTML instead of JSON (HTTP ${res.status})`;
    }
    throw new ApiError(res.status, msg, ct, rawBody.slice(0, 300));
  }

  if (res.status === 204) return undefined as T;

  const raw = await res.text();
  if (!raw) return undefined as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ApiError(
      res.status,
      "Сервер вернул неверный ответ (не JSON). Попробуйте позже.",
      ct,
      raw.slice(0, 300),
    );
  }

}

// ── Convenience verbs ──
export const api = {
  get: <T = unknown>(path: string, params?: Record<string, string | number | boolean | undefined>) =>
    request<T>("GET", path, undefined, { params }),
  post: <T = unknown>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T = unknown>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  put: <T = unknown>(path: string, body?: unknown) => request<T>("PUT", path, body),
  del: <T = unknown>(path: string) => request<T>("DELETE", path),
};

// ── Typed API helpers ──
// Auth + Profile now backed by Lovable Cloud (Supabase). Vendor username-based
// login is preserved by mapping username -> synthetic email <username>@cruzercc.shop.
import { supabase } from "@/integrations/supabase/client";

export interface AuthResult {
  token: string;
  user: { id: string; email: string; username: string; role: string; roles?: string[] };
}

const SYNTH_DOMAIN = "cruzercc.shop";

function toAuthEmail(identifier: string): string {
  const id = identifier.trim();
  return id.includes("@") ? id.toLowerCase() : `${id.toLowerCase()}@${SYNTH_DOMAIN}`;
}

async function loadRolesAndProfile(userId: string) {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("id, username, email").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);
  const roleList = (roles ?? []).map((r) => r.role as string);
  const primary = roleList.includes("admin")
    ? "admin"
    : roleList.includes("seller")
      ? "seller"
      : "buyer";
  return {
    id: userId,
    email: profile?.email ?? "",
    username: profile?.username ?? "",
    role: primary,
    roles: roleList,
  };
}

async function requireRole(userId: string, role: "seller" | "admin"): Promise<boolean> {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: role });
  return Boolean(data);
}

/** Turn raw auth errors into clear Russian messages for the login/signup screens. */
function authMessage(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("weak") || m.includes("pwned"))
    return "Слишком простой пароль. Используйте длинный пароль с цифрами и символами.";
  if (m.includes("invalid login") || m.includes("invalid credentials"))
    return "Неверное имя пользователя или пароль.";
  if (m.includes("already registered") || m.includes("already been registered") || m.includes("user already"))
    return "Такое имя пользователя уже занято.";
  if (m.includes("at least") && m.includes("characters"))
    return "Пароль должен содержать минимум 6 символов.";
  if (m.includes("email not confirmed"))
    return "Аккаунт не подтверждён. Свяжитесь с поддержкой.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Слишком много попыток. Повторите через минуту.";
  if (m.includes("failed to fetch") || m.includes("networkerror"))
    return "Нет связи с сервером. Проверьте интернет и повторите.";
  return raw;
}

export const authApi = {
  signup: async (data: { email?: string; username: string; password: string; telegram?: string; ref?: string }): Promise<AuthResult> => {
    const email = toAuthEmail(data.username); // username-based auth email
    const ref = (data.ref ?? "").trim().toUpperCase();
    const { data: res, error } = await supabase.auth.signUp({
      email,
      password: data.password,
      options: {
        data: {
          username: data.username,
          real_email: data.email || null,
          telegram: data.telegram?.trim() ? data.telegram.trim().replace(/^@/, "") : null,
          ref: ref || null,
        },
        emailRedirectTo: `${window.location.origin}/`,
      },
    });

    if (error) throw new ApiError(400, authMessage(error.message));
    if (!res.user) throw new ApiError(400, "Не удалось создать аккаунт");
    const user = await loadRolesAndProfile(res.user.id);
    return { token: res.session?.access_token ?? "", user };
  },

  login: async (data: { identifier: string; password: string }): Promise<AuthResult> => {
    const email = toAuthEmail(data.identifier);
    const { data: res, error } = await supabase.auth.signInWithPassword({
      email,
      password: data.password,
    });
    if (error) throw new ApiError(401, authMessage(error.message));
    if (!res.user) throw new ApiError(401, "Не удалось войти");
    const user = await loadRolesAndProfile(res.user.id);
    return { token: res.session?.access_token ?? "", user };
  },


  sellerLogin: async (data: { identifier: string; password: string }): Promise<AuthResult> => {
    const result = await authApi.login(data);
    const ok = await requireRole(result.user.id, "seller");
    if (!ok) {
      await supabase.auth.signOut();
      throw new ApiError(403, "This account is not a seller");
    }
    return result;
  },

  adminLogin: async (data: { identifier: string; password: string }): Promise<AuthResult> => {
    const result = await authApi.login(data);
    const ok = await requireRole(result.user.id, "admin");
    if (!ok) {
      await supabase.auth.signOut();
      throw new ApiError(403, "This account is not an admin");
    }
    return result;
  },

  me: async (): Promise<{ user: AuthResult["user"] }> => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw new ApiError(401, "Not signed in");
    const user = await loadRolesAndProfile(data.user.id);
    return { user };
  },
};

export interface VpsProfile {
  id: string; email: string; username: string; role: string;
  display_name: string | null; avatar_url: string | null;
  bio: string | null; country: string | null;
  balance: number; roles?: string[];
}

export const profileApi = {
  get: async (): Promise<{ profile: VpsProfile }> => {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) throw new ApiError(401, "Not signed in");
    const [{ data: row, error }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", authData.user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", authData.user.id),
    ]);
    if (error) throw new ApiError(500, error.message);
    if (!row) throw new ApiError(404, "Profile not found");
    const roleList = (roles ?? []).map((r) => r.role as string);
    const primary = roleList.includes("admin")
      ? "admin"
      : roleList.includes("seller")
        ? "seller"
        : "buyer";
    return {
      profile: {
        id: row.id,
        email: row.email ?? "",
        username: row.username,
        role: primary,
        display_name: row.username,
        avatar_url: row.avatar_url,
        bio: null,
        country: null,
        balance: 0, // wallet comes in Phase 3
        roles: roleList,
      },
    };
  },
  update: async (data: { display_name?: string; bio?: string; country?: string; avatar_url?: string }): Promise<{ ok: true }> => {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) throw new ApiError(401, "Not signed in");
    const patch: { avatar_url?: string | null } = {};
    if (data.avatar_url !== undefined) patch.avatar_url = data.avatar_url;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await supabase.from("profiles").update(patch).eq("id", authData.user.id);
    if (error) throw new ApiError(500, error.message);
    return { ok: true };
  },
};

// Cards
export interface VpsCategory {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  image_url?: string;
  display_order: number;
  is_active: boolean;
}

export interface VpsCard {
  id: string; bin: string; brand: string; country: string; state?: string;
  zip?: string; price: number; status: string; created_at: string;
  last4?: string; level?: string; type?: string; bank?: string;
  exp_month?: number | string; exp_year?: number | string;
  city?: string; base?: string; refundable?: boolean;
  has_phone?: boolean; has_email?: boolean; email?: string;
  seller_id?: string; sold_at?: string; category_id?: string;
}

export const categoriesApi = {
  list: () => api.get<{ categories: VpsCategory[] }>("/categories"),
  all: () => api.get<{ categories: VpsCategory[] }>("/admin/categories"),
  create: (data: Partial<VpsCategory>) => api.post<{ category: VpsCategory }>("/admin/categories", data),
  update: (id: string, data: Partial<VpsCategory>) => api.patch<{ ok: true }>(`/admin/categories/${id}`, data),
  del: (id: string) => api.del<{ ok: true }>(`/admin/categories/${id}`),
};

export const cardsApi = {
  browse: (params?: Record<string, string | number | boolean | undefined>) =>
    api.get<{ cards: VpsCard[]; total: number; page: number; per_page: number; pages: number }>("/cards", params),
  bases: () => api.get<{ bases: string[] }>("/cards/bases"),
  recentStock: () => api.get<{ stock: Array<{ base: string; brand: string; country: string; count: number; created_at: string }> }>("/cards/recent-stock"),
  all: (params?: Record<string, string | number | boolean | undefined>) =>
    api.get<{ cards: VpsCard[]; total: number; page: number; per_page: number; pages: number }>("/cards/all", params),
  cleanupExpired: () => api.post<{ ok: true; expired: number }>("/cards/cleanup-expired"),
  mine: () => api.get<{ cards: VpsCard[] }>("/cards/mine"),
  create: (data: Record<string, unknown>) => api.post<{ id: string }>("/cards", data),
  bulkCreate: (rows: Record<string, unknown>[]) => api.post<{ count: number }>("/cards/bulk", rows),
  del: (id: string) => api.del<{ ok: true }>(`/cards/${id}`),
  reveal: (id: string) => api.get<{ card: Record<string, unknown> }>(`/cards/${id}/reveal`),
  update: (id: string, data: Record<string, unknown>) => api.patch<{ ok: true }>(`/cards/${id}`, data),
  bulkUpdate: (ids: string[], data: Record<string, unknown>) =>
    api.post<{ ok: true }>("/cards/bulk-update", { ids, ...data }),
  bulkDelete: (ids: string[]) => api.post<{ ok: true }>("/cards/bulk-delete", { ids }),
};

export const cartApi = {
  list: () => api.get<{ items: Array<{ id: string; card_id?: string; digital_product_id?: string; card?: Record<string, unknown>; product?: { id: string; title: string; price: number; type: string; image_url?: string } }> }>("/cart"),
  add: (item: { card_id?: string; digital_product_id?: string }) => api.post<{ ok: true }>("/cart", item),
  addBatch: (card_ids: string[]) => api.post<{ ok: true }>("/cart/batch", { card_ids }),
  remove: (item_id: string) => api.del<{ ok: true }>(`/cart/${item_id}`),
  checkout: (data: { card_ids?: string[]; digital_product_ids?: string[] }) =>
    api.post<{ order_id: string; total: number }>("/cart/checkout", data),
};

// Digital Products (Super Shop)
export interface VpsDigitalProduct {
  id: string;
  seller_id: string;
  seller_username?: string;
  type: 'method' | 'account' | 'tool' | 'document' | 'bin' | 'subscription' | 'bank' | 'facebook';
  image_url?: string;
  title: string;
  description?: string;
  price: number;
  stock: number;
  video_url?: string;
  download_url?: string;
  text_content?: string;
  guidelines?: string;
  is_active: number | boolean;
  created_at: string;
  updated_at: string;
}

export const digitalProductsApi = {
  list: (params?: Record<string, string | number | boolean | undefined>) =>
    api.get<{ products: VpsDigitalProduct[] }>("/digital-products", params),
  get: (id: string) => api.get<{ product: VpsDigitalProduct }>(`/digital-products/${id}`),
  create: (data: Partial<VpsDigitalProduct>) => api.post<{ id: string }>("/digital-products", data),
  update: (id: string, data: Partial<VpsDigitalProduct>) => api.patch<{ ok: true }>(`/digital-products/${id}`, data),
  del: (id: string) => api.del<{ ok: true }>(`/digital-products/${id}`),
};

export interface VpsOrder {
  id: string; total: number; status: string; created_at: string;
  items?: Array<{ 
    card_id?: string; price: number; brand?: string; bin?: string; last4?: string; country?: string;
    digital_product_id?: string; product_title?: string;
  }>;
}

export const ordersApi = {
  mine: () => api.get<{ orders: VpsOrder[] }>("/orders/mine"),
  all: () => api.get<{ orders: VpsOrder[] }>("/orders"),
};

export const walletApi = {
  balance: () => api.get<{ balance: number }>("/wallet"),
  transactions: () => api.get<{ transactions: Array<Record<string, unknown>> }>("/wallet/transactions"),
};

export const depositsApi = {
  submit: (data: { amount: number; method: string; proof_url?: string; note?: string }) =>
    api.post<{ deposit: Record<string, unknown> }>("/deposits", data),
  mine: () => api.get<{ deposits: Array<Record<string, unknown>> }>("/deposits/mine"),
  all: (params?: { status?: string; search?: string }) =>
    api.get<{ deposits: Array<Record<string, unknown>> }>("/deposits", params),
  approve: (id: string, admin_notes?: string) =>
    api.post<{ deposit: Record<string, unknown> }>(`/deposits/${id}/approve`, { admin_notes }),
  reject: (id: string, admin_notes?: string) =>
    api.post<{ deposit: Record<string, unknown> }>(`/deposits/${id}/reject`, { admin_notes }),
};

export const plisioApi = {
  createInvoice: (data: { amount: number; currency: string }) =>
    api.post<{
      deposit_id: string; invoice_id: string; wallet_address: string;
      crypto_amount: string; currency: string; invoice_url: string;
      qr_data: string; expires_at: string;
    }>("/plisio/create-invoice", data),
  currencies: () =>
    api.get<{ currencies: Array<{ id: string; name: string; icon: string; min: string }> }>("/plisio/currencies"),
  status: (depositId: string) =>
    api.get<{
      id: string; status: string; amount: number; crypto_currency: string;
      crypto_amount: number; wallet: string; confirmations: number; txid: string;
    }>(`/plisio/deposit-status/${depositId}`),
};

export const payoutsApi = {
  request: (data: { amount: number; method: string; destination: string }) =>
    api.post<{ payout: Record<string, unknown> }>("/payouts", data),
  mine: () => api.get<{ payouts: Array<Record<string, unknown>> }>("/payouts/mine"),
  all: (status?: string) => api.get<{ payouts: Array<Record<string, unknown>> }>("/payouts", { status }),
  complete: (id: string, admin_notes?: string) =>
    api.post<{ payout: Record<string, unknown> }>(`/payouts/${id}/complete`, { admin_notes }),
  reject: (id: string, admin_notes?: string) =>
    api.post<{ payout: Record<string, unknown> }>(`/payouts/${id}/reject`, { admin_notes }),
};

export const ticketsApi = {
  create: (data: { subject: string; body: string }) =>
    api.post<{ ticket: Record<string, unknown> }>("/tickets", data),
  mine: () => api.get<{ tickets: Array<Record<string, unknown>> }>("/tickets/mine"),
  messages: (id: string) => api.get<{ messages: Array<Record<string, unknown>> }>(`/tickets/${id}/messages`),
  reply: (id: string, body: string) => api.post<{ ok: true }>(`/tickets/${id}/reply`, { body }),
  all: (status?: string) => api.get<{ tickets: Array<Record<string, unknown>> }>("/tickets", { status }),
  close: (id: string) => api.post<{ ok: true }>(`/tickets/${id}/close`),
};

export const sellerAppsApi = {
  submit: (data: Record<string, unknown>) =>
    api.post<{ application: Record<string, unknown> }>("/seller-applications", data),
  mine: () => api.get<{ applications: Array<Record<string, unknown>> }>("/seller-applications/mine"),
  all: (status?: string) =>
    api.get<{ applications: Array<Record<string, unknown>> }>("/seller-applications", { status }),
  approve: (id: string, admin_notes?: string) =>
    api.post<{ application: Record<string, unknown> }>(`/seller-applications/${id}/approve`, { admin_notes }),
  reject: (id: string, admin_notes?: string) =>
    api.post<{ application: Record<string, unknown> }>(`/seller-applications/${id}/reject`, { admin_notes }),
};

export const announcementsApi = {
  list: () => api.get<{ announcements: Array<Record<string, unknown>> }>("/announcements"),
  create: (data: { title: string; body: string }) =>
    api.post<{ announcement: Record<string, unknown> }>("/announcements", data),
  del: (id: string) => api.del<{ ok: true }>(`/announcements/${id}`),
};

export const adminApi = {
  users: (q?: string) => api.get<{ users: Array<Record<string, unknown>> }>("/admin/users", { q }),
  stats: () => api.get<Record<string, unknown>>("/admin/stats"),
  vpsState: () => api.get<{
    timestamp: string;
    users: { total: number; admins: number; sellers: number; buyers: number; banned: number };
    cards: { total: number; available: number; sold: number; reserved: number };
    wallets: { count: number; total_balance: number; max_balance: number; avg_balance: number };
    orders: { total: number; revenue: number };
    pending_seller_applications: number;
    sellers_breakdown: Array<{ id: string; username: string; balance: number }>;
    top_buyers_by_balance: Array<{ id: string; username: string; balance: number }>;
  }>("/admin/vps-state"),
  updateProfile: (id: string, data: Record<string, unknown>) =>
    api.patch<{ ok: true }>(`/admin/users/${id}/profile`, data),
  adjustBalance: (id: string, delta: number) =>
    api.post<{ ok: true }>(`/admin/users/${id}/balance`, { delta }),
  toggleBan: (id: string) => api.post<{ ok: true }>(`/admin/users/${id}/toggle-ban`),
  revokeSeller: (id: string) => api.post<{ ok: true }>(`/admin/users/${id}/revoke-seller`),
  makeSeller: (id: string) => api.post<{ ok: true }>(`/admin/users/${id}/make-seller`),
  changePassword: (password: string) =>
    api.post<{ ok: true }>("/admin/change-password", { password }),
  impersonate: (id: string) =>
    api.post<{ token: string; user: { id: string; email: string; username: string; role: string } }>(`/admin/users/${id}/impersonate`),
  getNews: () => api.get<{ news: Array<Record<string, unknown>> }>("/admin/news"),
  postNews: (data: { title: string; body: string; type?: string }) =>
    api.post<{ id: string }>("/admin/news", data),
  deleteNews: (id: string) => api.del<{ ok: true }>(`/admin/news/${id}`),
};

export const siteSettingsApi = {
  get: () => api.get<{ settings: Record<string, unknown> }>("/site-settings"),
  update: (data: Record<string, unknown>) =>
    api.put<{ ok: true }>("/site-settings", data),
};

export const depositAddressesApi = {
  list: () => api.get<{ addresses: Array<Record<string, unknown>> }>("/deposit-addresses"),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch<{ ok: true }>(`/deposit-addresses/${id}`, data),
  create: (data: Record<string, unknown>) =>
    api.post<{ address: Record<string, unknown> }>("/deposit-addresses", data),
};

export const newsApi = {
  list: () => api.get<{ updates: Array<Record<string, unknown>> }>("/news"),
};

export const priceRulesApi = {
  mine: () => api.get<{ rules: Array<Record<string, unknown>> }>("/price-rules/mine"),
  create: (data: Record<string, unknown>) =>
    api.post<{ rule: Record<string, unknown> }>("/price-rules", data),
  del: (id: string) => api.del<{ ok: true }>(`/price-rules/${id}`),
};

export const refundsApi = {
  create: (data: Record<string, unknown>) =>
    api.post<{ refund: Record<string, unknown> }>("/refunds", data),
  mine: () => api.get<{ refunds: Array<Record<string, unknown>> }>("/refunds/mine"),
  all: (status?: string) => api.get<{ refunds: Array<Record<string, unknown>> }>("/refunds", { status }),
  decide: (id: string, approve: boolean, note?: string) =>
    api.post<{ ok: true }>(`/refunds/${id}/${approve ? "approve" : "reject"}`, { resolution_note: note }),
};

export const appNotesApi = {
  list: (applicationId: string) =>
    api.get<{ notes: Array<Record<string, unknown>> }>(`/seller-applications/${applicationId}/notes`),
  create: (applicationId: string, note: string) =>
    api.post<{ note: Record<string, unknown> }>(`/seller-applications/${applicationId}/notes`, { note }),
  del: (applicationId: string, noteId: string) =>
    api.del<{ ok: true }>(`/seller-applications/${applicationId}/notes/${noteId}`),
};

export const sellersApi = {
  visible: () => api.get<{ sellers: Array<Record<string, unknown>> }>("/sellers/visible"),
  profile: (id: string) => api.get<{ profile: Record<string, unknown> }>(`/sellers/${id}`),
  cards: (id: string, params?: Record<string, string | number | boolean | undefined>) =>
    api.get<{ cards: VpsCard[]; count: number }>(`/sellers/${id}/cards`, params),
};
