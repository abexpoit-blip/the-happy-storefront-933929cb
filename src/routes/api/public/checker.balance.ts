import { createFileRoute } from "@tanstack/react-router";
import { authorizeApiKey, json } from "@/lib/apiAuth.server";

export const Route = createFileRoute("/api/public/checker/balance")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authorizeApiKey(request, 0);
        if ("error" in auth) return json({ status: "error", message: auth.error }, auth.status);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: setting } = await supabaseAdmin
          .from("site_settings")
          .select("value")
          .eq("key", "credits_per_usd")
          .maybeSingle();
        const parsedRate = Number(setting?.value ?? 1000);
        const creditsPerUsd = Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : 1000;
        return json({
          status: "success",
          label: auth.key.label,
          credits: auth.key.credits,
          balance: auth.key.balance,
          price_per_card: auth.key.pricePerCard,
          cards_affordable: auth.key.pricePerCard > 0
            ? Math.floor((auth.key.credits / creditsPerUsd + auth.key.balance) / auth.key.pricePerCard)
            : 0,
        });
      },
    },
  },
});
