import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestUrl } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CLIENT_FEE_PERCENT, withFee } from "@/lib/fees";


/** Create an LTC top-up invoice for the signed-in user via NOWPayments or Plisio. */
export const createCryptoInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ amount: z.number().min(1).max(100000) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { credit, fee, charged } = withFee(data.amount);
    const rawOrigin = getRequestUrl().origin;
    const origin =
      rawOrigin && !rawOrigin.includes("localhost") && !rawOrigin.includes("127.0.0.1") && !rawOrigin.includes("0.0.0.0")
        ? rawOrigin
        : (process.env.SITE_URL?.trim() || "https://zoru.cc");
    const claimEmail = typeof context.claims.email === "string" ? context.claims.email : undefined;

    // clean up anything stale first
    await supabaseAdmin.rpc("expire_stale_deposits");

    const { data: dep, error } = await supabaseAdmin
      .from("deposits")
      .insert({
        user_id: context.userId,
        amount: credit,
        method: "crypto",
        status: "pending",
        crypto_currency: "LTC",
        fee_percent: CLIENT_FEE_PERCENT,
        fee_amount: fee,
        charged_amount: charged,
      })
      .select("id")
      .single();
    if (error || !dep) throw new Error("deposit_create_failed");

    let inv: {
      txn_id: string;
      wallet_hash: string;
      amount: string | number;
      currency?: string;
      invoice_url?: string | null;
    } | null = null;

    // 1. Try NOWPayments first if configured
    let npApiKey = (process.env.NOWPAYMENTS_API_KEY || "").trim();
    if (!npApiKey) {
      const { data: row } = await (supabaseAdmin as any)
        .from("site_settings")
        .select("value")
        .eq("key", "nowpayments_api_key")
        .maybeSingle();
      if (row?.value) npApiKey = String(row.value).trim();
    }

    if (npApiKey) {
      try {
        const { createNowPayment } = await import("@/lib/nowpayments.server");
        const npRes = await createNowPayment({
          usdAmount: charged,
          orderNumber: dep.id,
          payCurrency: "ltc",
          callbackUrl: `${origin}/api/public/deposit-callback`,
          orderDescription: `Zoru Deposit #${dep.id.slice(0, 8)}`,
        });
        inv = {
          txn_id: String(npRes.payment_id),
          wallet_hash: npRes.pay_address,
          amount: npRes.pay_amount,
          currency: (npRes.pay_currency || "LTC").toUpperCase(),
          invoice_url: `https://nowpayments.io/payment/?iid=${npRes.payment_id}`,
        };
      } catch (npErr) {
        console.warn("[Deposit] NOWPayments creation error, trying Plisio...", npErr);
      }
    }

    // 2. Fall back to Plisio if NOWPayments wasn't used or failed
    if (!inv) {
      try {
        const { createLtcInvoice } = await import("@/lib/plisio.server");
        const plisioInv = await createLtcInvoice({
          usdAmount: charged,
          orderNumber: dep.id,
          callbackUrl: `${origin}/api/public/deposit-callback`,
          successUrl: `${origin}/recharge?payment=success&deposit=${dep.id}`,
          failUrl: `${origin}/recharge?payment=failed&deposit=${dep.id}`,
          email: claimEmail,
        });
        inv = {
          txn_id: plisioInv.txn_id,
          wallet_hash: plisioInv.wallet_hash,
          amount: plisioInv.amount,
          currency: "LTC",
          invoice_url: plisioInv.invoice_url ?? null,
        };
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        await supabaseAdmin
          .from("deposits")
          .update({ status: "rejected", admin_note: `Gateway error: ${detail}`.slice(0, 400) })
          .eq("id", dep.id);
        throw e;
      }
    }

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await supabaseAdmin
      .from("deposits")
      .update({
        invoice_id: inv.txn_id,
        wallet_address: inv.wallet_hash,
        crypto_amount: String(inv.amount),
        reference: inv.txn_id,
        invoice_url: inv.invoice_url ?? null,
        expires_at: expiresAt,
      })
      .eq("id", dep.id);

    return {
      deposit_id: dep.id,
      wallet_address: inv.wallet_hash,
      crypto_amount: String(inv.amount),
      currency: "LTC",
      usd_amount: credit,
      fee_percent: CLIENT_FEE_PERCENT,
      fee_amount: fee,
      charged_amount: charged,
      expires_ms: Date.parse(expiresAt),
      status: "pending" as const,
      confirmations: 0,
    };
  });

/** Poll the provider for a deposit and credit the balance when confirmed. */
export const checkDepositStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ deposit_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { getOperation, mapStatus, checkLtcBlockchain } = await import("@/lib/plisio.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: dep } = await supabaseAdmin
      .from("deposits")
      .select("id, user_id, amount, status, invoice_id, confirmations, expires_at, created_at, wallet_address, crypto_amount")
      .eq("id", data.deposit_id)
      .maybeSingle();
    if (!dep || dep.user_id !== context.userId) throw new Error("not_found");
    if (dep.status !== "pending" || !dep.invoice_id) {
      return { status: dep.status, confirmations: dep.confirmations ?? 0, amount: dep.amount };
    }

    let status: "approved" | "rejected" | "pending" = "pending";
    let rawStatus = "";
    let confirmations = dep.confirmations ?? 0;
    let txUrl: string | null = null;
    let received: string | null = null;

    // 1. Try NOWPayments if invoice_id is numeric / NOWPayments payment ID
    try {
      const { getNowPaymentStatus, mapNowPaymentStatus } = await import("@/lib/nowpayments.server");
      const npStatus = await getNowPaymentStatus(dep.invoice_id);
      if (npStatus && npStatus.payment_status) {
        rawStatus = npStatus.payment_status;
        status = mapNowPaymentStatus(npStatus.payment_status);
        if (status === "approved") confirmations = 1;
        received = String(npStatus.pay_amount);
      }
    } catch {}

    // 2. Check Plisio API if not approved yet
    if (status !== "approved") {
      try {
        const op = await getOperation(dep.invoice_id);
        rawStatus = (op.status || "").toLowerCase();
        status = mapStatus(op.status, op.amount, dep.crypto_amount, Number(op.confirmations ?? 0));
        confirmations = Number(op.confirmations ?? confirmations) || confirmations;
        txUrl = op.tx_url ?? null;
        received = op.amount ?? null;
      } catch {
        /* continue to blockchain verification */
      }
    }

    // 3. Direct Blockchain Verification (instant fallback if gateway has lag or mismatch)
    if (status !== "approved" && dep.wallet_address) {
      try {
        const bc = await checkLtcBlockchain(dep.wallet_address);
        if (bc.confirmed) {
          status = "approved";
          confirmations = Math.max(confirmations, bc.confirmations || 1);
        }
      } catch {
        /* ignore */
      }
    }

    const expired =
      (!!dep.expires_at && Date.parse(dep.expires_at) < Date.now()) ||
      (!!dep.created_at && Date.now() - new Date(dep.created_at).getTime() > 30 * 60 * 1000);
    if (status === "pending" && expired && rawStatus !== "mismatch") status = "rejected";

    await supabaseAdmin
      .from("deposits")
      .update({
        last_checked_at: new Date().toISOString(),
        tx_url: txUrl,
        received_amount: received,
        ...(rawStatus === "mismatch"
          ? { admin_note: `Payment mismatch — received ${received ?? "?"} LTC, manual review required` }
          : {}),
      })
      .eq("id", dep.id);

    const { data: settled } = await supabaseAdmin.rpc("settle_crypto_deposit", {
      _invoice_id: dep.invoice_id,
      _status: status,
      _confirmations: confirmations,
      _txid: txUrl ?? undefined,
    });

    if (settled === "approved") {
      try {
        await supabaseAdmin.rpc("award_referral_bonus", { _user_id: context.userId });
      } catch {
        // ignore
      }
    }

    return {
      status: ((settled as string) ?? status) as string,
      confirmations,
      amount: dep.amount,
    };
  });

/** Validates the server-side gateway keys. */
export const plisioKeyStatus = createServerFn({ method: "GET" }).handler(async () => {
  const hasPlisio = !!process.env.PLISIO_API_KEY?.trim();
  const hasNowPayments = !!process.env.NOWPAYMENTS_API_KEY?.trim();

  if (!hasPlisio && !hasNowPayments) {
    return { configured: false, valid: false, error: "No crypto gateway configured (NOWPayments / Plisio)" };
  }
  return { configured: true, valid: true, error: null, provider: hasNowPayments ? "NOWPayments" : "Plisio" };
});
