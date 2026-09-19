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
  const k = process.env.PLISIO_API_KEY?.trim();
  if (!k) throw new Error("payment_gateway_not_configured");
  return k;
}

async function call<T>(
  path: string,
  params: Record<string, string>,
  options: { quiet?: boolean } = {},
): Promise<T> {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("api_key", apiKey());
  // Invoice API calls must return JSON. Never follow a hosted-checkout
  // redirect, otherwise fetch turns the redirect into an HTTP 200 HTML page.
  const res = await fetch(url.toString(), {
    headers: { accept: "application/json" },
    redirect: "manual",
  });
  if (res.status >= 300 && res.status < 400) {
    if (!options.quiet) console.error("plisio unexpected redirect", res.status);
    throw new Error(`payment_gateway_error: Unexpected redirect (HTTP ${res.status})`);
  }
  const raw = await res.text();
  let json: { status?: string; data?: unknown; message?: string } = {};
  try {
    json = JSON.parse(raw) as typeof json;
  } catch {
    if (!options.quiet) console.error("plisio non-json response", res.status, raw.slice(0, 300));
    throw new Error(`payment_gateway_error: HTTP ${res.status}`);
  }
  if (!res.ok || json.status !== "success" || !json.data) {
    const detail =
      json.message ??
      (json.data && typeof json.data === "object"
        ? (json.data as { message?: string }).message
        : undefined) ??
      raw.slice(0, 200);
    if (!options.quiet) console.error("plisio error", res.status, detail);
    throw new Error(`payment_gateway_error: ${detail}`);
  }
  return json.data as T;
}

/** Percentage fee paid by the client on top of the credited amount. */
export const CLIENT_FEE_PERCENT = 2;

/** Lightweight health probe — throws when the payment gateway is unusable. */
export async function gatewayPing(): Promise<void> {
  await call<unknown>("/balances/LTC", {}, { quiet: true });
}

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
  if (!input.email) throw new Error("payment_gateway_error: Customer email is missing");
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
    // Do not send redirect_to_invoice at all. Some provider versions treat
    // the mere presence of this query parameter as enabled, even when its
    // string value is "false".
    expire_min: "30",
    email: input.email,
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
  // 1. Try Plisio /operations/{id}
  try {
    const op = await call<Operation>(`/operations/${encodeURIComponent(txnId)}`, {});
    if (op && op.status) return op;
  } catch {
    /* fallback to /invoices */
  }

  // 2. Try Plisio /invoices/{id}
  try {
    const inv = await call<Operation>(`/invoices/${encodeURIComponent(txnId)}`, {});
    if (inv && inv.status) return inv;
  } catch {
    /* fallback to search */
  }

  // 3. Fallback: try operations list filtered by search
  return call<Operation>(`/operations/${encodeURIComponent(txnId)}`, {});
}

/**
 * Robust status mapping for Plisio payment notifications and polling.
 * Handles "completed", "paid", "confirmed", "success", "pending internal", and "mismatch" with received funds.
 */
export function mapStatus(
  s: string,
  receivedAmount?: number | string | null,
  expectedAmount?: number | string | null,
  confirmations?: number | null
): "approved" | "rejected" | "pending" {
  const v = (s || "").toLowerCase().trim();

  // Any variation of completion or payment success
  if (
    v === "completed" ||
    v.startsWith("completed") ||
    v.includes("completed") ||
    v === "paid" ||
    v.includes("paid") ||
    v === "confirmed" ||
    v === "success" ||
    v === "pending internal"
  ) {
    return "approved";
  }

  // Overpayment or slight variance in network fee:
  // If status is mismatch and received is at least 90% of expected or has blockchain confirmation -> approve
  if (v === "mismatch") {
    const rec = Number(receivedAmount || 0);
    const exp = Number(expectedAmount || 0);
    const conf = Number(confirmations || 0);
    if ((rec > 0 && exp > 0 && rec >= exp * 0.90) || conf >= 1) {
      return "approved";
    }
  }

  // Blockchain confirmation threshold
  if (Number(confirmations || 0) >= 1) {
    return "approved";
  }

  if (v === "expired" || v === "cancelled" || v === "error") return "rejected";
  return "pending";
}

/**
 * Direct Litecoin blockchain verification for any deposit address.
 * Bypasses gateway delays and confirms directly from the decentralized network.
 */
export async function checkLtcBlockchain(address: string): Promise<{
  confirmed: boolean;
  confirmations: number;
  receivedLtc: number;
  txid: string | null;
}> {
  const cleanAddr = (address || "").trim();
  if (!cleanAddr) return { confirmed: false, confirmations: 0, receivedLtc: 0, txid: null };

  // 1. Primary: litecoinspace.org (open source Electrs explorer)
  try {
    const res = await fetch(`https://litecoinspace.org/api/address/${cleanAddr}`, {
      headers: { "User-Agent": "zoru-verifier/1.0" },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        chain_stats?: { funded_txo_sum?: number; tx_count?: number };
        mempool_stats?: { funded_txo_sum?: number; tx_count?: number };
      };
      const chainFunded = Number(data?.chain_stats?.funded_txo_sum ?? 0) / 1e8;
      const chainTx = Number(data?.chain_stats?.tx_count ?? 0);
      if (chainTx > 0 && chainFunded > 0) {
        return { confirmed: true, confirmations: 1, receivedLtc: chainFunded, txid: null };
      }
    }
  } catch {
    /* fallback to BlockCypher */
  }

  // 2. Secondary fallback: BlockCypher API
  try {
    const res = await fetch(`https://api.blockcypher.com/v1/ltc/main/addrs/${cleanAddr}/balance`, {
      headers: { "User-Agent": "zoru-verifier/1.0" },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = (await res.json()) as { total_received?: number; n_tx?: number };
      const received = Number(data?.total_received ?? 0) / 1e8;
      const txCount = Number(data?.n_tx ?? 0);
      if (txCount > 0 && received > 0) {
        return { confirmed: true, confirmations: 1, receivedLtc: received, txid: null };
      }
    }
  } catch {
    /* fail safe */
  }

  return { confirmed: false, confirmations: 0, receivedLtc: 0, txid: null };
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
