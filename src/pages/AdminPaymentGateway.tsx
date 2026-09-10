import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { writeSiteSetting } from "@/lib/store";
import { plisioKeyStatus } from "@/lib/plisio.functions";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Loader2, Save, CreditCard, Eye, EyeOff, Percent, DollarSign,
  ShieldCheck, Wallet, AlertTriangle,
} from "lucide-react";
import { DEFAULT_SETTINGS, refreshSiteSettings, SiteSettings } from "@/hooks/useSiteSettings";

const AdminPaymentGateway = () => {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SETTINGS);
  const [plisioKey, setPlisioKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [keyExists, setKeyExists] = useState(false);
  const [keyValid, setKeyValid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingKey, setSavingKey] = useState(false);

  useEffect(() => {
    document.title = "Admin · Payment Gateway";
    (async () => {
      try {
        const [fresh] = await Promise.all([
          refreshSiteSettings(),
          checkPlisioKey(),
        ]);
        setSettings(fresh);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  const checkPlisioKey = async () => {
    try {
      const res = await plisioKeyStatus();
      setKeyExists(res.configured);
      setKeyValid(res.valid);
    } catch { /* ignore */ }
  };

  const set = <K extends keyof SiteSettings>(k: K, v: SiteSettings[K]) =>
    setSettings((prev) => ({ ...prev, [k]: v }));

  const saveSettings = async () => {
    setSaving(true);
    try {
      await Promise.all([
        writeSiteSetting("deposit_fee_percent", String(settings.deposit_fee_percent)),
        writeSiteSetting("deposit_fee_flat", String(settings.deposit_fee_flat)),
        writeSiteSetting("default_commission_percent", String(settings.default_commission_percent)),
        writeSiteSetting("min_card_price", String(settings.min_card_price)),
      ]);
      await refreshSiteSettings();
      toast.success("Payment settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally { setSaving(false); }
  };

  const savePlisioKey = async () => {
    toast.info("The Plisio API key is stored as a server secret and can only be changed from the project settings.");
    setPlisioKey("");
  };


  if (loading) {
    return (
      <AdminLayout title="Payment Gateway">
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Payment Gateway">
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Configure payment processing, deposit fees, and seller commission rates.
        </p>

        {/* Plisio API Key */}
        <Section icon={ShieldCheck} title="Payment Gateway · Plisio">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20 mb-4">
            <AlertTriangle className="h-4 w-4 text-primary-glow shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Your Plisio secret key is stored securely on the server. It is never sent to the browser.
              {keyExists && keyValid && <span className="text-success ml-1 font-semibold">✓ Key is valid and online</span>}
              {keyExists && !keyValid && <span className="text-destructive ml-1 font-semibold">✕ Key is configured but invalid</span>}
              {!keyExists && <span className="text-warning ml-1 font-semibold">⚠ No key configured — deposits won't work</span>}
            </p>
          </div>

          <Field label="Plisio Secret Key">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showKey ? "text" : "password"}
                  value={plisioKey}
                  onChange={(e) => setPlisioKey(e.target.value)}
                  placeholder={keyExists ? "••••••••••••••••  (enter new key to update)" : "Enter your Plisio API secret key"}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <button onClick={savePlisioKey} disabled={savingKey || !plisioKey.trim()} className="btn-luxe shrink-0">
                {savingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save key
              </button>
            </div>
          </Field>
          <p className="text-[10px] text-muted-foreground mt-1">
            Get your key from <a href="https://plisio.net/account/api" target="_blank" rel="noreferrer" className="text-primary-glow underline">plisio.net/account/api</a>
          </p>
        </Section>

        {/* Deposit Fees */}
        <Section icon={Wallet} title="Deposit Fees">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Deposit fee (%)">
              <div className="relative">
                <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number" step="0.1" min="0" max="100"
                  value={settings.deposit_fee_percent}
                  onChange={(e) => set("deposit_fee_percent", Number(e.target.value))}
                  className="pl-10"
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Percentage deducted from each deposit (e.g. 5 = 5%)</p>
            </Field>
            <Field label="Deposit flat fee ($)">
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number" step="0.01" min="0"
                  value={settings.deposit_fee_flat}
                  onChange={(e) => set("deposit_fee_flat", Number(e.target.value))}
                  className="pl-10"
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Fixed USD amount deducted from each deposit</p>
            </Field>
          </div>
        </Section>

        {/* Commission Settings */}
        <Section icon={CreditCard} title="Commission & Pricing">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Default seller commission (%)">
              <div className="relative">
                <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number" step="0.1" min="0" max="100"
                  value={settings.default_commission_percent}
                  onChange={(e) => set("default_commission_percent", Number(e.target.value))}
                  className="pl-10"
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Commission deducted from seller earnings on each card sale
              </p>
            </Field>
            <Field label="Minimum card price ($)">
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number" step="0.01" min="0"
                  value={settings.min_card_price}
                  onChange={(e) => set("min_card_price", Number(e.target.value))}
                  className="pl-10"
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Sellers cannot list cards below this price
              </p>
            </Field>
          </div>
        </Section>

        {/* Save Button */}
        <div className="flex justify-end">
          <button onClick={saveSettings} disabled={saving} className="btn-luxe">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : "Save payment settings"}
          </button>
        </div>
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

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <Label className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{label}</Label>
    <div className="mt-1.5">{children}</div>
  </div>
);

export default AdminPaymentGateway;
