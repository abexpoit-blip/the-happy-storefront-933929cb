import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface PendingCheck {
  id: string;
  product_id: string | null;
  order_id: string | null;
}

const digits = (s: string) => s.replace(/\D/g, "");

/** Turn a stored card line (pipe format) into `PAN|MM|YYYY|CVV`. */
function toCardLine(content: string): { line: string; pan: string } | null {
  const first = content.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  if (!first) return null;
  const p = first.split("|").map((x) => x.trim());
  // base|price|cc|month|year|cvv|...
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

/** Start a real gateway check for the buyer's pending refund cards. */
export const startCheckerTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orderIds: z.array(z.string()).optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createTask } = await import("@/lib/checkerccv.server");
    const db = supabaseAdmin as unknown as {
      from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
      rpc: (f: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    };

    const { data: activeTask } = await db
      .from("checker_tasks")
      .select("task_id, total, gate")
      .eq("user_id", context.userId)
      .eq("status", "running")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeTask) {
      const existing = activeTask as { task_id: string; total: number; gate: string };
      return { taskId: existing.task_id, total: Number(existing.total), gate: existing.gate, resumed: true };
    }

    let q = db.from("card_checks").select("id, product_id, order_id").eq("user_id", context.userId).eq("status", "pending");
    if (data.orderIds?.length) q = q.in("order_id", data.orderIds);
    const { data: pendingRaw } = await q;
    const pending = (pendingRaw ?? []) as PendingCheck[];
    if (!pending.length) throw new Error("no_pending_checks");

    const { data: gateRow } = await db.from("site_settings").select("value").eq("key", "checker_gate").maybeSingle();
    const gate = String((gateRow as { value?: string } | null)?.value || "CCV_Braintree_Auth");

    const lines: string[] = [];
    const mapping: Record<string, string> = {}; // pan -> check id
    for (const chk of pending) {
      if (!chk.product_id) continue;
      const { data: key } = await db
        .from("product_keys")
        .select("content")
        .eq("product_id", chk.product_id)
        .eq("sold_to", context.userId)
        .limit(1)
        .maybeSingle();
      const content = (key as { content?: string } | null)?.content;
      if (!content) continue;
      const parsed = toCardLine(content);
      if (!parsed || mapping[parsed.pan]) continue;
      mapping[parsed.pan] = chk.id;
      lines.push(parsed.line);
    }
    if (!lines.length) throw new Error("no_card_data");

    const taskId = await createTask(gate, lines);

    await db.from("checker_tasks").insert({
      user_id: context.userId,
      task_id: taskId,
      gate,
      total: lines.length,
      mapping,
      status: "running",
    });

    return { taskId, total: lines.length, gate, resumed: false };
  });

/** Restore the buyer's running cart checker task after navigation or a real reload. */
export const activeCheckerTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabaseAdmin as any)
      .from("checker_tasks")
      .select("task_id, total, settled, status, created_at")
      .eq("user_id", context.userId)
      .eq("status", "running")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    return {
      taskId: String(data.task_id),
      total: Number(data.total ?? 0),
      settled: Number(data.settled ?? 0),
    };
  });

/** Poll a running task, settle finished cards (DEAD is refunded instantly). */
export const pollCheckerTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ taskId: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getResults, verdict } = await import("@/lib/checkerccv.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;

    const { data: taskRow } = await db
      .from("checker_tasks")
      .select("*")
      .eq("task_id", data.taskId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!taskRow) throw new Error("task_not_found");

    const mapping = (taskRow.mapping ?? {}) as Record<string, string>;

    // Results arrive page by page — walk the cursor so nothing is missed.
    let cursor = 0;
    const processedPans = new Set<string>();
    let status = String(taskRow.status ?? "running");
    for (let page = 0; page < 6; page++) {
      const res = await getResults(data.taskId, cursor, 500);
      status = res.status;
      for (const row of res.results) {
        const pan = String(row.card ?? "").split("|")[0]?.replace(/\D/g, "") ?? "";
        const checkId = mapping[pan];
        const v = verdict(row.category, row.result?.msg ?? "");
        if (pan) processedPans.add(pan);
        if (!checkId || !v) continue;
        await db.rpc("settle_card_check", { _check_id: checkId, _status: v });
      }
      const next = res.nextCursor > cursor ? res.nextCursor : cursor + res.results.length;
      if (res.results.length === 0 || next <= cursor) break;
      cursor = next;
    }

    const done = status === "completed" || status === "cancelled";
    const ids = Object.values(mapping);
    let settled = 0;
    if (ids.length) {
      const { data: settledRaw } = await db.from("card_checks").select("id").in("id", ids).in("status", ["live", "dead"]);
      settled = ((settledRaw ?? []) as { id: string }[]).length;
    }

    // Cards the gateway never answered are not billed — give those credits back once.
    let refundedCredits = Number(taskRow.refunded_credits ?? 0);
    if (done) {
      if (ids.length) {
        const { data: leftRaw } = await db
          .from("card_checks")
          .select("id")
          .in("id", ids)
          .eq("user_id", context.userId)
          .eq("status", "pending")
          .eq("credits_refunded", false);
        const left = ((leftRaw ?? []) as { id: string }[]).map((r) => r.id);
        if (left.length) {
          const { data: costRow } = await db
            .from("site_settings").select("value").eq("key", "check_credit_cost").maybeSingle();
          const creditCost = Number((costRow as { value?: string } | null)?.value ?? 30) || 30;
          const give = left.length * creditCost;
          if (give > 0) {
            await db.rpc("refund_check_credits", { _user_id: context.userId, _credits: give });
            await db.from("card_checks").update({ credits_refunded: true }).in("id", left);
            refundedCredits += give;
          }
        }
      }
    }

    await db
      .from("checker_tasks")
      .update({ settled, status: done ? "completed" : "running", refunded_credits: refundedCredits })
      .eq("id", taskRow.id);

    return {
      done,
      status,
      total: Number(taskRow.total ?? 0),
      processed: processedPans.size,
      settled,
      refundedCredits,
    };

  });

/** Admin: gateway credit + available gates. */
export const checkerStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("forbidden");
    const { checkCredit, listGates } = await import("@/lib/checkerccv.server");
    const [credit, gates] = await Promise.all([checkCredit(), listGates(true)]);
    return { credit, gates };
  });
