import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Upload, Trash2, Eye, EyeOff } from "lucide-react";
import { adminCreateDump, adminListSection, adminSetProductActive, type SectionProduct } from "@/lib/sections";
import { adminDeleteProduct } from "@/lib/store";

const AdminDumps = () => {
  const [rows, setRows] = useState<SectionProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [fileName, setFileName] = useState("");
  const [content, setContent] = useState("");
  const [price, setPrice] = useState("50");
  const [copies, setCopies] = useState("1");
  const [country, setCountry] = useState("");
  const [base, setBase] = useState("");
  const [expiresOn, setExpiresOn] = useState("");

  const load = async () => {
    setLoading(true);
    try { setRows(await adminListSection("dump")); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load"); }
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const onFile = async (f: File | null) => {
    if (!f) return;
    setFileName(f.name);
    if (!title) setTitle(f.name.replace(/\.[a-z]+$/i, ""));
    setContent(await f.text());
  };

  const lines = content.split(/\r?\n/).filter((l) => l.trim()).length;

  const publish = async () => {
    if (!content.trim()) { toast.error("Upload or paste the file content"); return; }
    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) { toast.error("Invalid price"); return; }
    setSaving(true);
    try {
      await adminCreateDump({
        title: title || fileName || "DUMP pack",
        file_name: fileName || `${(title || "dump").replace(/\s+/g, "-").toLowerCase()}.txt`,
        content,
        price: p,
        copies: Number(copies) || 1,
        country,
        base,
        expires_on: expiresOn || undefined,
      });
      toast.success("Dump published");
      setTitle(""); setFileName(""); setContent(""); setCountry(""); setBase(""); setExpiresOn(""); setCopies("1");
      void load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); }
    setSaving(false);
  };

  return (
    <AdminLayout title="DUMP section">
      <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 to-transparent p-5 space-y-4">
        <div>
          <h2 className="font-display text-lg font-bold">Upload a bulk file</h2>
          <p className="text-xs text-muted-foreground">
            Remaining / soon-expiring cards packed in one .txt file. Buyers purchase the whole file and download it from Orders.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            Pack title
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" placeholder="USA MIX 500" />
          </label>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            Price ($)
            <Input value={price} onChange={(e) => setPrice(e.target.value)} className="mt-1" inputMode="decimal" />
          </label>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            Copies (stock)
            <Input value={copies} onChange={(e) => setCopies(e.target.value)} className="mt-1" inputMode="numeric" />
          </label>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            Country
            <Input value={country} onChange={(e) => setCountry(e.target.value)} className="mt-1" placeholder="US" />
          </label>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            Base (upload date name)
            <Input value={base} onChange={(e) => setBase(e.target.value)} className="mt-1" placeholder="BASE 11.09.2026" />
          </label>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            Expiry date
            <Input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className="mt-1" />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Input type="file" accept=".txt,.csv" className="max-w-xs" onChange={(e) => void onFile(e.target.files?.[0] ?? null)} />
          <span className="text-xs text-muted-foreground">{fileName || "no file"} · {lines} card line(s)</span>
        </div>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={8}
          placeholder="4242424242424242|12|2027|123|John Doe|US..."
          className="w-full rounded-xl bg-secondary/40 border border-border/50 p-3 font-mono text-xs text-foreground"
        />

        <Button onClick={publish} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />} Publish dump
        </Button>
      </div>

      <div className="rounded-2xl border border-border/50 overflow-x-auto bg-card/50 mt-6">
        <table className="w-full text-sm min-w-[860px]">
          <thead className="bg-secondary/40 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">File</th>
              <th className="text-left px-4 py-3">Base</th>
              <th className="text-left px-4 py-3">Country</th>
              <th className="text-left px-4 py-3">Cards</th>
              <th className="text-left px-4 py-3">Expires</th>
              <th className="text-left px-4 py-3">Left</th>
              <th className="text-left px-4 py-3">Price</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="px-4 py-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">No dumps yet.</td></tr>}
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-border/40">
                <td className="px-4 py-3 font-semibold">{p.file_name || p.title}</td>
                <td className="px-4 py-3 text-muted-foreground">{p.base || "—"}</td>
                <td className="px-4 py-3">{p.country || "—"}</td>
                <td className="px-4 py-3">{p.file_lines ?? 0}</td>
                <td className="px-4 py-3">{p.expires_on ? new Date(p.expires_on).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-3">{p.stock ?? 0}</td>
                <td className="px-4 py-3 font-bold">${p.price.toFixed(2)}</td>
                <td className="px-4 py-3">{p.active ? "Active" : "Hidden"}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Button size="sm" variant="outline" className="mr-2" onClick={async () => { await adminSetProductActive(p.id, !p.active); void load(); }}>
                    {p.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={async () => {
                    if (!confirm("Delete this dump?")) return;
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

export default AdminDumps;
