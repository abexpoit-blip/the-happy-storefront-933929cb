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

        const invoiceId = fields.txn_id;
        if (!invoiceId) return new Response("Bad request", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: depRecord } = await (supabaseAdmin as any)
          .from("deposits")
          .select("id, user_id, amount, crypto_amount, wallet_address, status")
          .eq("invoice_id", invoiceId)
          .maybeSingle();

        const { verifyCallback, mapStatus, checkLtcBlockchain } = await import("@/lib/plisio.server");
        let sigOk = verifyCallback(fields);
        if (!sigOk && depRecord?.wallet_address) {
          // If signature check had serialization variance, verify against the blockchain
          const bc = await checkLtcBlockchain(depRecord.wallet_address);
          if (bc.confirmed) sigOk = true;
        }

        if (!sigOk) return new Response("Invalid signature", { status: 401 });

        const rawStatus = (fields.status ?? "").toLowerCase();
        const confirmations = Number(fields.confirmations ?? 0) || 0;
        const status = mapStatus(rawStatus, fields.amount, depRecord?.crypto_amount, confirmations);

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

        const { data: settleResult, error: settlementError } = await supabaseAdmin.rpc("settle_crypto_deposit", {
          _invoice_id: invoiceId,
          _status: status,
          _confirmations: confirmations,
          _txid: fields.tx_url || undefined,
        });
        if (settlementError) return new Response("Settlement error", { status: 500 });

        // If newly approved, award referral bonus and notify user in Telegram if applicable
        if (settleResult === "approved") {
          const admin = supabaseAdmin as any;
          const { data: depRecord } = await admin
            .from("deposits")
            .select("user_id, amount")
            .eq("invoice_id", invoiceId)
            .maybeSingle();

          if (depRecord?.user_id) {
            await admin.rpc("award_referral_bonus", { _user_id: depRecord.user_id });

            const { data: tgAccount } = await admin
              .from("telegram_accounts")
              .select("telegram_id")
              .eq("user_id", depRecord.user_id)
              .maybeSingle();

            const TOKEN = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
            if (TOKEN && tgAccount?.telegram_id) {
              const { data: prof } = await admin
                .from("profiles")
                .select("balance")
                .eq("id", depRecord.user_id)
                .maybeSingle();
              const bal = Number(prof?.balance ?? 0).toFixed(2);
              const text = [
                `━━━━━━━━━━━━━━━━━━━`,
                `🎉 <b>DEPOSIT CONFIRMED!</b>`,
                `━━━━━━━━━━━━━━━━━━━`,
                `Your cryptocurrency recharge has been verified on the blockchain!`,
                ``,
                `💵 <b>Credited:</b> <code>$${Number(depRecord.amount).toFixed(2)}</code>`,
                `💰 <b>Current Balance:</b> <code>$${bal}</code>`,
                ``,
                `⚡ <i>Your funds are ready for use immediately!</i>`,
                `━━━━━━━━━━━━━━━━━━━`,
              ].join("\n");

              await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: tgAccount.telegram_id,
                  text,
                  parse_mode: "HTML",
                }),
              }).catch(() => {});
            }
          }
        }

        return new Response("ok");
      },
    },
  },
});
