import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { writeSiteSetting, adminListChecks, type CardCheck } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Save, Globe, Megaphone, Palette, Coins, Trash2, Plus, ShieldCheck } from "lucide-react";
import { DEFAULT_SETTINGS, refreshSiteSettings, SiteSettings } from "@/hooks/useSiteSettings";

const AdminSiteSettings = () => {
  const [s, setS] = useState<SiteSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checks, setChecks] = useState<CardCheck[]>([]);

  useEffect(() => {
    document.title = "Admin · Site settings";
    (async () => {
      const fresh = await refreshSiteSettings();
      setS(fresh);
      setLoading(false);
      try { setChecks(await adminListChecks(200)); } catch { /* table not migrated yet */ }
    })();
  }, []);

  const set = <K extends keyof SiteSettings>(k: K, v: SiteSettings[K]) =>
    setS((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await Promise.all(
        Object.entries(s).map(([k, v]) =>
          writeSiteSetting(k, typeof v === "string" ? v : JSON.stringify(v)),
        ),
      );
      await refreshSiteSettings();
      toast.success("Site settings saved — changes are live");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally { setSaving(false); }
  };


  const checkStats = {
    total: checks.length,
    live: checks.filter((c) => c.status === "live").length,
    dead: checks.filter((c) => c.status === "dead").length,
    refunded: checks.reduce((sum, c) => sum + c.refunded, 0),
  };

  const updateTicker = (i: number, v: string) =>
    set("ticker_items", s.ticker_items.map((t, idx) => (idx === i ? v : t)));
  const removeTicker = (i: number) =>
    set("ticker_items", s.ticker_items.filter((_, idx) => idx !== i));
  const addTicker = () => set("ticker_items", [...s.ticker_items, "● NEW ANNOUNCEMENT"]);

  if (loading) {
    return (
      <AdminLayout title="Site settings">
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading settings…
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Site settings">
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-muted-foreground">Edit branding, hero copy, ticker, and pricing defaults.</p>
          <button onClick={save} disabled={saving} className="btn-luxe">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>

        <Section icon={Palette} title="Branding">
          <Field label="Shop name"><Input value={s.shop_name} onChange={(e) => set("shop_name", e.target.value)} /></Field>
          <Field label="Shop tagline"><Input value={s.shop_tag} onChange={(e) => set("shop_tag", e.target.value)} /></Field>
        </Section>

        <Section icon={Globe} title="Homepage hero">
          <Field label="Eyebrow"><Input value={s.hero_eyebrow} onChange={(e) => set("hero_eyebrow", e.target.value)} /></Field>
          <Field label="Headline"><Textarea rows={2} value={s.hero_title} onChange={(e) => set("hero_title", e.target.value)} /></Field>
          <Field label="Subtitle"><Textarea rows={3} value={s.hero_sub} onChange={(e) => set("hero_sub", e.target.value)} /></Field>
          <Field label="CTA button text"><Input value={s.hero_cta} onChange={(e) => set("hero_cta", e.target.value)} /></Field>
        </Section>

        <Section icon={Megaphone} title="Scrolling ticker">
          <div className="space-y-2">
            {s.ticker_items.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input value={t} onChange={(e) => updateTicker(i, e.target.value)} className="flex-1" />
                <button type="button" onClick={() => removeTicker(i)} className="h-10 w-10 rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10 flex items-center justify-center">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button type="button" onClick={addTicker} className="inline-flex items-center gap-1.5 text-xs text-primary-glow hover:underline mt-2">
              <Plus className="h-3.5 w-3.5" /> Add ticker item
            </button>
          </div>
        </Section>

        <Section icon={Coins} title="Pricing & commission">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Default seller commission (%)">
              <Input type="number" step="0.1" min="0" max="100" value={s.default_commission_percent} onChange={(e) => set("default_commission_percent", Number(e.target.value))} />
            </Field>
            <Field label="Minimum card price ($)">
              <Input type="number" step="0.01" min="0" value={s.min_card_price} onChange={(e) => set("min_card_price", Number(e.target.value))} />
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
            <Field label="Deposit fee (%)">
              <Input type="number" step="0.1" min="0" max="100" value={s.deposit_fee_percent} onChange={(e) => set("deposit_fee_percent", Number(e.target.value))} />
              <p className="text-[10px] text-muted-foreground mt-1">Percentage deducted from each deposit (e.g. 5 = 5%)</p>
            </Field>
            <Field label="Deposit flat fee ($)">
              <Input type="number" step="0.01" min="0" value={s.deposit_fee_flat} onChange={(e) => set("deposit_fee_flat", Number(e.target.value))} />
              <p className="text-[10px] text-muted-foreground mt-1">Fixed USD amount deducted from each deposit</p>
            </Field>
            <Field label="Minimum deposit ($)">
              <Input type="number" step="0.01" min="0" value={s.min_deposit} onChange={(e) => set("min_deposit", Number(e.target.value))} />
              <p className="text-[10px] text-muted-foreground mt-1">Users cannot deposit less than this amount</p>
            </Field>
          </div>
        </Section>

        <Section icon={ShieldCheck} title="Refund checker">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Live rate (%)">
              <Input type="number" step="1" min="0" max="100" value={s.refund_live_rate} onChange={(e) => set("refund_live_rate", Number(e.target.value))} />
              <p className="text-[10px] text-muted-foreground mt-1">
                Only refundable cards are checked at purchase. Example: 60 = about 6 live out of 10.
                Dead cards are refunded automatically to the buyer's main balance. Non-refundable cards are never checked.
              </p>
            </Field>
            <div className="grid grid-cols-3 gap-3 self-end">
              <Stat label="Checked" value={String(checkStats.total)} />
              <Stat label="Live / Dead" value={`${checkStats.live} / ${checkStats.dead}`} />
              <Stat label="Refunded" value={`$${checkStats.refunded.toFixed(2)}`} />
            </div>
          </div>

          {checks.length > 0 && (
            <div className="mt-4 max-h-[280px] overflow-y-auto rounded-xl border border-border/40">
              <table className="w-full text-xs">
                <thead className="bg-secondary/40 text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left font-normal">BIN</th>
                    <th className="p-2 text-center font-normal">Price</th>
                    <th className="p-2 text-center font-normal">Status</th>
                    <th className="p-2 text-right font-normal">Refunded</th>
                    <th className="p-2 text-right font-normal">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {checks.map((c) => (
                    <tr key={c.id} className="border-t border-border/30">
                      <td className="p-2 font-mono">{c.bin ?? "—"}</td>
                      <td className="p-2 text-center font-mono">${c.price.toFixed(2)}</td>
                      <td className={`p-2 text-center font-medium ${c.status === "live" ? "text-success" : "text-destructive"}`}>{c.status.toUpperCase()}</td>
                      <td className="p-2 text-right font-mono">{c.refunded > 0 ? `$${c.refunded.toFixed(2)}` : "—"}</td>
                      <td className="p-2 text-right text-muted-foreground">{new Date(c.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </AdminLayout>
  );
};

const Section = ({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) => (
  <div className="glass-neon rounded-2xl p-6">
    <div className="flex items-center gap-2.5 mb-5">
      <div className="h-9 w-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center">
        <Icon className="h-4 w-4 text-primary-glow" />
      </div>
      <h2 className="font-display text-lg font-bold tracking-tight">{title}</h2>
    </div>
    <div className="space-y-4">{children}</div>
  </div>
);

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl border border-border/40 bg-secondary/20 p-3 text-center">
    <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
    <div className="font-display text-sm mt-1">{value}</div>
  </div>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <Label className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{label}</Label>
    <div className="mt-1.5">{children}</div>
  </div>
);

export default AdminSiteSettings;
