/** Server-only helpers for merchant/bot API keys. */
import { createHash, randomBytes } from "crypto";

export const hashKey = (raw: string) => createHash("sha256").update(raw.trim()).digest("hex");

export const newApiKey = () => {
  const raw = `zk_${randomBytes(24).toString("hex")}`;
  return { raw, hash: hashKey(raw), prefix: raw.slice(0, 10) };
};

export const clientIp = (request: Request) => {
  const h = request.headers;
  const fwd = h.get("x-forwarded-for") ?? "";
  return (fwd.split(",")[0] || h.get("x-real-ip") || h.get("cf-connecting-ip") || "").trim();
};

export interface ApiKeyRow {
  id: string;
  label: string;
  /** Credits left on the key. */
  credits: number;
  /** Owner account balance in USD. */
  balance: number;
  /** Credits taken for this request. */
  chargedCredits: number;
  /** USD taken from the owner balance for this request. */
  chargedUsd: number;
  /** Price per card in USD. */
  pricePerCard: number;
}

/**
 * Verify the key, enforce IP lock + daily limit, and charge this request.
 * Cards cost `api_check_price` USD each ($0.02 by default): the key's credits
 * are spent first, anything left is taken from the owner's account balance.
 */
export async function authorizeApiKey(
  request: Request,
  cards: number,
): Promise<{ key: ApiKeyRow } | { error: string; status: number }> {
  const raw = (request.headers.get("x-api-key") ?? request.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!raw) return { error: "missing_api_key", status: 401 };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const { data, error } = await db.rpc("api_key_charge_usd", {
    _key_hash: hashKey(raw),
    _ip: clientIp(request),
    _cards: Math.max(0, Math.floor(cards)),
  });
  if (error) {
    const msg = String(error.message ?? "invalid_key");
    const known = [
      "invalid_key",
      "key_disabled",
      "ip_not_allowed",
      "insufficient_balance",
      "insufficient_credits",
      "daily_limit_reached",
    ].find((k) => msg.includes(k));
    const status =
      known === "invalid_key" || !known ? 401 :
      known === "key_disabled" || known === "ip_not_allowed" ? 403 : 402;
    return { error: known ?? "invalid_key", status };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = (Array.isArray(data) ? data[0] : data) as any;
  if (!row) return { error: "invalid_key", status: 401 };
  return {
    key: {
      id: String(row.id),
      label: String(row.label),
      credits: Number(row.credits ?? 0),
      balance: Number(row.balance ?? 0),
      chargedCredits: Number(row.charged_credits ?? 0),
      chargedUsd: Number(row.charged_usd ?? 0),
      pricePerCard: Number(row.price_per_card ?? 0.02),
    },
  };
}

/** Give back credits and/or USD for cards the gateway never answered. */
export async function refundApiKey(keyId: string, credits: number, usd = 0) {
  if (credits <= 0 && usd <= 0) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabaseAdmin as any).rpc("api_key_refund_mixed", {
    _key_id: keyId,
    _credits: Math.max(0, Math.round(credits)),
    _usd: Math.max(0, Number(usd.toFixed(4))),
  });
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
