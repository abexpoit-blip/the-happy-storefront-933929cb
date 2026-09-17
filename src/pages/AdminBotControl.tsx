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
  Megaphone, Settings2, History, Send,
  Loader2, ShieldAlert, ShieldCheck, BotMessageSquare,
  ShieldOff, Plus, Minus, Search, ExternalLink,
  ToggleLeft, ToggleRight,
} from "lucide-react";
import {
  getBotStats, getBotSettings, saveBotSettings,
  getBroadcastHistory, sendBroadcast,
  type BotStats, type BotSettings, type BroadcastRow,
} from "@/lib/botAdminControl.functions";
import {
  listBotUsers, adjustBotBalance, setBotUserBanned,
  type BotUserRow,
} from "@/lib/botAdmin.functions";

const money = (n: number) => `$${Number(n || 0).toFixed(2)}`;
const TAB_OVERVIEW = "overview";
const TAB_USERS = "users";
const TAB_BROADCAST = "broadcast";
const TAB_SETTINGS = "settings";
const TAB_HISTORY = "history";
type Tab = typeof TAB_OVERVIEW | typeof TAB_USERS | typeof TAB_BROADCAST | typeof TAB_SETTINGS | typeof TAB_HISTORY;

const AdminBotControl = () => {
  const loadStats = useServerFn(getBotStats);
  const loadSettings = useServerFn(getBotSettings);
  const saveSettings = useServerFn(saveBotSettings);
  const loadHistory = useServerFn(getBroadcastHistory);
  const broadcast = useServerFn(sendBroadcast);
  const loadUsers = useServerFn(listBotUsers);
  const adjustBalance = useServerFn(adjustBotBalance);
  const setBanned = useServerFn(setBotUserBanned);

  const [tab, setTab] = useState<Tab>(TAB_OVERVIEW);
  const [stats, setStats] = useState<BotStats | null>(null);
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [history, setHistory] = useState<BroadcastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastText, setBroadcastText] = useState("");

  // Users Tab State
  const [botUsers, setBotUsers] = useState<BotUserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});

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
      console.warn("History load caught:", e);
      setHistory([]);
    }
  }, [loadHistory]);

  const refreshUsers = useCallback(async (term?: string) => {
    setUsersLoading(true);
    try {
      setBotUsers(await loadUsers({ data: { search: term ?? "" } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load bot users");
    }
    setUsersLoading(false);
  }, [loadUsers]);

  useEffect(() => {
    document.title = "Admin · Bot control";
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (tab === TAB_HISTORY) void loadHistoryTab();
    if (tab === TAB_USERS) void refreshUsers(userSearch);
  }, [tab, loadHistoryTab, refreshUsers, userSearch]);

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

  const changeUserBalance = async (row: BotUserRow, sign: 1 | -1) => {
    const value = Number(amounts[row.userId] ?? "");
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter an amount first");
      return;
    }
    try {
      await adjustBalance({
        data: {
          userId: row.userId,
          amount: sign * value,
          description: sign > 0 ? "Bot balance added by admin" : "Bot balance removed by admin",
        },
      });
      toast.success(`${sign > 0 ? "Added" : "Removed"} ${money(value)}`);
      setAmounts((a) => ({ ...a, [row.userId]: "" }));
      refreshUsers(userSearch);
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const toggleBanUser = async (row: BotUserRow) => {
    try {
      await setBanned({ data: { telegramId: row.telegramId, userId: row.userId, banned: !row.banned } });
      toast.success(row.banned ? "Unbanned" : "Banned");
      refreshUsers(userSearch);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const setS = <K extends keyof BotSettings>(k: K, v: BotSettings[K]) =>
    setSettings((prev) => prev ? { ...prev, [k]: v } : prev);

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: TAB_OVERVIEW, label: "Overview", icon: BarChart2 },
    { id: TAB_USERS, label: `Bot users (${stats?.totalUsers ?? 0})`, icon: Users },
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
            <div className="h-11 w-11 rounded-xl bg-[#38bdf8]/15 border border-[#38bdf8]/40 flex items-center justify-center shadow-lg shadow-[#38bdf8]/10">
              <BotMessageSquare className="h-6 w-6 text-[#38bdf8]" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight">Zoru Checker Bot</h1>
              <p className="text-xs text-slate-400">Complete control center for Telegram bot users, settings & broadcasts</p>
            </div>
          </div>
          <Button
            onClick={refresh}
            disabled={loading}
            className="bg-[#121c3b] hover:bg-[#1a2954] text-white border border-slate-700/80 font-semibold px-4 py-2 rounded-xl shadow-md transition"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin text-[#38bdf8]" : "text-[#38bdf8]"}`} /> Refresh
          </Button>
        </div>

        {/* Quick stat cards — always visible */}
        {stats && (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
            {[
              { label: "Bot users", value: String(stats.totalUsers), icon: Users, action: () => setTab(TAB_USERS), hint: "View all ›" },
              { label: "Pending deposits", value: String(stats.pendingDeposits), icon: DollarSign },
              { label: "Checks today", value: String(stats.checksToday), icon: Activity },
              { label: "Total checks", value: String(stats.totalChecks), icon: Activity },
              { label: "Total deposited", value: money(stats.totalDeposited), icon: DollarSign },
            ].map((s) => (
              <div
                key={s.label}
                onClick={s.action}
                className={`rounded-xl border border-slate-700/80 bg-[#0c1430] p-4 shadow-lg transition-all ${
                  s.action ? "cursor-pointer hover:border-[#38bdf8] hover:shadow-[#38bdf8]/10 hover:-translate-y-0.5" : ""
                }`}
              >
                <div className="text-[11px] uppercase font-bold tracking-wider text-[#38bdf8] flex items-center justify-between">
                  <span>{s.label}</span>
                  <s.icon className="h-4 w-4 text-[#38bdf8]/80" />
                </div>
                <div className="mt-1.5 text-2xl font-black text-white font-mono flex items-baseline justify-between">
                  <span>{s.value}</span>
                  {s.hint && <span className="text-[10px] font-sans font-semibold text-slate-400">{s.hint}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-700/80 bg-[#0c1430] p-1.5 shadow-lg">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold transition-all ${
                  active
                    ? "bg-[#38bdf8] text-[#07101f] shadow-lg shadow-[#38bdf8]/20"
                    : "text-slate-300 hover:text-white hover:bg-slate-800/60"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── Overview ────────────────────────────── */}
        {tab === TAB_OVERVIEW && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-700/80 bg-[#0c1430] p-6 space-y-4 shadow-xl">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="font-bold text-white text-[15px]">Bot status</h2>
                <Button
                  onClick={() => setTab(TAB_USERS)}
                  className="bg-[#121c3b] hover:bg-[#1a2954] text-[#38bdf8] border border-[#38bdf8]/40 font-semibold text-xs h-8 px-3 rounded-lg shadow-sm"
                >
                  <Users className="h-3.5 w-3.5 mr-1.5" /> View {stats?.totalUsers ?? 0} Bot Users
                </Button>
              </div>
              {loading ? (
                <div className="flex items-center gap-2 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
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
                    <div className="sm:col-span-2 rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-4">
                      <div className="text-[11px] uppercase tracking-wider text-yellow-400 font-bold mb-1">Active bot notice</div>
                      <p className="text-sm text-white/90">{settings.bot_notice}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-slate-400 text-sm">Could not load settings. Run bot-admin.sql migration first.</p>
              )}
            </div>

            {/* Quick action card for Bot Users */}
            <div className="rounded-2xl border border-slate-700/80 bg-[#0c1430] p-5 shadow-xl flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-500/20 text-[#38bdf8] flex items-center justify-center border border-blue-500/30">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-bold text-white text-sm">Bot User Accounts ({stats?.totalUsers ?? 0})</div>
                  <div className="text-xs text-slate-400">View balances, deposit history, cards checked, ban status or add funds</div>
                </div>
              </div>
              <Button
                onClick={() => setTab(TAB_USERS)}
                className="bg-[#38bdf8] hover:bg-[#0ea5e9] text-[#07101f] font-bold text-xs h-9 px-4 rounded-xl shadow-md transition"
              >
                Open Bot Users List ›
              </Button>
            </div>
          </div>
        )}

        {/* ── Bot Users Tab ─────────────────────────── */}
        {tab === TAB_USERS && (
          <div className="space-y-4">
            {/* Search & Refresh Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && refreshUsers(userSearch)}
                  placeholder="Search telegram username..."
                  className="w-72 pl-9 bg-[#121c3b] text-white border-slate-700 font-medium placeholder:text-slate-400 rounded-xl shadow-inner text-xs h-9"
                />
              </div>
              <Button
                onClick={() => refreshUsers(userSearch)}
                disabled={usersLoading}
                className="bg-[#121c3b] hover:bg-[#1a2954] text-white border border-slate-700 font-semibold text-xs h-9 px-4 rounded-xl shadow-md transition"
              >
                <RefreshCw className={`mr-2 h-3.5 w-3.5 ${usersLoading ? "animate-spin text-[#38bdf8]" : "text-[#38bdf8]"}`} />
                Refresh Users
              </Button>
            </div>

            {/* Users Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-700/80 bg-[#0c1430] shadow-xl text-white">
              <table className="w-full min-w-[960px] text-sm">
                <thead className="bg-[#111f42] text-[11px] uppercase tracking-wider text-[#94a3b8] border-b border-slate-700/80">
                  <tr>
                    <th className="px-4 py-3.5 text-left font-bold">Telegram User</th>
                    <th className="px-4 py-3.5 text-left font-bold">Balance</th>
                    <th className="px-4 py-3.5 text-left font-bold">Bonus</th>
                    <th className="px-4 py-3.5 text-left font-bold">Total Deposited</th>
                    <th className="px-4 py-3.5 text-left font-bold">Cards Checked</th>
                    <th className="px-4 py-3.5 text-left font-bold">Quick Balance</th>
                    <th className="px-4 py-3.5 text-left font-bold">Status & Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {botUsers.map((r) => (
                    <tr key={r.userId} className="hover:bg-white/[0.04] transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-white text-[14px]">
                          {r.username ? `@${r.username}` : r.firstName || "user"}
                        </div>
                        <div className="text-[11px] text-[#38bdf8] font-mono mt-0.5">ID: {r.telegramId}</div>
                      </td>
                      <td className="px-4 py-3.5 font-bold font-mono text-emerald-400 text-sm">{money(r.balance)}</td>
                      <td className="px-4 py-3.5 font-mono text-amber-400 text-xs">{money(r.bonus)}</td>
                      <td className="px-4 py-3.5 font-mono text-emerald-300 font-bold text-sm">{money(r.deposited)}</td>
                      <td className="px-4 py-3.5 font-mono text-white font-bold text-sm">{r.checks}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <Input
                            value={amounts[r.userId] ?? ""}
                            onChange={(e) => setAmounts((a) => ({ ...a, [r.userId]: e.target.value }))}
                            placeholder="0.00"
                            className="h-8 w-20 bg-[#162348] border-slate-600 text-white font-mono text-xs placeholder:text-slate-400 shadow-inner rounded-md"
                          />
                          <Button
                            size="sm"
                            className="h-8 w-8 p-0 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-md"
                            onClick={() => changeUserBalance(r, 1)}
                            title="Add balance"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            className="h-8 w-8 p-0 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-md"
                            onClick={() => changeUserBalance(r, -1)}
                            title="Deduct balance"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            className={`h-8 text-xs font-semibold rounded-md ${
                              r.banned
                                ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                                : "bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/40"
                            }`}
                            onClick={() => toggleBanUser(r)}
                          >
                            {r.banned ? (
                              <>
                                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Unban
                              </>
                            ) : (
                              <>
                                <ShieldOff className="mr-1.5 h-3.5 w-3.5" /> Ban
                              </>
                            )}
                          </Button>
                          <a
                            href={`/admin/checker?search=${encodeURIComponent(r.username || String(r.telegramId))}`}
                            className="h-8 inline-flex items-center gap-1.5 px-3 rounded-md text-xs font-semibold bg-[#38bdf8]/15 text-[#38bdf8] border border-[#38bdf8]/40 hover:bg-[#38bdf8]/25 transition"
                            title="View checks & live cards for this user"
                          >
                            <Activity className="h-3.5 w-3.5" />
                            Live cards
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!botUsers.length && !usersLoading && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-sm">
                        No bot users found. They will appear here immediately as soon as a user taps /start on @ZoruCheckerbot.
                      </td>
                    </tr>
                  )}
                  {usersLoading && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-sm">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-[#38bdf8] mb-2" />
                        Loading bot users...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Broadcast ───────────────────────────── */}
        {tab === TAB_BROADCAST && (
          <div className="space-y-4">
            {/* Maintenance toggle */}
            {settings && (
              <div className="rounded-2xl border border-slate-700/80 bg-[#0c1430] p-6 shadow-xl">
                <h2 className="font-bold text-white text-[15px] mb-4">Maintenance mode</h2>
                <div className="flex items-start gap-4 flex-wrap">
                  <button
                    onClick={() => {
                      setS("bot_maintenance", !settings.bot_maintenance);
                    }}
                    className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold border transition-all ${
                      settings.bot_maintenance
                        ? "border-red-500/50 bg-red-500/20 text-red-300 hover:bg-red-500/30"
                        : "border-slate-600 bg-[#142247] text-white hover:bg-[#1a2c5e]"
                    }`}
                  >
                    {settings.bot_maintenance
                      ? <><ToggleRight className="h-4 w-4 text-red-400" /> Turn OFF maintenance</>
                      : <><ToggleLeft className="h-4 w-4 text-emerald-400" /> Turn ON maintenance</>
                    }
                  </button>
                  <div className="flex-1 min-w-[280px]">
                    <Label className="text-[10px] uppercase font-bold tracking-widest text-[#38bdf8]">Maintenance message</Label>
                    <Input
                      value={settings.bot_maintenance_msg}
                      onChange={(e) => setS("bot_maintenance_msg", e.target.value)}
                      placeholder="🔧 Under maintenance. Back soon."
                      className="mt-1.5 bg-[#131f40] border-slate-600 text-white placeholder:text-slate-500 font-medium"
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <Label className="text-[10px] uppercase font-bold tracking-widest text-[#38bdf8]">Persistent bot notice (shown at bottom of every bot message)</Label>
                  <div className="flex gap-2 mt-1.5">
                    <Input
                      value={settings.bot_notice}
                      onChange={(e) => setS("bot_notice", e.target.value)}
                      placeholder="e.g. ⚠️ New gate available — use /gate to switch"
                      className="flex-1 bg-[#131f40] border-slate-600 text-white placeholder:text-slate-500 font-medium"
                    />
                    <Button
                      size="sm"
                      onClick={() => setS("bot_notice", "")}
                      className="shrink-0 bg-slate-800 text-slate-200 border border-slate-600 hover:bg-slate-700 font-semibold"
                    >
                      Clear
                    </Button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Leave blank to hide. Max 500 chars.</p>
                </div>
                <Button onClick={handleSaveSettings} disabled={saving} className="mt-4 bg-blue-600 hover:bg-blue-500 text-white font-bold">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save
                </Button>
              </div>
            )}

            {/* Broadcast message */}
            <div className="rounded-2xl border border-slate-700/80 bg-[#0c1430] p-6 shadow-xl">
              <h2 className="font-bold text-white text-[15px] mb-1">Broadcast message</h2>
              <p className="text-[12px] text-slate-400 mb-4">Sends a message to ALL non-banned bot users via Telegram. HTML allowed.</p>
              <Textarea
                value={broadcastText}
                onChange={(e) => setBroadcastText(e.target.value)}
                placeholder="<b>📢 Announcement</b>&#10;&#10;New gates are now available! Use /gate to switch."
                rows={6}
                className="font-mono text-[13px] bg-[#131f40] border-slate-600 text-white placeholder:text-slate-500"
              />
              <div className="flex items-center gap-3 mt-3">
                <Button onClick={handleBroadcast} disabled={broadcasting || !broadcastText.trim()} className="bg-blue-600 hover:bg-blue-500 text-white font-bold">
                  {broadcasting
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Sending…</>
                    : <><Send className="h-4 w-4 mr-2" /> Send broadcast</>
                  }
                </Button>
                <p className="text-[11px] text-slate-400">This cannot be undone. Telegram rate-limits at 30 msg/s.</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Settings ────────────────────────────── */}
        {tab === TAB_SETTINGS && settings && (
          <div className="rounded-2xl border border-slate-700/80 bg-[#0c1430] p-6 space-y-5 shadow-xl">
            <h2 className="font-bold text-white text-[15px]">Bot settings</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Checker toggle */}
              <div>
                <Label className="text-[10px] uppercase font-bold tracking-widest text-[#38bdf8]">Checker</Label>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => setS("checker_enabled", true)}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-all ${
                      settings.checker_enabled
                        ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-300"
                        : "border-slate-700 bg-[#131f40] text-slate-400 hover:text-white"
                    }`}
                  >
                    <ShieldCheck className="h-4 w-4 inline mr-1.5" />Enabled
                  </button>
                  <button
                    onClick={() => setS("checker_enabled", false)}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-all ${
                      !settings.checker_enabled
                        ? "border-red-500/60 bg-red-500/20 text-red-300"
                        : "border-slate-700 bg-[#131f40] text-slate-400 hover:text-white"
                    }`}
                  >
                    <ShieldAlert className="h-4 w-4 inline mr-1.5" />Disabled
                  </button>
                </div>
              </div>

              {/* Min deposit */}
              <div>
                <Label className="text-[10px] uppercase font-bold tracking-widest text-[#38bdf8]">Minimum deposit ($)</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={settings.min_deposit}
                  onChange={(e) => setS("min_deposit", Number(e.target.value))}
                  className="mt-1.5 bg-[#131f40] border-slate-600 text-white font-medium"
                />
              </div>

              {/* Check credit cost */}
              <div>
                <Label className="text-[10px] uppercase font-bold tracking-widest text-[#38bdf8]">Credits per check</Label>
                <Input
                  type="number" step="1" min="0"
                  value={settings.check_credit_cost}
                  onChange={(e) => setS("check_credit_cost", Number(e.target.value))}
                  className="mt-1.5 bg-[#131f40] border-slate-600 text-white font-medium"
                />
              </div>

              {/* Credits per USD */}
              <div>
                <Label className="text-[10px] uppercase font-bold tracking-widest text-[#38bdf8]">Credits per $1</Label>
                <Input
                  type="number" step="1" min="1"
                  value={settings.credits_per_usd}
                  onChange={(e) => setS("credits_per_usd", Number(e.target.value))}
                  className="mt-1.5 bg-[#131f40] border-slate-600 text-white font-medium"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Effective cost: ${((settings.check_credit_cost || 0) / (settings.credits_per_usd || 1000)).toFixed(4)} per check
                </p>
              </div>

              {/* Referral Bonus */}
              <div>
                <Label className="text-[10px] uppercase font-bold tracking-widest text-[#38bdf8]">Referral bonus ($)</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={settings.referral_bonus ?? 5}
                  onChange={(e) => setS("referral_bonus", Number(e.target.value))}
                  className="mt-1.5 bg-[#131f40] border-slate-600 text-white font-medium"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  One-time bonus credited after invited user makes their first deposit.
                </p>
              </div>

              {/* Admin Contact URL */}
              <div>
                <Label className="text-[10px] uppercase font-bold tracking-widest text-[#38bdf8]">Contact Admin URL / Telegram</Label>
                <Input
                  value={settings.bot_admin_contact}
                  onChange={(e) => setS("bot_admin_contact", e.target.value)}
                  placeholder="https://t.me/samexpoit"
                  className="mt-1.5 bg-[#131f40] border-slate-600 text-white font-medium"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Telegram user or support link opened when users tap "📩 Contact Admin" in the bot.
                </p>
              </div>

              {/* Website URL */}
              <div>
                <Label className="text-[10px] uppercase font-bold tracking-widest text-[#38bdf8]">Website URL</Label>
                <Input
                  value={settings.bot_website_url}
                  onChange={(e) => setS("bot_website_url", e.target.value)}
                  placeholder="https://zoru.cc/"
                  className="mt-1.5 bg-[#131f40] border-slate-600 text-white font-medium"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Website URL opened when users tap "🌐 Website" in the bot.
                </p>
              </div>
            </div>

            <Button onClick={handleSaveSettings} disabled={saving} className="bg-blue-600 hover:bg-blue-500 text-white font-bold">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save bot settings
            </Button>
          </div>
        )}

        {/* ── History ─────────────────────────────── */}
        {tab === TAB_HISTORY && (
          <div className="overflow-x-auto rounded-2xl border border-slate-700/80 bg-[#0c1430] shadow-xl text-white">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-[#111f42] text-[11px] uppercase tracking-wider text-[#94a3b8] border-b border-slate-700/80">
                <tr>
                  <th className="px-4 py-3.5 text-left font-semibold">Message (truncated)</th>
                  <th className="px-4 py-3.5 text-center font-semibold">Sent</th>
                  <th className="px-4 py-3.5 text-center font-semibold">Failed</th>
                  <th className="px-4 py-3.5 text-right font-semibold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {history.map((row) => (
                  <tr key={row.id} className="hover:bg-white/[0.04] transition-colors">
                    <td className="px-4 py-3.5 text-white max-w-[380px] truncate" title={row.text}>
                      {row.text.slice(0, 80)}{row.text.length > 80 ? "…" : ""}
                    </td>
                    <td className="px-4 py-3.5 text-center font-bold text-emerald-400">{row.sent_count}</td>
                    <td className="px-4 py-3.5 text-center font-bold text-red-400">{row.failed_count}</td>
                    <td className="px-4 py-3.5 text-right text-slate-400 text-[11px] font-mono">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {!history.length && (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-slate-400 text-sm">
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
