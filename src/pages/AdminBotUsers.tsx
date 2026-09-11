import { useCallback, useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bot, RefreshCw, ShieldOff, ShieldCheck, Plus, Minus, Search } from "lucide-react";
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
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: "Bot accounts", value: String(rows.length), icon: Bot },
            { label: "Total balance", value: money(totals.balance), icon: Plus },
            { label: "Total deposited", value: money(totals.deposited), icon: Plus },
            { label: "Cards checked", value: String(totals.checks), icon: RefreshCw },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-[11px] uppercase tracking-wider text-[#38bdf8]">{s.label}</div>
              <div className="mt-1 text-2xl font-bold text-white">{s.value}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && refresh(search)}
              placeholder="Search by telegram username"
              className="w-64 pl-9"
            />
          </div>
          <Button variant="outline" onClick={() => refresh(search)} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-white/60">
              <tr>
                <th className="px-3 py-3 text-left">Telegram</th>
                <th className="px-3 py-3 text-left">Balance</th>
                <th className="px-3 py-3 text-left">Bonus</th>
                <th className="px-3 py-3 text-left">Deposited</th>
                <th className="px-3 py-3 text-left">Checks</th>
                <th className="px-3 py-3 text-left">Manage balance</th>
                <th className="px-3 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId} className="border-t border-white/5">
                  <td className="px-3 py-3">
                    <div className="font-semibold text-white">
                      {r.username ? `@${r.username}` : r.firstName || "user"}
                    </div>
                    <div className="text-[11px] text-white/50">ID {r.telegramId}</div>
                  </td>
                  <td className="px-3 py-3 font-semibold text-[#7dd3fc]">{money(r.balance)}</td>
                  <td className="px-3 py-3 text-white/70">{money(r.bonus)}</td>
                  <td className="px-3 py-3 text-white/70">{money(r.deposited)}</td>
                  <td className="px-3 py-3 text-white/70">{r.checks}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Input
                        value={amounts[r.userId] ?? ""}
                        onChange={(e) => setAmounts((a) => ({ ...a, [r.userId]: e.target.value }))}
                        placeholder="0.00"
                        className="h-9 w-24"
                      />
                      <Button size="sm" onClick={() => changeBalance(r, 1)}>
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => changeBalance(r, -1)}>
                        <Minus className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <Button size="sm" variant={r.banned ? "default" : "outline"} onClick={() => toggleBan(r)}>
                      {r.banned ? (
                        <>
                          <ShieldCheck className="mr-2 h-4 w-4" /> Unban
                        </>
                      ) : (
                        <>
                          <ShieldOff className="mr-2 h-4 w-4" /> Ban
                        </>
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
              {!rows.length && !loading && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-white/50">
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
