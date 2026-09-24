import { useEffect, useState, useCallback } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { adminListDeposits, adminSetDepositStatus } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Loader2, Search, CheckCircle2, XCircle, Clock, Filter,
  RefreshCw, DollarSign, ArrowUpDown
} from "lucide-react";

interface Deposit {
  id: string;
  user_id: string;
  user_email?: string;
  user_username?: string;
  amount: number;
  method: string;
  status: string;
  crypto_currency?: string;
  crypto_amount?: number;
  plisio_invoice_id?: string;
  invoice_id?: string;
  plisio_wallet?: string;
  wallet_address?: string;
  txid?: string;
  confirmations?: number;
  admin_notes?: string;
  admin_note?: string;
  created_at: string;
  expires_at?: string;
  reviewed_at?: string;
}

type StatusFilter = "all" | "pending" | "approved" | "rejected";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-warning/15 text-warning border-warning/30",
  approved: "bg-success/15 text-success border-success/30",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
  expired: "bg-destructive/15 text-destructive border-destructive/30",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Clock className="h-3.5 w-3.5" />,
  approved: <CheckCircle2 className="h-3.5 w-3.5" />,
  rejected: <XCircle className="h-3.5 w-3.5" />,
  expired: <XCircle className="h-3.5 w-3.5" />,
};

const AdminPayments = () => {
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = (await adminListDeposits()) as unknown as Deposit[];
      const needle = search.trim().toLowerCase();
      setDeposits(rows.filter(d => {
        if (filter !== "all" && d.status !== filter) return false;
        if (!needle) return true;
        return [d.user_username, d.user_email, d.txid, d.id].some(v => (v ?? "").toLowerCase().includes(needle));
      }));
    } catch {
      toast.error("Failed to load deposits");
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    document.title = "Admin · Payments";
    load();
  }, [load]);

  // Debounced search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    try {
      await adminSetDepositStatus(id, "approved", "Manually approved by admin");
      toast.success("Deposit approved & credited");
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to approve");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: string) => {
    setActionLoading(id);
    try {
      await adminSetDepositStatus(id, "rejected", "Rejected by admin");
      toast.success("Deposit rejected");
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to reject");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCleanExpired = async () => {
    setActionLoading("clean");
    try {
      const { data, error } = await supabase.rpc("expire_stale_deposits");
      if (error) throw error;
      toast.success(`Cleaned ${data ?? 0} expired unpaid deposit(s)`);
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to clean expired deposits");
    } finally {
      setActionLoading(null);
    }
  };

  const filters: { key: StatusFilter; label: string; icon: React.ReactNode }[] = [
    { key: "all", label: "All", icon: <ArrowUpDown className="h-3.5 w-3.5" /> },
    { key: "pending", label: "Pending", icon: <Clock className="h-3.5 w-3.5" /> },
    { key: "approved", label: "Approved", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    { key: "rejected", label: "Rejected", icon: <XCircle className="h-3.5 w-3.5" /> },
  ];

  const pendingCount = deposits.filter((d) => d.status === "pending").length;

  return (
    <AdminLayout title="Payments">
      <div className="space-y-5">
        {/* Stats bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total", value: deposits.length, color: "text-foreground" },
            { label: "Pending", value: pendingCount, color: "text-warning" },
            { label: "Approved", value: deposits.filter((d) => d.status === "approved").length, color: "text-success" },
            { label: "Rejected", value: deposits.filter((d) => d.status === "rejected").length, color: "text-destructive" },
          ].map((s) => (
            <div key={s.label} className="glass-neon rounded-xl p-4 text-center">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{s.label}</p>
              <p className={`font-display text-2xl font-black ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filters + search */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-1.5 flex-wrap">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                  filter === f.key
                    ? "bg-primary/20 border-primary/40 text-primary-glow"
                    : "bg-secondary/30 border-border/40 text-muted-foreground hover:border-primary/30"
                }`}
              >
                {f.icon} {f.label}
              </button>
            ))}
          </div>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by user, email, invoice ID, or txid…"
              className="pl-9 bg-input/60"
            />
          </div>
          <Button
            variant="outline"
            onClick={handleCleanExpired}
            disabled={actionLoading === "clean"}
            className="shrink-0 text-xs gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
            title="Auto-reject all unpaid deposits older than 30 minutes"
          >
            {actionLoading === "clean" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
            Clean Expired
          </Button>
          <Button variant="outline" size="icon" onClick={load} className="shrink-0" title="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Deposits table */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading deposits…
          </div>
        ) : deposits.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <DollarSign className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No deposits found</p>
          </div>
        ) : (
          <div className="glass-neon rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-sm">
                <thead>
                  <tr className="border-b border-border/40 text-[10px] uppercase tracking-widest text-muted-foreground">
                    <th className="text-left p-3 pl-5">User</th>
                    <th className="text-left p-3">Amount</th>
                    <th className="text-left p-3">Method</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Invoice / TxID</th>
                    <th className="text-left p-3">Date</th>
                    <th className="text-right p-3 pr-5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deposits.map((d) => (
                    <tr key={d.id} className="border-b border-border/20 hover:bg-secondary/20 transition">
                      <td className="p-3 pl-5">
                        <div>
                          <p className="font-medium text-foreground truncate max-w-[140px]">
                            {d.user_username || "—"}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                            {d.user_email || d.user_id.slice(0, 12) + "…"}
                          </p>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="font-display font-bold text-foreground">
                          ${Number(d.amount).toFixed(2)}
                        </span>
                        {d.crypto_amount && d.crypto_currency && (
                          <p className="text-[10px] text-muted-foreground">
                            {d.crypto_amount} {d.crypto_currency}
                          </p>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="text-xs text-muted-foreground">{d.method}</span>
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${STATUS_COLORS[d.status] || "bg-secondary/40 text-foreground border-border/40"}`}>
                          {STATUS_ICONS[d.status]} {d.status}
                        </span>
                        {d.confirmations != null && d.confirmations > 0 && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">{d.confirmations} conf</p>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="space-y-0.5">
                          {d.plisio_invoice_id && (
                            <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[120px]" title={d.plisio_invoice_id}>
                              inv: {d.plisio_invoice_id.slice(0, 14)}…
                            </p>
                          )}
                          {d.txid && (
                            <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[120px]" title={d.txid}>
                              tx: {d.txid.slice(0, 14)}…
                            </p>
                          )}
                          {!d.plisio_invoice_id && !d.txid && (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <p className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(d.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(d.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </td>
                      <td className="p-3 pr-5 text-right">
                        {d.status === "pending" ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px] border-success/40 text-success hover:bg-success/10"
                              disabled={actionLoading === d.id}
                              onClick={() => handleApprove(d.id)}
                            >
                              {actionLoading === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px] border-destructive/40 text-destructive hover:bg-destructive/10"
                              disabled={actionLoading === d.id}
                              onClick={() => handleReject(d.id)}
                            >
                              <XCircle className="h-3 w-3" /> Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">
                            {d.admin_notes ? d.admin_notes.slice(0, 30) + (d.admin_notes.length > 30 ? "…" : "") : "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminPayments;
