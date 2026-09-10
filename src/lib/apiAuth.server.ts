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
  credits: number;
}

/** Verify the key, enforce IP lock + daily limit, and charge credits for `cards`. */
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
  const { data, error } = await db.rpc("api_key_charge", {
    _key_hash: hashKey(raw),
    _ip: clientIp(request),
    _cards: Math.max(0, Math.floor(cards)),
  });
  if (error) {
    const msg = String(error.message ?? "invalid_key");
    const status =
      msg.includes("invalid_key") ? 401 :
      msg.includes("key_disabled") || msg.includes("ip_not_allowed") ? 403 :
      msg.includes("insufficient_credits") || msg.includes("daily_limit") ? 402 : 400;
    return { error: msg.replace(/^.*?([a-z_]+)$/, "$1"), status };
  }
  const row = (Array.isArray(data) ? data[0] : data) as ApiKeyRow | undefined;
  if (!row) return { error: "invalid_key", status: 401 };
  return { key: { id: String(row.id), label: String(row.label), credits: Number(row.credits ?? 0) } };
}

export async function refundApiKey(keyId: string, credits: number) {
  if (credits <= 0) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabaseAdmin as any).rpc("api_key_refund", { _key_id: keyId, _credits: credits });
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
