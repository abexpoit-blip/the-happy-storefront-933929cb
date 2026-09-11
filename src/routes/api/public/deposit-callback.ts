import { createFileRoute } from "@tanstack/react-router";

/**
 * Status (IPN) URL for the crypto payment provider.
 * Accepts both form-encoded and JSON payloads, verifies the signature,
 * then settles the deposit (idempotent at the database level).
 */
export const Route = createFileRoute("/api/public/deposit-callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const ctype = request.headers.get("content-type") ?? "";
        const fields: Record<string, string> = {};

        if (ctype.includes("application/json")) {
          try {
            const obj = JSON.parse(raw) as Record<string, unknown>;
            for (const [k, v] of Object.entries(obj)) {
              fields[k] = typeof v === "string" ? v : JSON.stringify(v);
            }
          } catch {
            return new Response("Bad request", { status: 400 });
          }
        } else {
          for (const [k, v] of new URLSearchParams(raw).entries()) fields[k] = v;
        }

        const { verifyCallback, mapStatus } = await import("@/lib/plisio.server");
        if (!verifyCallback(fields)) return new Response("Invalid signature", { status: 401 });

        const invoiceId = fields.txn_id;
        if (!invoiceId) return new Response("Bad request", { status: 400 });

        const rawStatus = (fields.status ?? "").toLowerCase();
        const status = mapStatus(rawStatus);
        const confirmations = Number(fields.confirmations ?? 0) || 0;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { error: metadataError } = await supabaseAdmin
          .from("deposits")
          .update({
            last_checked_at: new Date().toISOString(),
            tx_url: fields.tx_url || null,
            received_amount: fields.amount || null,
            ...(rawStatus === "mismatch"
              ? { admin_note: `Payment mismatch — received ${fields.amount ?? "?"}, manual review required` }
              : {}),
          })
          .eq("invoice_id", invoiceId);
        if (metadataError) return new Response("Database error", { status: 500 });

        const { error: settlementError } = await supabaseAdmin.rpc("settle_crypto_deposit", {
          _invoice_id: invoiceId,
          _status: status,
          _confirmations: confirmations,
          _txid: fields.tx_url || undefined,
        });
        if (settlementError) return new Response("Settlement error", { status: 500 });

        return new Response("ok");
      },
    },
  },
});
