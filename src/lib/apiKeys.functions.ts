import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ApiKeyListRow {
  id: string;
  label: string;
  ownerNote: string | null;
  prefix: string;
  credits: number;
  dailyLimit: number;
  lockedIp: string | null;
  active: boolean;
  requestCount: number;
  cardsChecked: number;
  lastUsedAt: string | null;
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

export const listApiKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ApiKeyListRow[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabaseAdmin as any)
      .from("api_keys")
      .select("*")
      .order("created_at", { ascending: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data ?? []) as any[]).map((k) => ({
      id: String(k.id),
      label: String(k.label),
      ownerNote: k.owner_note ?? null,
      prefix: String(k.prefix ?? ""),
      credits: Number(k.credits ?? 0),
      dailyLimit: Number(k.daily_limit ?? 0),
      lockedIp: k.locked_ip ?? null,
      active: Boolean(k.active),
      requestCount: Number(k.request_count ?? 0),
      cardsChecked: Number(k.cards_checked ?? 0),
      lastUsedAt: k.last_used_at ?? null,
      createdAt: String(k.created_at),
    }));
  });

/** Create a key — the raw value is returned once and never stored. */
export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      label: z.string().min(2).max(60),
      ownerNote: z.string().max(200).optional(),
      credits: z.number().int().min(0).max(10_000_000).default(0),
      dailyLimit: z.number().int().min(0).max(1_000_000).default(5000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { newApiKey } = await import("@/lib/apiAuth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const key = newApiKey();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin as any).from("api_keys").insert({
      label: data.label,
      owner_note: data.ownerNote ?? null,
      key_hash: key.hash,
      prefix: key.prefix,
      credits: data.credits,
      daily_limit: data.dailyLimit,
    });
    if (error) throw new Error(error.message);
    return { apiKey: key.raw, prefix: key.prefix };
  });

export const updateApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      active: z.boolean().optional(),
      dailyLimit: z.number().int().min(0).max(1_000_000).optional(),
      resetIp: z.boolean().optional(),
      addCredits: z.number().int().min(-10_000_000).max(10_000_000).optional(),
      remove: z.boolean().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;

    if (data.remove) {
      const { error } = await db.from("api_keys").delete().eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    const patch: Record<string, unknown> = {};
    if (data.active !== undefined) patch.active = data.active;
    if (data.dailyLimit !== undefined) patch.daily_limit = data.dailyLimit;
    if (data.resetIp) patch.locked_ip = null;
    if (Object.keys(patch).length) {
      const { error } = await db.from("api_keys").update(patch).eq("id", data.id);
      if (error) throw new Error(error.message);
    }
    if (data.addCredits) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (context.supabase as any).rpc("admin_adjust_api_credits", {
        _key_id: data.id,
        _credits: data.addCredits,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
