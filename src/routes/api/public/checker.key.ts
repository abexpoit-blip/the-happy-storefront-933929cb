/**
 * Bot-admin endpoint: issue an API key from outside the web UI (used by the
 * Telegram checker bot so an admin can hand out keys straight from chat).
 *
 * Auth: `x-bot-admin-secret` header must match BOT_ADMIN_SECRET (server env).
 * The plaintext key is returned exactly once — it is only stored hashed.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { newApiKey, json } from "@/lib/apiAuth.server";
import { timingSafeEqual } from "crypto";

const bodySchema = z.object({
  label: z.string().min(2).max(80),
  credits: z.number().int().min(0).max(10_000_000).optional(),
  daily_limit: z.number().int().min(0).max(1_000_000).optional(),
  owner_note: z.string().max(200).optional(),
  locked_ip: z.string().max(64).nullable().optional(),
});

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export const Route = createFileRoute("/api/public/checker/key")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = (process.env["BOT_ADMIN_SECRET"] ?? "").trim();
        if (!secret) return json({ status: "error", message: "bot_admin_not_configured" }, 503);
        const given = (request.headers.get("x-bot-admin-secret") ?? "").trim();
        if (!given || !safeEqual(given, secret)) {
          return json({ status: "error", message: "unauthorized" }, 401);
        }

        let body: z.infer<typeof bodySchema>;
        try {
          body = bodySchema.parse(await request.json());
        } catch {
          return json({ status: "error", message: "invalid_body" }, 400);
        }

        const { raw, hash, prefix } = newApiKey();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabaseAdmin as any;
        const { data, error } = await db
          .from("api_keys")
          .insert({
            label: body.label,
            owner_note: body.owner_note ?? "issued from telegram bot",
            key_hash: hash,
            prefix,
            credits: body.credits ?? 0,
            daily_limit: body.daily_limit ?? 5000,
            locked_ip: body.locked_ip ?? null,
            active: true,
          })
          .select("id, label, credits, daily_limit")
          .maybeSingle();

        if (error) return json({ status: "error", message: String(error.message) }, 500);

        return json({
          status: "success",
          api_key: raw,
          id: data?.id ?? null,
          label: data?.label ?? body.label,
          credits: Number(data?.credits ?? 0),
          daily_limit: Number(data?.daily_limit ?? 0),
        });
      },
    },
  },
});
