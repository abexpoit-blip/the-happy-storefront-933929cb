import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authorizeApiKey, refundApiKey, json } from "@/lib/apiAuth.server";
import { parseCardLine, digits, maskPan } from "@/lib/cardLine";

const bodySchema = z.object({
  cards: z.array(z.string()).min(1).max(500),
  gate: z.string().min(1).max(80).optional(),
});

export const Route = createFileRoute("/api/public/checker/check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let parsed: z.infer<typeof bodySchema>;
        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return json({ status: "error", message: "invalid_body" }, 400);
        }

        const lines = [...new Set(parsed.cards.map(parseCardLine).filter(Boolean) as string[])];
        if (!lines.length) return json({ status: "error", message: "no_valid_cards" }, 400);

        const auth = await authorizeApiKey(request, lines.length);
        if ("error" in auth) return json({ status: "error", message: auth.error }, auth.status);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabaseAdmin as any;

        const { data: gateRow } = await db
          .from("site_settings").select("value").eq("key", "self_check_gate").maybeSingle();
        const gate = parsed.gate?.trim() || String(gateRow?.value || "CCV_Braintree_Auth");

        let taskId: string;
        try {
          const { createTask } = await import("@/lib/checkerccv.server");
          taskId = await createTask(gate, lines);
        } catch (e) {
          await refundApiKey(auth.key.id, auth.key.chargedCredits, auth.key.chargedUsd);
          return json(
            { status: "error", message: e instanceof Error ? e.message : "gateway_error" },
            502,
          );
        }

        const submitted = lines.map((line) => ({
          card: maskPan(digits(line.split("|")[0] ?? "")),
          status: "skipped" as const,
          category: "Pending",
          msg: "Waiting for gateway result",
          pending: true,
        }));

        await db.from("self_checks").insert({
          user_id: null,
          task_id: taskId,
          gate,
          total: lines.length,
          cost: Math.round((lines.length * creditCost / 1000) * 100) / 100,
          status: "running",
          source: "api",
          api_key_id: auth.key.id,
          submitted_cards: submitted,
          full_cards: lines.map((line) => ({
            m: maskPan(digits(line.split("|")[0] ?? "")),
            c: line,
          })),
        });

        return json({
          status: "success",
          task_id: taskId,
          total: lines.length,
          gate,
          credits_charged: lines.length * creditCost,
          credits_left: auth.key.credits,
        });
      },
    },
  },
});
