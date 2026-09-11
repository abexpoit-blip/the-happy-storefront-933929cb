import { useCallback, useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Bot, RefreshCw, Users, DollarSign, Activity, BarChart2,
  Megaphone, Settings2, History, ToggleLeft, ToggleRight, Send,
  Loader2, ShieldAlert, ShieldCheck, BotMessageSquare,
} from "lucide-react";
import {
  getBotStats, getBotSettings, saveBotSettings,
  getBroadcastHistory, sendBroadcast,
  type BotStats, type BotSettings, type BroadcastRow,
} from "@/lib/botAdminControl.functions";

const money = (n: number) => `$${Number(n || 0).toFixed(2)}`;
const TAB_OVERVIEW = "overview";
const TAB_BROADCAST = "broadcast";
const TAB_SETTINGS = "settings";
const TAB_HISTORY = "history";
type Tab = typeof TAB_OVERVIEW | typeof TAB_BROADCAST | typeof TAB_SETTINGS | typeof TAB_HISTORY;

const AdminBotControl = () => {
  const loadStats = useServerFn(getBotStats);
  const loadSettings = useServerFn(getBotSettings);
  const saveSettings = useServerFn(saveBotSettings);
  const loadHistory = useServerFn(getBroadcastHistory);
  const broadcast = useServerFn(sendBroadcast);

  const [tab, setTab] = useState<Tab>(TAB_OVERVIEW);
  const [stats, setStats] = useState<BotStats | null>(null);
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [history, setHistory] = useState<BroadcastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastText, setBroadcastText] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [s, cfg] = await Promise.all([loadStats(), loadSettings()]);
      setStats(s);
      setSettings(cfg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    }
    setLoading(false);
  }, [loadStats, loadSettings]);

  const loadHistoryTab = useCallback(async () => {
    try {
      setHistory(await loadHistory());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load history");
    }
  }, [loadHistory]);

  useEffect(() => {
    document.title = "Admin · Bot control";
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (tab === TAB_HISTORY) void loadHistoryTab();
  }, [tab, loadHistoryTab]);

  const handleSaveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await saveSettings({ data: settings });
      toast.success("Bot settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
    setSaving(false);
  };

  const handleBroadcast = async () => {
    if (!broadcastText.trim()) { toast.error("Enter a message"); return; }
    setBroadcasting(true);
    try {
      const r = await broadcast({ data: { text: broadcastText.trim() } });
      toast.success(`Broadcast sent: ${r.sent} delivered, ${r.failed} failed`);
      setBroadcastText("");
      void loadHistoryTab();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Broadcast failed");
    }
    setBroadcasting(false);
  };

  const setS = <K extends keyof BotSettings>(k: K, v: BotSettings[K]) =>
    setSettings((prev) => prev ? { ...prev, [k]: v } : prev);

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: TAB_OVERVIEW, label: "Overview", icon: BarChart2 },
    { id: TAB_BROADCAST, label: "Broadcast", icon: Megaphone },
    { id: TAB_SETTINGS, label: "Bot settings", icon: Settings2 },
    { id: TAB_HISTORY, label: "Broadcast history", icon: History },
  ];

  return (
    <AdminLayout title="Telegram bot control">
      <div className="space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#38bdf8]/15 border border-[#38bdf8]/30 flex items-center justify-center">
              <BotMessageSquare className="h-5 w-5 text-[#38bdf8]" />
            </div>
            <div>
              <h1 className="text-[15px] font-bold text-white tracking-tight">Zoru Checker Bot</h1>
              <p className="text-[11px] text-white/50">Manage the bot from one place</p>
            </div>
          </div>
          <Button variant="outline" onClick={refresh} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {/* Quick stat cards — always visible */}
        {stats && (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
            {[
              { label: "Bot users", value: String(stats.totalUsers), icon: Users },
              { label: "Pending deposits", value: String(stats.pendingDeposits), icon: DollarSign },
              { label: "Checks today", value: String(stats.checksToday), icon: Activity },
              { label: "Total checks", value: String(stats.totalChecks), icon: Activity },
              { label: "Total deposited", value: money(stats.totalDeposited), icon: DollarSign },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-[11px] uppercase tracking-wider text-[#38bdf8]">{s.label}</div>
                <div className="mt-1 text-2xl font-bold text-white">{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-[13px] font-medium transition-all ${
                  tab === t.id
                    ? "bg-[#38bdf8]/15 text-[#7dd3fc] border border-[#38bdf8]/30"
                    : "text-white/50 hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── Overview ────────────────────────────── */}
        {tab === TAB_OVERVIEW && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
            <h2 className="font-bold text-white text-[15px]">Bot status</h2>
            {loading ? (
              <div className="flex items-center gap-2 text-white/50"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : settings ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <StatusCard
                  label="Maintenance mode"
                  active={settings.bot_maintenance}
                  activeText="ACTIVE — bot is paused"
                  inactiveText="Off — bot is running"
                  icon={ShieldAlert}
                />
                <StatusCard
                  label="Checker"
                  active={settings.checker_enabled}
                  activeText="Enabled"
                  inactiveText="Disabled"
                  icon={Bot}
                  invertColor
                />
                {settings.bot_notice && (
                  <div className="sm:col-span-2 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
                    <div className="text-[11px] uppercase tracking-wider text-yellow-400 mb-1">Active bot notice</div>
                    <p className="text-sm text-white/80">{settings.bot_notice}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-white/40 text-sm">Could not load settings. Run bot-admin.sql migration first.</p>
            )}
          </div>
        )}

        {/* ── Broadcast ───────────────────────────── */}
        {tab === TAB_BROADCAST && (
          <div className="space-y-4">
            {/* Maintenance toggle */}
            {settings && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-6">
                <h2 className="font-bold text-white text-[15px] mb-4">Maintenance mode</h2>
                <div className="flex items-start gap-4">
                  <button
                    onClick={() => {
                      setS("bot_maintenance", !settings.bot_maintenance);
                    }}
                    className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium border transition-all ${
                      settings.bot_maintenance
                        ? "border-red-500/50 bg-red-500/15 text-red-300 hover:bg-red-500/25"
                        : "border-white/20 bg-white/5 text-white/70 hover:text-white"
                    }`}
                  >
                    {settings.bot_maintenance
                      ? <><ToggleRight className="h-4 w-4" /> Turn OFF maintenance</>
                      : <><ToggleLeft className="h-4 w-4" /> Turn ON maintenance</>
                    }
                  </button>
                  <div className="flex-1">
                    <Label className="text-[10px] uppercase tracking-widest text-white/50">Maintenance message</Label>
                    <Input
                      value={settings.bot_maintenance_msg}
                      onChange={(e) => setS("bot_maintenance_msg", e.target.value)}
                      placeholder="🔧 Under maintenance. Back soon."
                      className="mt-1.5"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <Label className="text-[10px] uppercase tracking-widest text-white/50">Persistent bot notice (shown at bottom of every bot message)</Label>
                  <div className="flex gap-2 mt-1.5">
                    <Input
                      value={settings.bot_notice}
                      onChange={(e) => setS("bot_notice", e.target.value)}
                      placeholder="e.g. ⚠️ New gate available — use /gate to switch"
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setS("bot_notice", "")}
                      className="shrink-0"
                    >
                      Clear
                    </Button>
                  </div>
                  <p className="text-[10px] text-white/40 mt-1">Leave blank to hide. Max 500 chars.</p>
                </div>
                <Button onClick={handleSaveSettings} disabled={saving} className="mt-4">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save
                </Button>
              </div>
            )}

            {/* Broadcast message */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-6">
              <h2 className="font-bold text-white text-[15px] mb-1">Broadcast message</h2>
              <p className="text-[12px] text-white/50 mb-4">Sends a message to ALL non-banned bot users via Telegram. HTML allowed.</p>
              <Textarea
                value={broadcastText}
                onChange={(e) => setBroadcastText(e.target.value)}
                placeholder="<b>📢 Announcement</b>&#10;&#10;New gates are now available! Use /gate to switch."
                rows={6}
                className="font-mono text-[13px]"
              />
              <div className="flex items-center gap-3 mt-3">
                <Button onClick={handleBroadcast} disabled={broadcasting || !broadcastText.trim()}>
                  {broadcasting
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Sending…</>
                    : <><Send className="h-4 w-4 mr-2" /> Send broadcast</>
                  }
                </Button>
                <p className="text-[11px] text-white/40">This cannot be undone. Telegram rate-limits at 30 msg/s.</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Settings ────────────────────────────── */}
        {tab === TAB_SETTINGS && settings && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-5">
            <h2 className="font-bold text-white text-[15px]">Bot settings</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Checker toggle */}
              <div>
                <Label className="text-[10px] uppercase tracking-widest text-white/50">Checker</Label>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => setS("checker_enabled", true)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                      settings.checker_enabled
                        ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                        : "border-white/20 text-white/50 hover:text-white"
                    }`}
                  >
                    <ShieldCheck className="h-4 w-4 inline mr-1.5" />Enabled
                  </button>
                  <button
                    onClick={() => setS("checker_enabled", false)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                      !settings.checker_enabled
                        ? "border-red-500/50 bg-red-500/15 text-red-300"
                        : "border-white/20 text-white/50 hover:text-white"
                    }`}
                  >
                    <ShieldAlert className="h-4 w-4 inline mr-1.5" />Disabled
                  </button>
                </div>
              </div>

              {/* Min deposit */}
              <div>
                <Label className="text-[10px] uppercase tracking-widest text-white/50">Minimum deposit ($)</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={settings.min_deposit}
                  onChange={(e) => setS("min_deposit", Number(e.target.value))}
                  className="mt-1.5"
                />
              </div>

              {/* Check credit cost */}
              <div>
                <Label className="text-[10px] uppercase tracking-widest text-white/50">Credits per check</Label>
                <Input
                  type="number" step="1" min="0"
                  value={settings.check_credit_cost}
                  onChange={(e) => setS("check_credit_cost", Number(e.target.value))}
                  className="mt-1.5"
                />
              </div>

              {/* Credits per USD */}
              <div>
                <Label className="text-[10px] uppercase tracking-widest text-white/50">Credits per $1</Label>
                <Input
                  type="number" step="1" min="1"
                  value={settings.credits_per_usd}
                  onChange={(e) => setS("credits_per_usd", Number(e.target.value))}
                  className="mt-1.5"
                />
                <p className="text-[10px] text-white/40 mt-1">
                  Effective cost: ${((settings.check_credit_cost || 0) / (settings.credits_per_usd || 1000)).toFixed(4)} per check
                </p>
              </div>
            </div>

            <Button onClick={handleSaveSettings} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save bot settings
            </Button>
          </div>
        )}

        {/* ── History ─────────────────────────────── */}
        {tab === TAB_HISTORY && (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-white/60">
                <tr>
                  <th className="px-3 py-3 text-left">Message (truncated)</th>
                  <th className="px-3 py-3 text-center">Sent</th>
                  <th className="px-3 py-3 text-center">Failed</th>
                  <th className="px-3 py-3 text-right">Date</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id} className="border-t border-white/5">
                    <td className="px-3 py-3 text-white/80 max-w-[380px] truncate" title={row.text}>
                      {row.text.slice(0, 80)}{row.text.length > 80 ? "…" : ""}
                    </td>
                    <td className="px-3 py-3 text-center text-emerald-400">{row.sent_count}</td>
                    <td className="px-3 py-3 text-center text-red-400">{row.failed_count}</td>
                    <td className="px-3 py-3 text-right text-white/50 text-[11px]">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {!history.length && (
                  <tr>
                    <td colSpan={4} className="px-3 py-10 text-center text-white/40">
                      No broadcasts sent yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

const StatusCard = ({
  label, active, activeText, inactiveText, icon: Icon, invertColor,
}: {
  label: string; active: boolean; activeText: string; inactiveText: string;
  icon: React.ComponentType<{ className?: string }>; invertColor?: boolean;
}) => {
  const isAlert = invertColor ? !active : active;
  return (
    <div className={`rounded-xl border p-4 ${isAlert ? "border-red-500/30 bg-red-500/10" : "border-emerald-500/30 bg-emerald-500/10"}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 ${isAlert ? "text-red-400" : "text-emerald-400"}`} />
        <span className="text-[11px] uppercase tracking-wider text-white/60">{label}</span>
      </div>
      <div className={`text-sm font-semibold ${isAlert ? "text-red-300" : "text-emerald-300"}`}>
        {active ? activeText : inactiveText}
      </div>
    </div>
  );
};

export default AdminBotControl;
