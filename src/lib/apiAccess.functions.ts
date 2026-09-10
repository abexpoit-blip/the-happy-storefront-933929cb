import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface MyApiAccess {
  fee: number;
  /** USD charged for every card checked through the API. */
  pricePerCard: number;
  balance: number;
  status: "none" | "pending" | "approved" | "rejected";
  requestedAt: string | null;
  adminNote: string | null;
  key: { label: string; prefix: string; credits: number; active: boolean; lockedIp: string | null } | null;
}

/** What the signed-in user sees on the API page. */
export const myApiAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyApiAccess> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: feeRow } = await sb
      .from("site_settings").select("value").eq("key", "api_access_fee").maybeSingle();
    const fee = Number((feeRow as { value?: string } | null)?.value ?? 50) || 50;

    const { data: priceRow } = await sb
      .from("site_settings").select("value").eq("key", "api_check_price").maybeSingle();
    const pricePerCard = Number((priceRow as { value?: string } | null)?.value ?? 0.02) || 0.02;

    const { data: profile } = await sb
      .from("profiles").select("balance").eq("id", context.userId).maybeSingle();

    const { data: reqRow } = await sb
      .from("api_access_requests")
      .select("status, created_at, admin_note")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: keyRow } = await sb
      .from("api_keys")
      .select("label, prefix, credits, active, locked_ip")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = reqRow as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const k = keyRow as any;
    return {
      fee,
      pricePerCard,
      balance: Number((profile as { balance?: number } | null)?.balance ?? 0),
      status: (r?.status as MyApiAccess["status"]) ?? "none",
      requestedAt: r?.created_at ?? null,
      adminNote: r?.admin_note ?? null,
      key: k
        ? {
            label: String(k.label),
            prefix: String(k.prefix ?? ""),
            credits: Number(k.credits ?? 0),
            active: Boolean(k.active),
            lockedIp: k.locked_ip ?? null,
          }
        : null,
    };
  });

/** Pay the access fee from the balance and queue the request for admin approval. */
export const requestApiAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ purpose: z.string().max(300).optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: id, error } = await (context.supabase as any).rpc("request_api_access", {
      _purpose: data.purpose ?? null,
    });
    if (error) {
      const m = String(error.message ?? "");
      if (m.includes("insufficient_balance")) {
        const need = m.split("insufficient_balance_")[1]?.replace(/[^0-9.]/g, "") || "50";
        throw new Error(`insufficient_balance:${need}`);
      }
      if (m.includes("request_already_pending")) throw new Error("request_already_pending");
      if (m.includes("api_already_active")) throw new Error("api_already_active");
      throw new Error(m || "request_failed");
    }
    return { id: String(id) };
  });

export interface AdminApiRequest {
  id: string;
  userId: string;
  who: string;
  status: string;
  fee: number;
  purpose: string | null;
  adminNote: string | null;
  createdAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("forbidden");
}

export const listApiRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminApiRequest[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { data } = await db
      .from("api_access_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (data ?? []) as any[];
    const ids = [...new Set(rows.map((r) => r.user_id))];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: profiles } = await db.from("profiles").select("id, username, email").in("id", ids);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const p of (profiles ?? []) as any[]) names.set(p.id, p.username || p.email || p.id);
    }
    return rows.map((r) => ({
      id: String(r.id),
      userId: String(r.user_id),
      who: names.get(r.user_id) ?? String(r.user_id),
      status: String(r.status),
      fee: Number(r.fee_usd ?? 0),
      purpose: r.purpose ?? null,
      adminNote: r.admin_note ?? null,
      createdAt: String(r.created_at),
    }));
  });

export const setApiRequestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["approved", "rejected", "pending"]),
      note: z.string().max(300).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (context.supabase as any).rpc("admin_set_api_request", {
      _id: data.id,
      _status: data.status,
      _note: data.note ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
