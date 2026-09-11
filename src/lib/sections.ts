import { supabase } from "@/integrations/supabase/client";
import { slugify, type Product } from "@/lib/store";

export type Section = "card" | "bin" | "dump";

/** Extra columns added by selfhost/bin-dump.sql. Optional so older DBs keep working. */
export interface SectionFields {
  section?: Section | null;
  card_type?: string | null;
  card_level?: string | null;
  bin_category?: string | null;
  file_name?: string | null;
  file_lines?: number | null;
  expires_on?: string | null;
}

export type SectionProduct = Product & SectionFields;

export const sectionOf = (p: Product | SectionProduct): Section => {
  const s = (p as SectionProduct).section;
  return s === "bin" || s === "dump" ? s : "card";
};

const num = (v: unknown) => Number(v ?? 0);

const mapRows = (rows: unknown[]): SectionProduct[] =>
  (rows as SectionProduct[]).map((p) => ({
    ...p,
    price: num(p.price),
    compare_at_price: p.compare_at_price == null ? null : num(p.compare_at_price),
  }));

/** Public list for a section. Sold-out key products are hidden. */
export const listSection = async (section: Section, limit = 2000): Promise<SectionProduct[]> => {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return mapRows(data ?? [])
    .filter((p) => sectionOf(p) === section)
    .filter((p) => p.delivery_type !== "key" || (p.stock ?? 0) > 0);
};

/** Admin list (includes hidden / sold out). */
export const adminListSection = async (section: Section, limit = 2000): Promise<SectionProduct[]> => {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return mapRows(data ?? []).filter((p) => sectionOf(p) === section);
};

/* ---------------- BIN upload ---------------- */

export interface BinRow {
  bin: string;
  country: string;
  card_type: string;
  card_level: string;
  brand: string;
  category: string;
  price: number;
}

/** Format per line: BIN | COUNTRY | TYPE | LEVEL | BRAND | CATEGORY | PRICE  (comma also accepted) */
export const parseBinLines = (text: string): { rows: BinRow[]; errors: string[] } => {
  const rows: BinRow[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const raw = line.trim();
    if (!raw) return;
    if (/^bin\s*[|,]/i.test(raw)) return; // header
    const parts = raw.split(/[|,]/).map((p) => p.trim());
    if (parts.length < 7) { errors.push(`Line ${i + 1}: 7 fields required`); return; }
    const [bin, country, type, level, brand, category, price] = parts;
    if (!/^\d{6,8}$/.test(bin)) { errors.push(`Line ${i + 1}: invalid BIN "${bin}"`); return; }
    const p = Number(price);
    if (!Number.isFinite(p) || p < 0) { errors.push(`Line ${i + 1}: invalid price "${price}"`); return; }
    rows.push({
      bin,
      country: (country || "").toUpperCase(),
      card_type: (type || "").toUpperCase(),
      card_level: level || "",
      brand: brand || "",
      category: category || "",
      price: p,
    });
  });
  return { rows, errors };
};

const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

export const adminCreateBins = async (rows: BinRow[]): Promise<number> => {
  if (!rows.length) return 0;
  const payload = rows.map((r) => ({
    category_id: null,
    section: "bin",
    title: `${r.brand || "BIN"} ${r.bin}`,
    slug: `bin-${r.bin}-${Math.random().toString(36).slice(2, 8)}`,
    price: r.price,
    delivery_type: "instant",
    instant_content: `BIN: ${r.bin}\nCOUNTRY: ${r.country}\nTYPE: ${r.card_type}\nLEVEL: ${r.card_level}\nBRAND: ${r.brand}\nCATEGORY: ${r.category}`,
    active: true,
    refundable: false,
    bin: r.bin,
    brand: r.brand || null,
    country: r.country || null,
    card_type: r.card_type || null,
    card_level: r.card_level || null,
    bin_category: r.category || null,
  }));
  for (const part of chunk(payload, 200)) {
    const { error } = await supabase.from("products").insert(part as never);
    if (error) throw error;
  }
  return payload.length;
};

/* ---------------- DUMP (bulk file) upload ---------------- */

export interface DumpInput {
  title: string;
  file_name: string;
  content: string;
  price: number;
  copies: number;          // how many buyers can buy this same file
  country?: string;
  base?: string;
  expires_on?: string;     // yyyy-mm-dd
  description?: string;
}

/** Creates one DUMP product whose deliverable is the uploaded file content. */
export const adminCreateDump = async (input: DumpInput): Promise<string> => {
  const lines = input.content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) throw new Error("File is empty");
  const copies = Math.max(1, Math.min(500, Math.floor(input.copies || 1)));

  const { data, error } = await supabase
    .from("products")
    .insert({
      category_id: null,
      section: "dump",
      title: input.title || input.file_name,
      slug: slugify(`dump-${input.file_name}-${Date.now()}`),
      price: input.price,
      delivery_type: "key",
      description: input.description ?? null,
      active: true,
      refundable: false,
      country: input.country || null,
      base: input.base || null,
      file_name: input.file_name,
      file_lines: lines.length,
      expires_on: input.expires_on || null,
    } as never)
    .select("id")
    .single();
  if (error) throw error;
  const id = (data as { id: string }).id;

  const body = lines.join("\n");
  const keys = Array.from({ length: copies }, () => ({ product_id: id, content: body }));
  const { error: kErr } = await supabase.from("product_keys").insert(keys);
  if (kErr) throw kErr;
  await supabase.from("products").update({ stock: copies }).eq("id", id);
  return id;
};

export const adminSetProductActive = async (id: string, active: boolean) => {
  const { error } = await supabase.from("products").update({ active }).eq("id", id);
  if (error) throw error;
};
