import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const digits = (s: string) => s.replace(/\D/g, "");

/** Turn a stored card line (pipe format) into `PAN|MM|YYYY|CVV`. */
function toCardLine(content: string): { line: string; pan: string } | null {
  const first = content.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  if (!first) return null;
  const p = first.split("|").map((x) => x.trim());
  let pan = "", mm = "", yy = "", cvv = "";
  if (p.length >= 6 && digits(p[2] ?? "").length >= 12) {
    [pan, mm, yy, cvv] = [digits(p[2] ?? ""), digits(p[3] ?? ""), digits(p[4] ?? ""), digits(p[5] ?? "")];
  } else if (p.length >= 4 && digits(p[0] ?? "").length >= 12) {
    [pan, mm, yy, cvv] = [digits(p[0] ?? ""), digits(p[1] ?? ""), digits(p[2] ?? ""), digits(p[3] ?? "")];
  } else return null;
  if (!pan || !mm || !yy || !cvv) return null;
  if (mm.length === 1) mm = `0${mm}`;
  if (yy.length === 2) yy = `20${yy}`;
  return { line: `${pan}|${mm}|${yy}|${cvv}`, pan };
}

/**
 * Charge the per-card fee and start a gateway check for ONE bought refund card.
 * Returns the task id the client polls with `pollOrderCardCheck`.
 */
export const startOrderCardCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ checkId: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;

    const { data: check } = await db
      .from("card_checks")
      .select("id, product_id, order_id, status, created_at")
      .eq("id", data.checkId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!check) throw new Error("check_not_found");
    if (check.status !== "pending") throw new Error("already_checked");

    // Refund checking is only allowed inside the 2 minute window after purchase.
    const boughtAt = new Date(String(check.created_at ?? "")).getTime();
    if (!Number.isFinite(boughtAt) || Date.now() - boughtAt > CHECK_WINDOW_MS) {
      throw new Error("check_window_expired");
    }

    // resume an already-running task for this card instead of paying twice
    const { data: running } = await db
      .from("checker_tasks")
      .select("task_id, mapping")
      .eq("user_id", context.userId)
      .eq("status", "running")
      .order("created_at", { ascending: false })
      .limit(20);
    for (const row of (running ?? []) as { task_id: string; mapping: Record<string, string> }[]) {
      if (Object.values(row.mapping ?? {}).includes(data.checkId)) {
        return { taskId: row.task_id, resumed: true };
      }
    }

    const { data: key } = await db
      .from("product_keys")
      .select("content")
      .eq("product_id", check.product_id)
      .eq("sold_to", context.userId)
      .limit(1)
      .maybeSingle();
    const parsed = toCardLine(String((key as { content?: string } | null)?.content ?? ""));
    if (!parsed) throw new Error("no_card_data");

    // pay the fee (bonus balance first) — throws insufficient_balance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: chargeError } = await (context.supabase as any).rpc("charge_order_check", {
      _check_id: data.checkId,
    });
    if (chargeError) throw new Error(chargeError.message);

    const { data: gateRow } = await db
      .from("site_settings").select("value").eq("key", "checker_gate").maybeSingle();
    const gate = String((gateRow as { value?: string } | null)?.value || "CCV_Braintree_Auth");

    let taskId: string;
    try {
      const { createTask } = await import("@/lib/checkerccv.server");
      taskId = await createTask(gate, [parsed.line]);
    } catch (e) {
      await db.rpc("refund_order_check", { _check_id: data.checkId });
      throw e;
    }

    await db.from("checker_tasks").insert({
      user_id: context.userId,
      task_id: taskId,
      gate,
      total: 1,
      mapping: { [parsed.pan]: data.checkId },
      status: "running",
    });

    return { taskId, resumed: false };
  });

/** Poll one card check. DEAD refunds the card price instantly (settle_card_check). */
export const pollOrderCardCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ taskId: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getResults, verdict } = await import("@/lib/checkerccv.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;

    const { data: task } = await db
      .from("checker_tasks")
      .select("*")
      .eq("task_id", data.taskId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!task) throw new Error("task_not_found");

    const mapping = (task.mapping ?? {}) as Record<string, string>;
    const res = await getResults(data.taskId, 0, 50);

    for (const row of res.results) {
      const pan = String(row.card ?? "").split("|")[0]?.replace(/\D/g, "") ?? "";
      const checkId = mapping[pan];
      const v = verdict(row.category);
      if (!checkId || !v) continue;
      await db.rpc("settle_card_check", { _check_id: checkId, _status: v });
    }

    const ids = Object.values(mapping);
    const { data: rows } = await db.from("card_checks").select("id, status, refunded").in("id", ids);
    const list = ((rows ?? []) as { id: string; status: string; refunded: number }[]);
    const settled = list.filter((r) => r.status !== "pending");
    const gatewayDone = res.status === "completed" || res.status === "cancelled";
    const done = settled.length === ids.length || gatewayDone;

    if (done) {
      await db.from("checker_tasks").update({ settled: settled.length, status: "completed" }).eq("id", task.id);
      // gateway finished but never answered → give the fee back
      for (const r of list) {
        if (r.status === "pending") await db.rpc("refund_order_check", { _check_id: r.id });
      }
    }

    const first = list[0];
    return {
      done,
      status: first?.status ?? "pending",
      refunded: Number(first?.refunded ?? 0),
      answered: settled.length > 0,
    };
  });
