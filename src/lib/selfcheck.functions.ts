import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const digits = (s: string) => s.replace(/\D/g, "");

export type SelfCheckStatus = "live" | "dead" | "error" | "skipped";

export interface SelfCheckRow {
  card: string;
  status: SelfCheckStatus;
  category: string;
  msg: string;
}

/** Parse a user-pasted line into `PAN|MM|YYYY|CVV`. */
function parseLine(raw: string): string | null {
  const p = raw.trim().split(/[|:/\s,]+/).filter(Boolean);
  if (p.length < 4) return null;
  const pan = digits(p[0] ?? "");
  let mm = digits(p[1] ?? "");
  let yy = digits(p[2] ?? "");
  const cvv = digits(p[3] ?? "");
  if (pan.length < 12 || !mm || !yy || !cvv) return null;
  if (mm.length === 1) mm = `0${mm}`;
  if (yy.length === 2) yy = `20${yy}`;
  return `${pan}|${mm}|${yy}|${cvv}`;
}

const mask = (pan: string) =>
  pan.length > 10 ? `${pan.slice(0, 6)}${"*".repeat(pan.length - 10)}${pan.slice(-4)}` : pan;

/** Price + gate shown in the checker UI. */
export const selfCheckConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("site_settings")
      .select("key, value")
      .in("key", ["self_check_price", "self_check_gate"]);
    const map = Object.fromEntries(((data ?? []) as { key: string; value: string }[]).map((r) => [r.key, r.value]));
    return {
      price: Number(map["self_check_price"] ?? 0.2) || 0.2,
      gate: String(map["self_check_gate"] || "CCV_Braintree_Auth"),
    };
  });

/** Gates the user can pick in the checker UI. */
export const checkerGates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { listGates, GATE_CATALOG } = await import("@/lib/checkerccv.server");
    const shape = (g: { id?: string; description?: string; creditGate?: number }) => ({
      id: String(g.id),
      description: String(g.description ?? g.id),
      credit: Number(g.creditGate ?? 0),
    });
    try {
      const gates = await listGates(true);
      if (gates.length > 0) return gates.map(shape);
    } catch {
      // gateway unreachable / key missing — নিচের catalog দেখাই
    }
    return GATE_CATALOG.map(shape);
  });

/** Remaining credit on the checking gateway account. */
export const checkerCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    try {
      const { checkCredit } = await import("@/lib/checkerccv.server");
      return { credit: await checkCredit(), ok: true as const };
    } catch (e) {
      return { credit: 0, ok: false as const, error: e instanceof Error ? e.message : "checker_error" };
    }
  });

/** Charge the user and start a gateway task for their own cards. */
export const startSelfCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ cards: z.array(z.string()).min(1).max(500), gate: z.string().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const lines = [...new Set(data.cards.map(parseLine).filter(Boolean) as string[])];
    if (!lines.length) throw new Error("no_valid_cards");

    const { data: gateRow } = await context.supabase
      .from("site_settings").select("value").eq("key", "self_check_gate").maybeSingle();
    const gate = data.gate?.trim() || String((gateRow as { value?: string } | null)?.value || "CCV_Braintree_Auth");

    const { createTask } = await import("@/lib/checkerccv.server");
    const taskId = await createTask(gate, lines);

    const { data: cost, error } = await context.supabase.rpc("charge_self_check", { _cards: lines.length });
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any).from("self_checks").insert({
      user_id: context.userId,
      task_id: taskId,
      gate,
      total: lines.length,
      cost: Number(cost ?? 0),
      status: "running",
    });

    return { taskId, total: lines.length, cost: Number(cost ?? 0), gate };
  });

/** Poll a self-check task and return masked results. */
export const pollSelfCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ taskId: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { data: task } = await db
      .from("self_checks").select("*").eq("task_id", data.taskId).eq("user_id", context.userId).maybeSingle();
    if (!task) throw new Error("task_not_found");

    const { getResults, verdict } = await import("@/lib/checkerccv.server");
    const page = await getResults(data.taskId, 0, 500);

    const rows: SelfCheckRow[] = page.results.map((r) => {
      const pan = digits(String(r.card ?? "").split("|")[0] ?? "");
      const v = verdict(r.category);
      const cat = String(r.category ?? "").toLowerCase();
      return {
        card: mask(pan),
        status: v ?? (cat.includes("skip") ? "skipped" : "error"),
        category: String(r.category ?? ""),
        msg: String(r.result?.msg ?? ""),
      };
    });

    const done = page.status === "completed" || page.status === "cancelled";
    await db.from("self_checks")
      .update({ results: rows, status: done ? "completed" : "running" })
      .eq("id", task.id);

    return { done, status: page.status, total: Number(task.total ?? 0), rows };
  });
