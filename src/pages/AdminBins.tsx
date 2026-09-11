import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Upload, Trash2, Eye, EyeOff } from "lucide-react";
import { adminCreateBins, adminListSection, adminSetProductActive, parseBinLines, type SectionProduct } from "@/lib/sections";
import { adminDeleteProduct } from "@/lib/store";

const SAMPLE = "424242 | US | CREDIT | Platinum | Visa | SHOPIFY 500/1000$ order | 80";

const AdminBins = () => {
  const [rows, setRows] = useState<SectionProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setRows(await adminListSection("bin")); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load"); }
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const upload = async () => {
    const { rows: parsed, errors } = parseBinLines(text);
    if (errors.length) toast.error(errors.slice(0, 3).join(" · "));
    if (!parsed.length) return;
    setSaving(true);
    try {
      const n = await adminCreateBins(parsed);
      toast.success(`${n} BIN(s) published`);
      setText("");
      void load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); }
    setSaving(false);
  };

  const onFile = async (f: File | null) => {
    if (!f) return;
    setText(await f.text());
  };

  return (
    <AdminLayout title="BIN section">
      <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 to-transparent p-5 space-y-3">
        <h2 className="font-display text-lg font-bold">Upload BINs</h2>
        <p className="text-xs text-muted-foreground">
          One BIN per line: <code>BIN | COUNTRY | TYPE | LEVEL | BRAND | CATEGORY | PRICE</code><br />
          Example: <code>{SAMPLE}</code>
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={SAMPLE}
          className="w-full rounded-xl bg-secondary/40 border border-border/50 p-3 font-mono text-xs text-foreground"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Input type="file" accept=".txt,.csv" className="max-w-xs" onChange={(e) => void onFile(e.target.files?.[0] ?? null)} />
          <Button onClick={upload} disabled={saving || !text.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />} Publish
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-border/50 overflow-x-auto bg-card/50 mt-6">
        <table className="w-full text-sm min-w-[860px]">
          <thead className="bg-secondary/40 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">BIN</th>
              <th className="text-left px-4 py-3">Country</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Level</th>
              <th className="text-left px-4 py-3">Brand</th>
              <th className="text-left px-4 py-3">Category</th>
              <th className="text-left px-4 py-3">Price</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="px-4 py-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">No BINs yet.</td></tr>}
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-border/40">
                <td className="px-4 py-3 font-mono">{p.bin}</td>
                <td className="px-4 py-3">{p.country || "—"}</td>
                <td className="px-4 py-3">{p.card_type || "—"}</td>
                <td className="px-4 py-3">{p.card_level || "—"}</td>
                <td className="px-4 py-3">{p.brand || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{p.bin_category || "—"}</td>
                <td className="px-4 py-3 font-bold">${p.price.toFixed(2)}</td>
                <td className="px-4 py-3">{p.active ? "Active" : "Hidden"}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Button size="sm" variant="outline" className="mr-2" onClick={async () => { await adminSetProductActive(p.id, !p.active); void load(); }}>
                    {p.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={async () => {
                    if (!confirm("Delete this BIN?")) return;
                    await adminDeleteProduct(p.id); void load();
                  }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
};

export default AdminBins;
