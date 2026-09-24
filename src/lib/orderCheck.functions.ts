import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const digits = (s: string) => s.replace(/\D/g, "");

/** Buyers can only run the refund check for 1 minute (60 seconds) after the purchase. */
export const CHECK_WINDOW_MS = 1 * 60 * 1000;

/** Parse ONE line: find the PAN anywhere, then MM, YY(YY), CVV after it (MM/YY combos allowed). */
function parseOne(raw: string): { line: string; pan: string } | null {
  const p = raw.trim().split(/[|;,\s]+/).map((x) => x.trim()).filter(Boolean);
  for (let i = 0; i < p.length; i++) {
    const pan = digits(p[i] ?? "");
    if (pan.length < 12 || pan.length > 19 || pan !== (p[i] ?? "").replace(/[\s-]/g, "")) continue;
    const rest = p.slice(i + 1);
    let mm = "", yy = "", cvv = "";
    const combo = (rest[0] ?? "").match(/^(\d{1,2})[/\-](\d{2}|\d{4})$/);
    if (combo) {
      [mm, yy, cvv] = [combo[1]!, combo[2]!, digits(rest[1] ?? "")];
    } else {
      [mm, yy, cvv] = [digits(rest[0] ?? ""), digits(rest[1] ?? ""), digits(rest[2] ?? "")];
    }
    if (mm.length === 1) mm = `0${mm}`;
    if (yy.length === 2) yy = `20${yy}`;
    const m = Number(mm);
    if (!(m >= 1 && m <= 12) || yy.length !== 4 || cvv.length < 3 || cvv.length > 4) continue;
    return { line: `${pan}|${mm}|${yy}|${cvv}`, pan };
  }
  return null;
}

/** Search every line of the given texts; prefer a PAN ending with `last`. */
function toCardLine(texts: string[], last?: string | null): { line: string; pan: string } | null {
  const found: { line: string; pan: string }[] = [];
  for (const t of texts) {
    for (const l of String(t ?? "").split(/\r?\n/)) {
      const r = parseOne(l);
      if (r) found.push(r);
    }
  }
  const tail = digits(String(last ?? ""));
  if (tail) {
    const hit = found.find((f) => f.pan.endsWith(tail));
    if (hit) return hit;
  }
  return found[0] ?? null;
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
      .select("id, product_id, order_id, status, created_at, last_digits")
      .eq("id", data.checkId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!check) throw new Error("check_not_found");
    if (check.status !== "pending") throw new Error("already_checked");

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

...
    const texts: string[] = [];
    if (check.product_id) {
      const { data: keys } = await db
        .from("product_keys")
        .select("content")
        .eq("product_id", check.product_id)
        .eq("sold_to", context.userId)
        .limit(50);
      for (const k of (keys ?? []) as { content?: string }[]) texts.push(String(k.content ?? ""));
    }
    if (check.order_id) {
      let q = db.from("order_items").select("delivered_content").eq("order_id", check.order_id);
      if (check.product_id) q = q.eq("product_id", check.product_id);
      const { data: items } = await q.limit(50);
      for (const it of (items ?? []) as { delivered_content?: string }[]) texts.push(String(it.delivered_content ?? ""));
    }
    const parsed = toCardLine(texts, check.last_digits);
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
      const v = verdict(row.category, row.result?.msg ?? "");
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
