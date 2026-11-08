/**
 * Server-only payment provider helpers for NOWPayments API.
 * Never imported from client code.
 */
import { createHmac, timingSafeEqual } from "crypto";

const API_BASE = "https://api.nowpayments.io/v1";

export interface NowPaymentResponse {
  payment_id: string;
  payment_status: string;
  pay_address: string;
  price_amount: number;
  price_currency: string;
  pay_amount: number;
  pay_currency: string;
  order_id: string;
  order_description?: string;
  ipn_callback_url?: string;
  created_at?: string;
  updated_at?: string;
  purchase_id?: string;
  network?: string;
}

export interface NowInvoiceResponse {
  id: string;
  order_id: string;
  order_description?: string;
  price_amount: string;
  price_currency: string;
  pay_currency?: string;
  ipn_callback_url?: string;
  invoice_url: string;
  success_url?: string;
  cancel_url?: string;
  created_at?: string;
  updated_at?: string;
}

export function getNowpaymentsApiKey(): string {
  const k = (process.env.NOWPAYMENTS_API_KEY || "").trim();
  if (!k) throw new Error("nowpayments_not_configured");
  return k;
}

export function getNowpaymentsIpnSecret(): string {
  return (process.env.NOWPAYMENTS_IPN_SECRET || "").trim();
}

/**
 * Creates a direct payment on NOWPayments.
 * Returns pay_address, pay_amount, and payment_id so user can pay directly on site.
 */
export async function createNowPayment(input: {
  usdAmount: number;
  orderNumber: string;
  payCurrency?: string; // defaults to 'ltc'
  callbackUrl: string;
  orderDescription?: string;
  payoutAddress?: string;
}): Promise<NowPaymentResponse> {
  const apiKey = getNowpaymentsApiKey();
  const payCurrency = (input.payCurrency || "ltc").toLowerCase();

  const payload: Record<string, unknown> = {
    price_amount: Number(input.usdAmount.toFixed(2)),
    price_currency: "usd",
    pay_currency: payCurrency,
    ipn_callback_url: input.callbackUrl,
    order_id: input.orderNumber,
    order_description: input.orderDescription || `Top-up Order #${input.orderNumber}`,
  };

  if (input.payoutAddress) {
    payload.payout_address = input.payoutAddress;
  }

  const res = await fetch(`${API_BASE}/payment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  const raw = await res.text();
  let json: any = {};
  try {
    json = JSON.parse(raw);
  } catch {
    console.error("[NOWPayments] Non-JSON response:", res.status, raw.slice(0, 300));
    throw new Error(`nowpayments_error: HTTP ${res.status}`);
  }

  if (!res.ok || json.status === false || !json.payment_id) {
    const msg = json.message || json.error || raw.slice(0, 200);
    console.error("[NOWPayments] Payment creation failed:", res.status, msg);
    throw new Error(`nowpayments_error: ${msg}`);
  }

  return json as NowPaymentResponse;
}

/**
 * Creates a hosted invoice on NOWPayments.
 * Returns hosted checkout invoice_url where user can pay.
 */
export async function createNowInvoice(input: {
  usdAmount: number;
  orderNumber: string;
  payCurrency?: string;
  callbackUrl: string;
  successUrl: string;
  cancelUrl: string;
  orderDescription?: string;
}): Promise<NowInvoiceResponse> {
  const apiKey = getNowpaymentsApiKey();

  const payload: Record<string, unknown> = {
    price_amount: Number(input.usdAmount.toFixed(2)),
    price_currency: "usd",
    order_id: input.orderNumber,
    order_description: input.orderDescription || `Top-up Order #${input.orderNumber}`,
    ipn_callback_url: input.callbackUrl,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  };

  if (input.payCurrency) {
    payload.pay_currency = input.payCurrency.toLowerCase();
  }

  const res = await fetch(`${API_BASE}/invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  const raw = await res.text();
  let json: any = {};
  try {
    json = JSON.parse(raw);
  } catch {
    console.error("[NOWPayments] Non-JSON response:", res.status, raw.slice(0, 300));
    throw new Error(`nowpayments_error: HTTP ${res.status}`);
  }

  if (!res.ok || json.status === false || !json.id) {
    const msg = json.message || json.error || raw.slice(0, 200);
    console.error("[NOWPayments] Invoice creation failed:", res.status, msg);
    throw new Error(`nowpayments_error: ${msg}`);
  }

  return json as NowInvoiceResponse;
}

/**
 * Fetches status of an existing payment by payment ID.
 */
export async function getNowPaymentStatus(paymentId: string): Promise<NowPaymentResponse | null> {
  const apiKey = getNowpaymentsApiKey();
  const res = await fetch(`${API_BASE}/payment/${encodeURIComponent(paymentId)}`, {
    headers: {
      "x-api-key": apiKey,
    },
  });

  if (!res.ok) return null;
  try {
    return (await res.json()) as NowPaymentResponse;
  } catch {
    return null;
  }
}

/**
 * Deep recursive sort of object keys for NOWPayments IPN verification.
 */
function sortObject(obj: any): any {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sortObject);
  return Object.keys(obj)
    .sort()
    .reduce((res: Record<string, any>, key) => {
      res[key] = sortObject(obj[key]);
      return res;
    }, {});
}

/**
 * Verifies NOWPayments IPN signature (x-nowpayments-sig header) using HMAC SHA-512.
 */
export function verifyNowpaymentsIpn(
  body: Record<string, unknown> | string,
  signatureHeader: string | null,
  ipnSecret?: string
): boolean {
  if (!signatureHeader) return false;
  const secret = (ipnSecret || getNowpaymentsIpnSecret()).trim();
  if (!secret) return false;

  try {
    let payloadObj: any = body;
    if (typeof body === "string") {
      payloadObj = JSON.parse(body);
    }

    const sorted = sortObject(payloadObj);
    const serialized = JSON.stringify(sorted);

    const hmac = createHmac("sha512", secret);
    hmac.update(serialized);
    const expectedSig = hmac.digest("hex");

    const a = Buffer.from(expectedSig, "hex");
    const b = Buffer.from(signatureHeader, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch (err) {
    console.error("[NOWPayments] Signature verification error:", err);
    return false;
  }
}

/**
 * Maps NOWPayments payment_status string to internal deposit status.
 *
 * NOWPayments statuses:
 * - waiting: waiting for customer payment
 * - confirming: payment detected, waiting for block confirmations
 * - confirmed: payment confirmed, funds being sent
 * - sending: funds sent to merchant wallet
 * - partially_paid: customer paid less than requested
 * - finished: completed successfully
 * - failed: payment failed
 * - refunded: payment refunded
 * - expired: payment expired
 */
export function mapNowPaymentStatus(
  paymentStatus: string
): "pending" | "approved" | "rejected" {
  const st = (paymentStatus || "").toLowerCase().trim();

  if (st === "finished" || st === "confirmed" || st === "sending") {
    return "approved";
  }
  if (st === "failed" || st === "refunded" || st === "expired") {
    return "rejected";
  }
  return "pending";
}
