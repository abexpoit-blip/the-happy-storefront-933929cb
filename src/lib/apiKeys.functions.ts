import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ApiKeyListRow {
  id: string;
  label: string;
  userId: string | null;
  owner: string | null;
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

/** Users an admin can bind a key to. */
export const listKeyOwners = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ id: string; name: string }[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabaseAdmin as any)
      .from("profiles")
      .select("id, username, email")
      .order("username", { ascending: true })
      .limit(2000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data ?? []) as any[]).map((p) => ({
      id: String(p.id),
      name: String(p.username || p.email || p.id),
    }));
  });

export const listApiKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ApiKeyListRow[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { data } = await db.from("api_keys").select("*").order("created_at", { ascending: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (data ?? []) as any[];
    const ids = [...new Set(rows.map((k) => k.user_id).filter(Boolean))];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: profiles } = await db.from("profiles").select("id, username, email").in("id", ids);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const p of (profiles ?? []) as any[]) names.set(p.id, p.username || p.email || p.id);
    }
    return rows.map((k) => ({
      id: String(k.id),
      label: String(k.label),
      userId: k.user_id ?? null,
      owner: k.user_id ? names.get(k.user_id) ?? null : null,
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
      userId: z.string().uuid().optional(),
      requestId: z.string().uuid().optional(),
      ownerNote: z.string().max(200).optional(),
      credits: z.number().int().min(0).max(10_000_000).default(0),
      dailyLimit: z.number().int().min(0).max(1_000_000).default(5000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { newApiKey } = await import("@/lib/apiAuth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const key = newApiKey();
    const { data: created, error } = await db
      .from("api_keys")
      .insert({
        label: data.label,
        user_id: data.userId ?? null,
        owner_note: data.ownerNote ?? null,
        key_hash: key.hash,
        prefix: key.prefix,
        credits: data.credits,
        daily_limit: data.dailyLimit,
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);

    if (data.requestId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (context.supabase as any).rpc("admin_set_api_request", {
        _id: data.requestId,
        _status: "approved",
        _note: null,
      });
      await db.from("api_access_requests").update({ api_key_id: created?.id ?? null }).eq("id", data.requestId);
    }
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
