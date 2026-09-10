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

    return { taskId, total: lines.length, gate };
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
    const page = await getResults(data.taskId, 0, 500);

    let settled = 0;
    for (const row of page.results) {
      const pan = String(row.card ?? "").split("|")[0]?.replace(/\D/g, "") ?? "";
      const checkId = mapping[pan];
      const v = verdict(row.category);
      if (!checkId || !v) continue;
      await db.rpc("settle_card_check", { _check_id: checkId, _status: v });
      settled++;
    }

    const done = page.status === "completed" || page.status === "cancelled";
    await db
      .from("checker_tasks")
      .update({ settled, status: done ? "completed" : "running" })
      .eq("id", taskRow.id);

    return {
      done,
      status: page.status,
      total: page.total || Number(taskRow.total ?? 0),
      processed: page.results.length,
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
