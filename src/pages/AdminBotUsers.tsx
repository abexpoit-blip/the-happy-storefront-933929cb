import { useCallback, useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bot, RefreshCw, ShieldOff, ShieldCheck, Plus, Minus, Search, Activity, DollarSign } from "lucide-react";
import { listBotUsers, adjustBotBalance, setBotUserBanned, type BotUserRow } from "@/lib/botAdmin.functions";

const money = (n: number) => `$${Number(n || 0).toFixed(2)}`;

const AdminBotUsers = () => {
  const load = useServerFn(listBotUsers);
  const adjust = useServerFn(adjustBotBalance);
  const setBanned = useServerFn(setBotUserBanned);

  const [rows, setRows] = useState<BotUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const refresh = useCallback(
    async (term?: string) => {
      setLoading(true);
      try {
        setRows(await load({ data: { search: term ?? "" } }));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load bot users");
      }
      setLoading(false);
    },
    [load],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  const changeBalance = async (row: BotUserRow, sign: 1 | -1) => {
    const value = Number(amounts[row.userId] ?? "");
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter an amount first");
      return;
    }
    try {
      await adjust({
        data: {
          userId: row.userId,
          amount: sign * value,
          description: sign > 0 ? "Bot balance added by admin" : "Bot balance removed by admin",
        },
      });
      toast.success(`${sign > 0 ? "Added" : "Removed"} ${money(value)}`);
      setAmounts((a) => ({ ...a, [row.userId]: "" }));
      refresh(search);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const toggleBan = async (row: BotUserRow) => {
    try {
      await setBanned({ data: { telegramId: row.telegramId, userId: row.userId, banned: !row.banned } });
      toast.success(row.banned ? "Unbanned" : "Banned");
      refresh(search);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const totals = rows.reduce(
    (acc, r) => ({
      balance: acc.balance + r.balance,
      deposited: acc.deposited + r.deposited,
      checks: acc.checks + r.checks,
    }),
    { balance: 0, deposited: 0, checks: 0 },
  );

  return (
    <AdminLayout title="Telegram bot users">
      <div className="space-y-5">
        {/* 4 Quick Stat Cards */}
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: "Bot accounts", value: String(rows.length), icon: Bot },
            { label: "Total balance", value: money(totals.balance), icon: DollarSign },
            { label: "Total deposited", value: money(totals.deposited), icon: DollarSign },
            { label: "Cards checked", value: String(totals.checks), icon: Activity },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-slate-700/80 bg-[#0c1430] p-4 shadow-lg">
              <div className="text-[11px] uppercase font-bold tracking-wider text-[#38bdf8] flex items-center justify-between">
                <span>{s.label}</span>
                <s.icon className="h-4 w-4 text-[#38bdf8]/70" />
              </div>
              <div className="mt-1.5 text-2xl font-black text-white font-mono">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Search & Refresh */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && refresh(search)}
              placeholder="Search by telegram username"
              className="w-72 pl-9 bg-white text-slate-900 border-slate-300 font-medium placeholder:text-slate-400 shadow-sm"
            />
          </div>
          <Button
            className="bg-[#0c1430] text-white border border-slate-700 hover:bg-[#15234d] font-semibold"
            onClick={() => refresh(search)}
            disabled={loading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {/* Users Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-700/80 bg-[#0c1430] shadow-xl text-white">
          <table className="w-full min-w-[1020px] text-sm">
            <thead className="bg-[#111f42] text-[11px] uppercase tracking-wider text-[#94a3b8] border-b border-slate-700/80">
              <tr>
                <th className="px-4 py-3.5 text-left font-semibold">Telegram user</th>
                <th className="px-4 py-3.5 text-left font-semibold">Balance</th>
                <th className="px-4 py-3.5 text-left font-semibold">Bonus</th>
                <th className="px-4 py-3.5 text-left font-semibold">Total Deposited</th>
                <th className="px-4 py-3.5 text-left font-semibold">Cards Checked</th>
                <th className="px-4 py-3.5 text-left font-semibold">Manage balance</th>
                <th className="px-4 py-3.5 text-left font-semibold">Status & Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map((r) => (
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
                        className="h-8 w-20 bg-[#162348] border-slate-600 text-white font-mono text-xs placeholder:text-slate-400 shadow-inner"
                      />
                      <Button size="sm" className="h-8 px-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold" onClick={() => changeBalance(r, 1)} title="Add balance">
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" className="h-8 px-2.5 bg-slate-700 hover:bg-slate-600 text-white font-bold" onClick={() => changeBalance(r, -1)} title="Deduct balance">
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className={`h-8 text-xs font-semibold ${
                          r.banned
                            ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                            : "bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/40"
                        }`}
                        onClick={() => toggleBan(r)}
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
              {!rows.length && !loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-sm">
                    No bot users yet — they appear here as soon as someone starts the Telegram bot.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminBotUsers;
