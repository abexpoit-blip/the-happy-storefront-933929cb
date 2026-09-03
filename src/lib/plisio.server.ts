/**
 * Server-only payment provider helpers (Plisio merchant API).
 * Never imported from client code.
 */
import { createHmac, timingSafeEqual } from "crypto";

const API = "https://api.plisio.net/api/v1";

export interface NewInvoice {
  txn_id: string;
  wallet_hash: string;
  amount: string;
  currency: string;
  expire_utc?: number | string;
  invoice_url?: string;
  qr_code?: string;
}

function apiKey(): string {
  const k = process.env.PLISIO_API_KEY;
  if (!k) throw new Error("payment_gateway_not_configured");
  return k;
}

async function call<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("api_key", apiKey());
  const res = await fetch(url.toString(), { headers: { accept: "application/json" } });
  const raw = await res.text();
  let json: { status?: string; data?: unknown; message?: string } = {};
  try {
    json = JSON.parse(raw) as typeof json;
  } catch {
    console.error("plisio non-json response", res.status, raw.slice(0, 300));
    throw new Error(`payment_gateway_error: HTTP ${res.status}`);
  }
  if (!res.ok || json.status !== "success" || !json.data) {
    const detail =
      json.message ??
      (json.data && typeof json.data === "object"
        ? (json.data as { message?: string }).message
        : undefined) ??
      raw.slice(0, 200);
    console.error("plisio error", res.status, detail);
    throw new Error(`payment_gateway_error: ${detail}`);
  }
  return json.data as T;
}

/** Percentage fee paid by the client on top of the credited amount. */
export const CLIENT_FEE_PERCENT = 2;

export async function createLtcInvoice(input: {
  usdAmount: number;
  orderNumber: string;
  /** Status (IPN) URL — server-to-server payment notifications. */
  callbackUrl: string;
  /** Success URL — where the buyer is redirected after a paid invoice. */
  successUrl: string;
  /** Failed URL — where the buyer is redirected on failure/expiry. */
  failUrl: string;
  email?: string;
}): Promise<NewInvoice> {
  return call<NewInvoice>("/invoices/new", {
    source_currency: "USD",
    source_amount: input.usdAmount.toFixed(2),
    order_number: input.orderNumber,
    currency: "LTC",
    order_name: "Wallet top-up",
    callback_url: input.callbackUrl,
    // buyer-facing redirects
    success_callback_url: input.callbackUrl,
    fail_callback_url: input.callbackUrl,
    success_invoice_url: input.successUrl,
    fail_invoice_url: input.failUrl,
    redirect_to_invoice: "true",
    expire_min: "30",
    ...(input.email ? { email: input.email } : {}),
  });
}


export interface Operation {
  status: string;
  confirmations?: string | number;
  tx_url?: string;
  amount?: string;
  source_amount?: string;
  invoice_total_sum?: string;
  wallet_hash?: string;
  invoice_url?: string;
}

export async function getOperation(txnId: string): Promise<Operation> {
  return call<Operation>(`/operations/${encodeURIComponent(txnId)}`, {});
}

/**
 * Map Plisio status → internal deposit status.
 * "mismatch" (under/over payment) stays pending for manual review.
 */
export function mapStatus(s: string): "approved" | "rejected" | "pending" {
  const v = (s || "").toLowerCase();
  if (v === "completed") return "approved";
  if (v === "expired" || v === "cancelled" || v === "error") return "rejected";
  return "pending";
}


/* ---- callback signature (PHP-serialize + HMAC-SHA1, per provider spec) ---- */

function phpSerialize(obj: Record<string, string>): string {
  const keys = Object.keys(obj).sort();
  const enc = (s: string) => `s:${Buffer.byteLength(s, "utf8")}:"${s}";`;
  return `a:${keys.length}:{${keys.map((k) => enc(k) + enc(obj[k])).join("")}}`;
}

export function verifyCallback(fields: Record<string, string>): boolean {
  const received = fields.verify_hash;
  if (!received) return false;
  const rest: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) if (k !== "verify_hash") rest[k] = v;
  const expected = createHmac("sha1", apiKey()).update(phpSerialize(rest)).digest("hex");
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
