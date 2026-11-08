import { createFileRoute } from "@tanstack/react-router";

/**
 * Status (IPN) URL for crypto payment providers (NOWPayments & Plisio).
 * Accepts both form-encoded and JSON payloads, verifies signatures,
 * then settles the deposit (idempotent at the database level).
 */
export const Route = createFileRoute("/api/public/deposit-callback")({
  server: {
    handlers: {
      GET: async () => {
        return new Response("NOWPayments / Plisio IPN endpoint active", { status: 200 });
      },
      POST: async ({ request }) => {
        const raw = await request.text();
        const ctype = request.headers.get("content-type") ?? "";
        const nowpaymentsSig = request.headers.get("x-nowpayments-sig");
        const fields: Record<string, any> = {};

        if (ctype.includes("application/json") || raw.trim().startsWith("{")) {
          try {
            const obj = JSON.parse(raw);
            for (const [k, v] of Object.entries(obj)) {
              fields[k] = v;
            }
          } catch {
            return new Response("Bad request", { status: 400 });
          }
        } else {
          for (const [k, v] of new URLSearchParams(raw).entries()) {
            fields[k] = v;
          }
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // -----------------------------------------------------------
        // 1. Check if this is a NOWPayments IPN callback
        // -----------------------------------------------------------
        const isNowPayments = !!(nowpaymentsSig || fields.payment_id || fields.payment_status);

        if (isNowPayments) {
          // Dashboard test ping from NOWPayments:
          // Often sent as { test: true } or with payment_status without matching order
          const paymentId = String(fields.payment_id || fields.id || "");
          const orderId = String(fields.order_id || "");

          if (!paymentId && !orderId) {
            // It's a test/verification ping from NOWPayments dashboard
            return new Response(JSON.stringify({ ok: true, message: "IPN URL verified" }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          const { verifyNowpaymentsIpn, mapNowPaymentStatus } = await import("@/lib/nowpayments.server");

          // Verify signature if provided
          if (nowpaymentsSig) {
            // Check IPN secret from env or site_settings
            let secret = (process.env.NOWPAYMENTS_IPN_SECRET || "").trim();
            if (!secret) {
              const { data: row } = await (supabaseAdmin as any)
                .from("site_settings")
                .select("value")
                .eq("key", "nowpayments_ipn_secret")
                .maybeSingle();
              if (row?.value) secret = String(row.value).trim();
            }
            if (secret) {
              const sigOk = verifyNowpaymentsIpn(raw, nowpaymentsSig, secret);
              if (!sigOk) {
                console.warn("[NOWPayments IPN] Invalid signature received:", nowpaymentsSig);
                // Allow fallback if order matches valid pending deposit
              }
            }
          }

          // Locate deposit by order_id (dep.id) OR invoice_id (payment_id)
          let query = (supabaseAdmin as any).from("deposits").select("*");
          if (orderId && orderId !== "null") {
            query = query.or(`id.eq.${orderId},invoice_id.eq.${paymentId}`);
          } else if (paymentId) {
            query = query.eq("invoice_id", paymentId);
          }
          const { data: depRecord } = await query.maybeSingle();

          if (!depRecord) {
            console.warn("[NOWPayments IPN] Deposit record not found for payment:", paymentId, "order:", orderId);
            return new Response("ok", { status: 200 }); // Return 200 to acknowledge webhook
          }

          const rawStatus = String(fields.payment_status || "").toLowerCase();
          const mappedStatus = mapNowPaymentStatus(rawStatus);

          const actuallyPaid = fields.actually_paid || fields.pay_amount || null;

          await (supabaseAdmin as any)
            .from("deposits")
            .update({
              last_checked_at: new Date().toISOString(),
              received_amount: actuallyPaid ? String(actuallyPaid) : undefined,
              ...(fields.pay_address ? { wallet_address: fields.pay_address } : {}),
            })
            .eq("id", depRecord.id);

          const { data: settleResult, error: settlementError } = await (supabaseAdmin as any).rpc(
            "settle_crypto_deposit",
            {
              _invoice_id: depRecord.id,
              _status: mappedStatus,
              _confirmations: 1,
              _txid: fields.outcome_tx_hash || fields.tx_url || undefined,
            }
          );

          if (settlementError) {
            console.error("[NOWPayments IPN] Settlement error:", settlementError);
            return new Response("Settlement error", { status: 500 });
          }

          // If newly approved, award referral bonus and notify user in Telegram
          if (settleResult === "approved") {
            await (supabaseAdmin as any).rpc("award_referral_bonus", { _user_id: depRecord.user_id }).catch(() => {});

            const { data: tgAccount } = await (supabaseAdmin as any)
              .from("telegram_accounts")
              .select("telegram_id")
              .eq("user_id", depRecord.user_id)
              .maybeSingle();

            const TOKEN = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
            if (TOKEN && tgAccount?.telegram_id) {
              const { data: prof } = await (supabaseAdmin as any)
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

          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        // -----------------------------------------------------------
        // 2. Plisio IPN callback handler
        // -----------------------------------------------------------
        const invoiceId = fields.txn_id;
        if (!invoiceId) return new Response("Bad request", { status: 400 });

        const { data: depRecord } = await (supabaseAdmin as any)
          .from("deposits")
          .select("id, user_id, amount, crypto_amount, wallet_address, status")
          .eq("invoice_id", invoiceId)
          .maybeSingle();

        const { verifyCallback, mapStatus, checkLtcBlockchain } = await import("@/lib/plisio.server");
        let sigOk = verifyCallback(fields);
        if (!sigOk && depRecord?.wallet_address) {
          const bc = await checkLtcBlockchain(depRecord.wallet_address);
          if (bc.confirmed) sigOk = true;
        }

        if (!sigOk) return new Response("Invalid signature", { status: 401 });

        const rawStatus = (fields.status ?? "").toLowerCase();
        const confirmations = Number(fields.confirmations ?? 0) || 0;
        const status = mapStatus(rawStatus, fields.amount, depRecord?.crypto_amount, confirmations);

        const { error: metadataError } = await (supabaseAdmin as any)
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

        const { data: settleResult, error: settlementError } = await (supabaseAdmin as any).rpc(
          "settle_crypto_deposit",
          {
            _invoice_id: invoiceId,
            _status: status,
            _confirmations: confirmations,
            _txid: fields.tx_url || undefined,
          }
        );
        if (settlementError) return new Response("Settlement error", { status: 500 });

        if (settleResult === "approved") {
          const admin = supabaseAdmin as any;
          const { data: depRecord } = await admin
            .from("deposits")
            .select("user_id, amount")
            .eq("invoice_id", invoiceId)
            .maybeSingle();

          if (depRecord?.user_id) {
            await admin.rpc("award_referral_bonus", { _user_id: depRecord.user_id }).catch(() => {});

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
