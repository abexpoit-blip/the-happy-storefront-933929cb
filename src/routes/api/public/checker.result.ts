import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authorizeApiKey, json } from "@/lib/apiAuth.server";
import { digits, maskPan } from "@/lib/cardLine";

const bodySchema = z.object({ task_id: z.string().min(1).max(120) });

interface Row { card: string; status: string; category: string; msg: string; pending?: boolean }

export const Route = createFileRoute("/api/public/checker/result")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: z.infer<typeof bodySchema>;
        try {
          body = bodySchema.parse(await request.json());
        } catch {
          return json({ status: "error", message: "invalid_body" }, 400);
        }

        const auth = await authorizeApiKey(request, 0);
        if ("error" in auth) return json({ status: "error", message: auth.error }, auth.status);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabaseAdmin as any;

        const { data: task } = await db
          .from("self_checks").select("*")
          .eq("task_id", body.task_id).eq("api_key_id", auth.key.id).maybeSingle();
        if (!task) return json({ status: "error", message: "task_not_found" }, 404);

        const { getResults, verdict } = await import("@/lib/checkerccv.server");
        const stored: Row[] = Array.isArray(task.results) ? task.results : [];
        const rows: Row[] = [...stored];
        let cursor = rows.length;
        let gwStatus = String(task.status ?? "running");

        for (let page = 0; page < 4; page++) {
          const res = await getResults(body.task_id, cursor, 500);
          gwStatus = res.status;
          const mapped: Row[] = res.results.map((r) => {
            const pan = digits(String(r.card ?? "").split("|")[0] ?? "");
            const msg = String(r.result?.msg ?? "");
            const v = verdict(r.category, msg);
            const cat = String(r.category ?? "").toLowerCase();
            return {
              card: maskPan(pan),
              status: v ?? (cat.includes("skip") ? "skipped" : "error"),
              category: String(r.category ?? ""),
              msg,
            };
          });
          for (const row of mapped) {
            const i = rows.findIndex((c) => c.card === row.card);
            if (i >= 0) rows[i] = row; else rows.push(row);
          }
          const next = res.nextCursor > cursor ? res.nextCursor : cursor + mapped.length;
          if (mapped.length === 0 || next <= cursor) break;
          cursor = next;
        }

        const done = gwStatus === "completed" || gwStatus === "cancelled";
        const total = Number(task.total ?? 0);
        const answered = rows.filter((r) => r.status === "live" || r.status === "dead").length;

        // Only answered cards stay charged — unanswered ones are paid back
        // exactly the way they were taken (credits first, then balance).
        let refundedCredits = Number(task.refunded_credits ?? 0);
        let refundedUsd = Number(task.refunded_usd ?? 0);
        if (done && total > 0) {
          const { data: refund, error: refundError } = await db.rpc("settle_api_check_refund", {
            _check_id: task.id,
            _key_id: auth.key.id,
            _answered: answered,
          });
          if (refundError) return json({ status: "error", message: "refund_settlement_failed" }, 500);
          const settled = Array.isArray(refund) ? refund[0] : refund;
          refundedCredits = Number(settled?.refunded_credits ?? refundedCredits);
          refundedUsd = Number(settled?.refunded_usd ?? refundedUsd);
        }

        await db.from("self_checks")
          .update({
            results: rows,
            status: done ? "completed" : "running",
          })
          .eq("id", task.id);

        const submitted: Row[] = Array.isArray(task.submitted_cards) ? task.submitted_cards : [];
        const out = submitted.length
          ? submitted.map((p) => rows.find((r) => r.card === p.card) ?? p)
          : rows;

        return json({
          status: "success",
          done,
          task_status: gwStatus,
          total,
          answered,
          credits_refunded: refundedCredits,
          balance_refunded: refundedUsd,
          results: out,
        });
      },
    },
  },
});
