import { useEffect, useMemo, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BrandLogo, detectBrandFromBin, BRANDS } from "@/lib/brands";
import { parseAndFormat, dedupe, detectBrand, toPipeFormat } from "@/lib/cardFormatter";
import { detectOfflineBin } from "@/lib/binDetection";
import {
  adminPublishFullCards, adminListUsers, adminAdjustBalance, adminSetBlocked,
  adminOverview, adminSystemSnapshot, adminListDeposits, adminSetDepositStatus,
  adminSetRole, listAnnouncements, adminCreateAnnouncement, adminDeleteAnnouncement,
  listCategories, type Category, type SystemSnapshot,
} from "@/lib/store";
import { toast } from "sonner";
import {
  Check, X, Users, Megaphone, CreditCard, Ban, UserCheck, Wallet,
  TrendingUp, DollarSign, ShoppingCart, Package, FileText, Upload,
  Search, LogIn, Activity, ArrowUpRight, ArrowDownRight, Plus,
  Trash2, Wand2, Newspaper, Send, Eye, UserPlus, BarChart3,
  Calendar, Sparkles, Flame, AlertTriangle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { BackdateCardUploadDialog } from "@/components/BackdateCardUploadDialog";
import { broadcastChannelAlert } from "@/lib/cardAutomation.functions";
import { getBinDemandStats, type BinDemandItem } from "@/lib/binDemand.functions";
import { flagEmoji } from "@/lib/countries";
import { useAuth } from "@/hooks/useAuth";

interface Profile {
  id: string; username: string; email?: string; balance: number;
  is_seller: boolean; banned: boolean; role?: string; created_at?: string;
}
interface Deposit { id: string; user_id: string; amount: number; method: string; proof_url: string | null; status: string; created_at: string; }
interface Payout { id: string; seller_id: string; amount: number; method: string; destination: string; status: string; created_at: string; }
interface DailyRevenue { day: string; revenue: number; orders: number; }
interface TopSeller { id: string; username: string; cards_sold: number; total_sold: number; }
interface RecentOrder { id: string; total: number; status: string; created_at: string; buyer: string; }
interface NewsItem { id: string; title: string; body: string; type: string; created_at: string; }

const Admin = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [stats, setStats] = useState<Record<string, unknown>>({});
  const [vpsState, setVpsState] = useState<SystemSnapshot | null>(null);
  const [vpsBusy, setVpsBusy] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [news, setNews] = useState<NewsItem[]>([]);
  const [annTitle, setAnnTitle] = useState("");
  const [annBody, setAnnBody] = useState("");
  const [annType, setAnnType] = useState("update");

  // Card upload state
  const [cardRaw, setCardRaw] = useState("");
  const [cardPrice, setCardPrice] = useState("1.50");
  const [cardRefundable, setCardRefundable] = useState<"yes" | "no" | "mixed">("mixed");
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showBackdateModal, setShowBackdateModal] = useState(false);
  const [tgBroadcastCardUpload, setTgBroadcastCardUpload] = useState(true);

  const formatPreview = useMemo(() => {
    if (!cardRaw.trim()) {
      return { cards: [] as ReturnType<typeof parseAndFormat>["lines"], rows: [] as string[], valid: 0, dupes: 0, failedCount: 0, totalLines: 0, brands: [] as [string, number][] };
    }
    const totalLines = cardRaw.split("\n").filter(l => l.trim()).length;
    const { lines, failed } = parseAndFormat(cardRaw);
    const { unique, dropped } = dedupe(lines);
    const counter = new Map<string, number>();
    unique.forEach(c => {
      const b = detectBrand(c.cc) || "UNKNOWN";
      counter.set(b, (counter.get(b) ?? 0) + 1);
    });
    return {
      cards: unique,
      rows: unique.slice(0, 5).map(toPipeFormat),
      valid: unique.length,
      dupes: dropped,
      failedCount: failed.length,
      totalLines,
      brands: [...counter.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [cardRaw]);


  // Active tab
  const [tab, setTab] = useState<"overview" | "users" | "cards" | "broadcast">("overview");

  // Top Demanded BINs
  const [topDemandedBins, setTopDemandedBins] = useState<BinDemandItem[]>([]);

  // Manual balance modal
  const [balanceUser, setBalanceUser] = useState<Profile | null>(null);
  const [balanceAmount, setBalanceAmount] = useState("");
  const [balanceNote, setBalanceNote] = useState("");
  const [balanceBusy, setBalanceBusy] = useState(false);

  const loadUsers = async (q?: string) => {
    const rows = await adminListUsers();
    const needle = (q ?? "").trim().toLowerCase();
    const mapped: Profile[] = rows.map(r => ({
      id: r.id,
      username: r.username,
      email: r.email ?? undefined,
      balance: Number(r.balance ?? 0),
      is_seller: (r.roles ?? []).includes("seller"),
      banned: Boolean(r.blocked),
      role: (r.roles ?? []).includes("admin") ? "admin" : (r.roles ?? []).includes("seller") ? "seller" : "buyer",
      created_at: r.created_at,
    }));
    return needle
      ? mapped.filter(m => m.username?.toLowerCase().includes(needle) || (m.email ?? "").toLowerCase().includes(needle))
      : mapped;
  };

  const load = async () => {
    try {
      const [s, u, d, n, catRes, demandRes] = await Promise.allSettled([
        adminOverview(),
        loadUsers(userSearch),
        adminListDeposits(),
        listAnnouncements(),
        listCategories(true),
        getBinDemandStats({ data: { limit: 6 } }),
      ]);
      if (s.status === "fulfilled") setStats(s.value as unknown as Record<string, unknown>);
      if (u.status === "fulfilled") setUsers(u.value as Profile[]);
      if (d.status === "fulfilled") setDeposits(d.value as unknown as Deposit[]);
      if (n.status === "fulfilled") {
        setNews(n.value.map((a) => ({
          id: a.id, title: a.title, body: a.body, type: a.kind, created_at: a.created_at,
        })) as unknown as NewsItem[]);
      }
      if (catRes.status === "fulfilled") setCategories(catRes.value);
      if (demandRes.status === "fulfilled") setTopDemandedBins(demandRes.value.items ?? []);
      setPayouts([]);
    } catch { /* ignore */ }
  };

  const refreshVpsState = async () => {
    setVpsBusy(true);
    try {
      const v = await adminSystemSnapshot();
      setVpsState(v);
      toast.success("VPS state refreshed");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load VPS state");
    } finally {
      setVpsBusy(false);
    }
  };

  useEffect(() => { load(); adminSystemSnapshot().then(setVpsState).catch(() => {}); }, []);
  useEffect(() => {
    if (userSearch.length === 0 || userSearch.length >= 2) {
      const t = setTimeout(() => { loadUsers(userSearch).then(setUsers).catch(() => {}); }, 300);
      return () => clearTimeout(t);
    }
  }, [userSearch]);

  // Users pagination — 25 per page
  const USERS_PER_PAGE = 25;
  const [userPage, setUserPage] = useState(1);
  const userTotalPages = Math.max(1, Math.ceil(users.length / USERS_PER_PAGE));
  useEffect(() => { setUserPage(1); }, [userSearch, users.length]);
  const pagedUsers = useMemo(
    () => users.slice((userPage - 1) * USERS_PER_PAGE, userPage * USERS_PER_PAGE),
    [users, userPage],
  );

  const dailyRevenue = (stats.dailyRevenue ?? []) as DailyRevenue[];
  const topSellers = (stats.topSellers ?? []) as TopSeller[];
  const recentOrders = (stats.recentOrders ?? []) as RecentOrder[];
  const maxRev = Math.max(1, ...dailyRevenue.map(d => d.revenue));

  // Actions
  const decideDeposit = async (dep: Deposit, approve: boolean) => {
    try {
      await adminSetDepositStatus(dep.id, approve ? "approved" : "rejected",
        approve ? "Approved by admin" : "Rejected by admin");
      toast.success(approve ? "Deposit approved & credited" : "Deposit rejected");
      load();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const decidePayout = async (_p: Payout, _paid: boolean) => {
    toast.error("Payouts are not enabled on this backend yet");
  };

  const submitBalance = async (sign: 1 | -1) => {
    if (!balanceUser) return;
    const amount = Number(balanceAmount);
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Enter a valid amount");
    setBalanceBusy(true);
    try {
      await adminAdjustBalance(balanceUser.id, sign * amount, balanceNote.trim() || (sign > 0 ? "Manual credit by admin" : "Manual debit by admin"));
      toast.success(`${sign > 0 ? "Added" : "Removed"} $${amount.toFixed(2)} ${sign > 0 ? "to" : "from"} ${balanceUser.username}`);
      setBalanceUser(null); setBalanceAmount(""); setBalanceNote("");
      load();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBalanceBusy(false); }
  };

  const toggleBan = async (u: Profile) => {
    if (!confirm(`${u.banned ? "Unban" : "Ban"} ${u.username}?`)) return;
    try {
      await adminSetBlocked(u.id, !u.banned);
      toast.success(u.banned ? "User unbanned" : "User banned"); load();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const revokeSeller = async (u: Profile) => {
    try {
      await adminSetRole(u.id, "seller", false);
      toast.success("Seller revoked"); load();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const makeSeller = async (u: Profile) => {
    try {
      await adminSetRole(u.id, "seller", true);
      toast.success("Promoted to seller"); load();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const impersonate = async (u: Profile) => {
    toast.error(`Login-as is not available on this backend (${u.username})`);
  };

  // Card upload
  const publishCards = async () => {
    if (!cardRaw.trim()) return toast.error("Paste cards first");
    setUploadBusy(true);
    try {
      const { lines, failed } = parseAndFormat(cardRaw);
      const { unique, dropped } = dedupe(lines);
      if (unique.length === 0) { toast.error("No valid cards parsed"); setUploadBusy(false); return; }

      const price = Number(cardPrice) || 1.5;
      const rows = unique.map((p) => {
        const binInfo = detectOfflineBin(p.cc);
        const brand = detectBrand(p.cc) || binInfo.brand;
        const country = p.country !== "null" && p.country ? p.country.toUpperCase() : binInfo.country;
        const isRefundable =
          cardRefundable === "yes"
            ? true
            : cardRefundable === "no"
            ? false
            : binInfo.refundable;

        return {
          cc: p.cc,
          month: p.month,
          year: p.year,
          cvv: p.cvv,
          name: p.name,
          addr: p.addr,
          city: p.city,
          state: p.state,
          zip: p.zip,
          country,
          tel: p.tel,
          email: p.email,
          brand,
          bin: p.cc.slice(0, 6),
          base: `ADMIN_${new Date().toISOString().slice(0, 10).replace(/-/g, "_")}_${brand}`,
          price,
          refundable: isRefundable,
          card_type: binInfo.type,
          card_level: binInfo.level,
          bank: binInfo.bank,
        };
      });

      const count = await adminPublishFullCards(rows, (done, total) => setUploadProgress({ done, total }));
      
      // Auto-post site announcement
      const baseLabel = rows[0]?.base?.replace(/^\s*admin[\s_\-.:]+/i, "") || "NEW_BASE";
      await adminCreateAnnouncement({
        title: `Base Update: ${baseLabel}`,
        body: `Fresh batch of verified cards added for base ${baseLabel}. Available now in shop.`,
        kind: "update",
      }).catch(() => {});

      // Telegram Channel Broadcast
      if (tgBroadcastCardUpload && rows.length > 0) {
        try {
          const sample = rows[0];
          const countries = [...new Set(rows.map(r => r.country))].slice(0, 4).join(", ");
          await broadcastChannelAlert({
            data: {
              baseName: sample.base,
              count,
              brand: sample.brand,
              country: countries || "MIX",
              price,
            },
          });
          toast.info("Sent restock alert to Telegram channel @zorushop!");
        } catch {
          /* ignore */
        }
      }

      toast.success(`Published ${count} cards` + (dropped > 0 ? ` (${dropped} dupes removed)` : "") + (failed.length > 0 ? ` · ${failed.length} unparseable` : ""));
      setCardRaw(""); load();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Publish failed"); }
    setUploadProgress(null);
    setUploadBusy(false);
  };


  // Broadcast
  const postNews = async () => {
    if (!annTitle || !annBody) return toast.error("Title and body required");
    try {
      await adminCreateAnnouncement({ title: annTitle, body: annBody, kind: annType });
      toast.success("News published"); setAnnTitle(""); setAnnBody(""); load();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const deleteNews = async (id: string) => {
    try { await adminDeleteAnnouncement(id); toast.success("Deleted"); load(); } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const pendingDeposits = deposits.filter(d => d.status === "pending");
  const pendingPayouts = payouts.filter(p => p.status === "pending");
  const sellers = users.filter(u => u.is_seller || u.role === "seller");

  return (
    <AdminLayout title="Control Center">
      <div className="space-y-6">
        {/* Tab Navigation */}
        <div className="flex gap-2 flex-wrap">
          {([
            { key: "overview", label: "Overview", icon: BarChart3 },
            { key: "users", label: "Users & Sellers", icon: Users },
            { key: "cards", label: "Card Upload", icon: CreditCard },
            { key: "broadcast", label: "Broadcast", icon: Megaphone },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                tab === t.key
                  ? "bg-gradient-to-r from-primary/20 to-primary/5 text-primary-glow border border-primary/40 shadow-gold"
                  : "bg-secondary/40 border border-border/40 text-muted-foreground hover:text-foreground hover:bg-secondary/60"
              }`}>
              <t.icon className="h-4 w-4" />{t.label}
            </button>
          ))}
        </div>

        {/* ═══ OVERVIEW TAB ═══ */}
        {tab === "overview" && (
          <>
            {/* Main Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard icon={DollarSign} label="Total Revenue" value={`$${Number(stats.totalRevenue ?? 0).toFixed(2)}`} accent="gold" />
              <StatCard icon={TrendingUp} label="Today" value={`$${Number(stats.todayRevenue ?? 0).toFixed(2)}`} accent="success" />
              <StatCard icon={Activity} label="7-Day Revenue" value={`$${Number(stats.weekRevenue ?? 0).toFixed(2)}`} accent="primary" />
              <StatCard icon={Users} label="Total Users" value={String(stats.totalUsers ?? 0)} accent="primary" />
              <StatCard icon={UserCheck} label="Sellers" value={String(stats.totalSellers ?? 0)} accent="primary" />
              <StatCard icon={Package} label="Cards Stock" value={String(stats.cardsAvailable ?? 0)} accent="primary" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard icon={ShoppingCart} label="Cards Sold (Today)" value={`${stats.todaySalesCount ?? 0} • $${Number(stats.todaySalesAmount ?? 0).toFixed(2)}`} accent="success" />
              <StatCard icon={Wallet} label="Today's Deposits" value={`$${Number(stats.todayDeposits ?? 0).toFixed(2)}`} accent="success" />
              <StatCard icon={CreditCard} label="Pending Payouts" value={String(stats.pendingPayouts ?? 0)} accent={Number(stats.pendingPayouts) > 0 ? "warning" : "primary"} />
              <StatCard icon={FileText} label="Open Tickets" value={String(stats.openTickets ?? 0)} accent={Number(stats.openTickets) > 0 ? "warning" : "primary"} />
            </div>

            {/* VPS State Verification */}
            <Section icon={Activity} title="VPS STATE · LIVE DB SNAPSHOT">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono text-muted-foreground">
                  {vpsState ? `Snapshot: ${new Date(vpsState.timestamp).toLocaleString()}` : "Loading..."}
                </span>
                <Button size="sm" variant="outline" onClick={refreshVpsState} disabled={vpsBusy}>
                  {vpsBusy ? "Refreshing..." : "Refresh"}
                </Button>
              </div>
              {vpsState && (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-border/40 bg-card/40 p-4">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Users</div>
                    <div className="text-2xl font-bold">{vpsState.users.total}</div>
                    <div className="text-xs font-mono text-muted-foreground mt-1">
                      {vpsState.users.admins} admin · {vpsState.users.sellers} seller · {vpsState.users.buyers} buyer
                      {vpsState.users.banned > 0 && ` · ${vpsState.users.banned} banned`}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/40 bg-card/40 p-4">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Cards</div>
                    <div className="text-2xl font-bold">{vpsState.cards.total}</div>
                    <div className="text-xs font-mono text-muted-foreground mt-1">
                      {vpsState.cards.available} available · {vpsState.cards.sold} sold · {vpsState.cards.reserved} reserved
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/40 bg-card/40 p-4">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Wallet Balances</div>
                    <div className="text-2xl font-bold">${vpsState.wallets.total_balance.toFixed(2)}</div>
                    <div className="text-xs font-mono text-muted-foreground mt-1">
                      {vpsState.wallets.count} wallets · max ${vpsState.wallets.max_balance.toFixed(2)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/40 bg-card/40 p-4">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Orders</div>
                    <div className="text-2xl font-bold">{vpsState.orders.total}</div>
                    <div className="text-xs font-mono text-muted-foreground mt-1">
                      ${vpsState.orders.revenue.toFixed(2)} revenue · {vpsState.pending_seller_applications} pending apps
                    </div>
                  </div>
                </div>
              )}
              {vpsState && vpsState.sellers_breakdown.length > 0 && (
                <div className="mt-4">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Sellers ({vpsState.sellers_breakdown.length})</div>
                  <div className="rounded-lg border border-border/40 divide-y divide-border/40">
                    {vpsState.sellers_breakdown.map(s => (
                      <div key={s.id} className="flex justify-between items-center px-3 py-2 text-sm font-mono">
                        <span>{s.username}</span>
                        <span className="text-primary-glow">${Number(s.balance).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Section>


            <Section icon={BarChart3} title="REVENUE · LAST 30 DAYS">
              {dailyRevenue.length > 0 ? (
                <div className="flex items-end gap-1 h-48">
                  {dailyRevenue.map(d => (
                    <div key={d.day} className="flex-1 flex flex-col items-center gap-1 group">
                      <span className="text-[9px] font-mono text-primary-glow opacity-0 group-hover:opacity-100 transition">${Number(d.revenue).toFixed(0)}</span>
                      <div className="w-full rounded-t bg-gradient-to-t from-primary/40 to-primary-glow/80 transition-all hover:from-primary/60 hover:to-primary-glow"
                        style={{ height: `${Math.max(4, (d.revenue / maxRev) * 100)}%` }}
                        title={`${d.day}: $${Number(d.revenue).toFixed(2)} (${d.orders} orders)`} />
                      <span className="text-[8px] text-muted-foreground font-mono hidden lg:block">{d.day.slice(5)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">No sales data yet.</p>
              )}
            </Section>

            {/* Customer BIN Demand Section */}
            <Section icon={Flame} title="CUSTOMER DEMAND · MOST SEARCHED BINS">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <p className="text-xs text-muted-foreground">
                  Real-time analytics of which BINs public users are searching for most in your store.
                </p>
                <Link
                  to="/admin/bins"
                  className="text-xs text-primary-glow hover:underline font-semibold flex items-center gap-1"
                >
                  Open Full BIN Demand Analytics →
                </Link>
              </div>

              {topDemandedBins.length === 0 ? (
                <div className="py-6 text-center text-muted-foreground text-sm">
                  <Flame className="h-6 w-6 mx-auto mb-1 text-muted-foreground/40" />
                  No customer BIN searches recorded yet.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {topDemandedBins.map((b) => (
                    <div
                      key={b.bin}
                      className={`rounded-xl border p-3.5 flex flex-col justify-between transition-all ${
                        b.in_stock === 0
                          ? "border-amber-500/30 bg-amber-500/[0.04]"
                          : "border-border/40 bg-card/40"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-mono text-base font-extrabold text-foreground tracking-wider">
                            {b.bin}
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full">
                            <Flame className="h-3 w-3 fill-amber-400" />
                            {b.search_count} {b.search_count === 1 ? "search" : "searches"}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <span className="font-semibold text-foreground">{b.brand || "CARD"}</span>
                          <span>·</span>
                          <span>{b.card_type || "CREDIT"}</span>
                          {b.country && (
                            <>
                              <span>·</span>
                              <span>{flagEmoji(b.country)} {b.country}</span>
                            </>
                          )}
                        </div>
                        {b.bank && (
                          <div className="text-[11px] text-muted-foreground truncate mt-1" title={b.bank}>
                            {b.bank}
                          </div>
                        )}
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-border/40 flex items-center justify-between">
                        {b.in_stock === 0 ? (
                          <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3 shrink-0" /> 0 in stock (HIGH NEED)
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                            <Check className="h-3 w-3 shrink-0" /> {b.in_stock} in stock
                          </span>
                        )}
                        <button
                          onClick={() => setTab("cards")}
                          className="text-xs text-primary-glow hover:underline font-semibold"
                        >
                          Upload +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Pending Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Section icon={Wallet} title={`PENDING DEPOSITS (${pendingDeposits.length})`}>
                {pendingDeposits.length === 0 && <p className="text-sm text-muted-foreground">No pending deposits.</p>}
                <div className="space-y-2 max-h-[320px] overflow-y-auto">
                  {pendingDeposits.map(d => {
                    const u = users.find(x => x.id === d.user_id);
                    return (
                      <div key={d.id} className="flex items-center justify-between gap-2 p-3 rounded-lg bg-secondary/40 border border-border/40 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <p className="font-display text-sm">${Number(d.amount).toFixed(2)} · <span className="text-primary-glow">{d.method}</span>
                            <span className="text-xs text-muted-foreground"> · {u?.username ?? "?"}</span></p>
                          <p className="text-[10px] font-mono text-muted-foreground truncate">{d.proof_url}</p>
                        </div>
                        <div className="flex gap-1.5">
                          <Button size="sm" onClick={() => decideDeposit(d, true)} className="bg-success/90 text-primary-foreground h-8"><Check className="h-3 w-3 mr-1" />Approve</Button>
                          <Button size="sm" variant="destructive" onClick={() => decideDeposit(d, false)} className="h-8"><X className="h-3 w-3" /></Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>

              <Section icon={CreditCard} title={`PAYOUT REQUESTS (${pendingPayouts.length})`}>
                {pendingPayouts.length === 0 && <p className="text-sm text-muted-foreground">No pending payouts.</p>}
                <div className="space-y-2 max-h-[320px] overflow-y-auto">
                  {pendingPayouts.map(p => {
                    const u = users.find(x => x.id === p.seller_id);
                    return (
                      <div key={p.id} className="flex items-center justify-between gap-2 p-3 rounded-lg bg-secondary/40 border border-border/40 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <p className="font-display text-sm">${Number(p.amount).toFixed(2)} · <span className="text-primary-glow">{p.method}</span>
                            <span className="text-xs text-muted-foreground"> · {u?.username ?? "?"}</span></p>
                          <p className="text-[10px] font-mono text-muted-foreground truncate">{p.destination}</p>
                        </div>
                        <div className="flex gap-1.5">
                          <Button size="sm" onClick={() => decidePayout(p, true)} className="bg-success/90 text-primary-foreground h-8"><Check className="h-3 w-3 mr-1" />Paid</Button>
                          <Button size="sm" variant="destructive" onClick={() => decidePayout(p, false)} className="h-8"><X className="h-3 w-3" /></Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            </div>

            {/* Recent Orders & Top Sellers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Section icon={ShoppingCart} title="RECENT ORDERS">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      <tr><th className="p-2 text-left">Buyer</th><th className="p-2 text-right">Total</th><th className="p-2">Status</th><th className="p-2 text-right">Date</th></tr>
                    </thead>
                    <tbody>
                      {recentOrders.map(o => (
                        <tr key={o.id} className="border-t border-border/40">
                          <td className="p-2 text-foreground">{o.buyer}</td>
                          <td className="p-2 text-right font-display text-primary-glow">${Number(o.total).toFixed(2)}</td>
                          <td className="p-2 text-center">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                              o.status === "completed" ? "bg-success/20 text-success border-success/40" : "bg-warning/20 text-warning border-warning/40"
                            }`}>{o.status}</span>
                          </td>
                          <td className="p-2 text-right text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                      {recentOrders.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground text-xs">No orders yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </Section>

              <Section icon={TrendingUp} title="TOP SELLERS">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      <tr><th className="p-2 text-left">Seller</th><th className="p-2 text-right">Sold</th><th className="p-2 text-right">Revenue</th></tr>
                    </thead>
                    <tbody>
                      {topSellers.map((s, i) => (
                        <tr key={s.id} className="border-t border-border/40">
                          <td className="p-2">
                            <span className={`inline-flex items-center gap-2 ${i < 3 ? "text-gold" : "text-foreground"}`}>
                              <span className="text-[10px] text-muted-foreground w-4">{i + 1}.</span>
                              {s.username}
                            </span>
                          </td>
                          <td className="p-2 text-right font-mono">{s.cards_sold}</td>
                          <td className="p-2 text-right font-display text-primary-glow">${Number(s.total_sold).toFixed(2)}</td>
                        </tr>
                      ))}
                      {topSellers.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-muted-foreground text-xs">No sellers yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </Section>
            </div>

            {/* Financial Summary */}
            <Section icon={DollarSign} title="FINANCIAL SUMMARY">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Mini label="Total Deposits (Approved)" value={`$${Number(stats.totalDeposits ?? 0).toFixed(2)}`} highlight />
                <Mini label="Total Payouts (Paid)" value={`$${Number(stats.totalPayoutsPaid ?? 0).toFixed(2)}`} />
                <Mini label="30-Day Revenue" value={`$${Number(stats.monthRevenue ?? 0).toFixed(2)}`} highlight />
                <Mini label="Pending Applications" value={String(stats.pendingApps ?? 0)} />
              </div>
            </Section>
          </>
        )}

        {/* ═══ USERS TAB ═══ */}
        {tab === "users" && (
          <>
            <Section icon={Users} title={`ALL USERS (${users.length})`}>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="Search username or email…" className="bg-input/60 pl-9" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="text-[10px] uppercase tracking-wider text-muted-foreground bg-secondary/40">
                    <tr>
                      <th className="p-2.5 text-left">Username</th>
                      <th className="p-2.5 text-left">Email</th>
                      <th className="p-2.5 text-right">Balance</th>
                      <th className="p-2.5 text-center">Role</th>
                      <th className="p-2.5 text-center">Status</th>
                      <th className="p-2.5 text-center">Joined</th>
                      <th className="p-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedUsers.map(u => (
                      <tr key={u.id} className={`border-t border-border/40 hover:bg-secondary/20 ${u.banned ? "opacity-50" : ""}`}>
                        <td className="p-2.5 font-medium">{u.username}</td>
                        <td className="p-2.5 text-xs text-muted-foreground">{u.email ?? "—"}</td>
                        <td className="p-2.5 text-right font-display text-primary-glow">${Number(u.balance ?? 0).toFixed(2)}</td>
                        <td className="p-2.5 text-center">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                            u.role === "admin" ? "bg-primary/20 text-primary-glow border-primary/40" :
                            u.role === "seller" || u.is_seller ? "bg-gold/20 text-gold border-gold/40" :
                            "bg-secondary text-muted-foreground border-border"
                          }`}>{u.role || (u.is_seller ? "seller" : "buyer")}</span>
                        </td>
                        <td className="p-2.5 text-center">
                          {u.banned
                            ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/20 text-destructive border border-destructive/40">Banned</span>
                            : <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/20 text-success border border-success/40">Active</span>}
                        </td>
                        <td className="p-2.5 text-center text-xs text-muted-foreground">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                        </td>
                        <td className="p-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="outline" onClick={() => { setBalanceUser(u); setBalanceAmount(""); setBalanceNote(""); }} title="Add / remove balance" className="h-7 w-7 p-0">
                              <DollarSign className="h-3 w-3" />
                            </Button>
                            {(u.role !== "seller" && !u.is_seller) && (
                              <Button size="sm" variant="outline" onClick={() => makeSeller(u)} title="Promote to seller" className="h-7 w-7 p-0">
                                <UserPlus className="h-3 w-3" />
                              </Button>
                            )}
                            {(u.role === "seller" || u.is_seller) && (
                              <Button size="sm" variant="outline" onClick={() => revokeSeller(u)} title="Revoke seller" className="h-7 w-7 p-0">
                                <UserCheck className="h-3 w-3" />
                              </Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => impersonate(u)} title="Login as user" className="h-7 w-7 p-0 text-primary-glow">
                              <LogIn className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant={u.banned ? "outline" : "destructive"} onClick={() => toggleBan(u)} title={u.banned ? "Unban" : "Ban"} className="h-7 w-7 p-0">
                              <Ban className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {users.length > USERS_PER_PAGE && (
                <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-xs text-muted-foreground">
                    Showing {(userPage - 1) * USERS_PER_PAGE + 1}–{Math.min(userPage * USERS_PER_PAGE, users.length)} of {users.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" className="h-7 px-2" disabled={userPage === 1} onClick={() => setUserPage(p => Math.max(1, p - 1))}>‹</Button>
                    <span className="text-xs text-muted-foreground px-2">{userPage} / {userTotalPages}</span>
                    <Button size="sm" variant="outline" className="h-7 px-2" disabled={userPage === userTotalPages} onClick={() => setUserPage(p => Math.min(userTotalPages, p + 1))}>›</Button>
                  </div>
                </div>
              )}
            </Section>

            {/* Seller Summary */}
            <Section icon={TrendingUp} title={`SELLERS (${sellers.length})`}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {sellers.map(s => (
                  <div key={s.id} className="p-4 rounded-xl bg-secondary/30 border border-border/40 hover:border-primary/40 transition">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-display text-sm text-foreground">{s.username}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                        s.banned ? "bg-destructive/20 text-destructive" : "bg-success/20 text-success"
                      }`}>{s.banned ? "Banned" : "Active"}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Balance: <span className="text-primary-glow font-display">${Number(s.balance ?? 0).toFixed(2)}</span></p>
                    <div className="flex gap-1 mt-2">
                      <Button size="sm" variant="outline" onClick={() => impersonate(s)} className="h-7 text-[10px]"><LogIn className="h-3 w-3 mr-1" />Login as</Button>
                      <Button size="sm" variant="outline" onClick={() => { setBalanceUser(s); setBalanceAmount(""); setBalanceNote(""); }} className="h-7 text-[10px]"><DollarSign className="h-3 w-3 mr-1" />Balance</Button>
                    </div>
                  </div>
                ))}
                {sellers.length === 0 && <p className="text-sm text-muted-foreground col-span-full text-center py-6">No sellers yet.</p>}
              </div>
            </Section>
          </>
        )}

        {/* ═══ CARD UPLOAD TAB ═══ */}
        {tab === "cards" && (
          <>
            {/* Backdate / Auto-Drip Quick Access Banner */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-cyan-500/10 border border-emerald-500/30 flex items-center justify-between flex-wrap gap-3 shadow-lg">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-emerald-300">
                    Looking to Back-Date Cards or Automate Daily Drip Releases?
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Upload cards across past dates (e.g. 20 pcs/day for 6 months) or enqueue bulk cards for automatic daily dispatch to shop & Telegram.
                  </p>
                </div>
              </div>
              <Button
                onClick={() => setShowBackdateModal(true)}
                className="bg-gradient-to-r from-emerald-500 to-teal-500 text-black font-semibold hover:opacity-95 text-xs shadow-md"
              >
                <Calendar className="h-3.5 w-3.5 mr-1 text-black" />
                ⏳ Open Back-Date & Auto-Drip Engine
              </Button>
            </div>

            <Section icon={Upload} title="ADMIN CARD UPLOAD">
              <p className="text-xs text-muted-foreground mb-4">
                Paste cards in any format — fields, brand and dupes are detected automatically.
                Target: <code className="text-primary-glow">cc|month|year|cvv|name|addr|city|state|zip|country|tel|email</code>
              </p>

              {/* SETTINGS + DROPZONE */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Default Price ($)</label>
                    <Input type="number" step="0.01" value={cardPrice} onChange={e => setCardPrice(e.target.value)} className="bg-input/60 mt-1" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Refund Policy</label>
                    <Select value={cardRefundable} onValueChange={(v: "yes" | "no" | "mixed") => setCardRefundable(v)}>
                      <SelectTrigger className="bg-input/60 mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mixed">🔀 Mixed (Auto: High BIN Yes, Low No)</SelectItem>
                        <SelectItem value="yes">✅ All Refundable (Yes)</SelectItem>
                        <SelectItem value="no">❌ Non-refundable (No)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/40 border border-border/40">
                    <div className="text-[11px] font-medium flex items-center gap-1.5">
                      <Send className="h-3 w-3 text-cyan-400" />
                      Alert @zorushop Channel
                    </div>
                    <input
                      type="checkbox"
                      checked={tgBroadcastCardUpload}
                      onChange={e => setTgBroadcastCardUpload(e.target.checked)}
                      className="accent-primary"
                    />
                  </div>
                </div>

                <label
                  className="lg:col-span-2 cursor-pointer"
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => {
                    e.preventDefault(); setDragOver(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) f.text().then(t => { setCardRaw(prev => (prev.trim() ? prev.replace(/\s*$/, "\n") + t : t)); toast.success(`Loaded ${f.name}`); });
                  }}
                >
                  <input type="file" accept=".txt,.csv,.tsv" className="hidden" onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) file.text().then(t => { setCardRaw(prev => (prev.trim() ? prev.replace(/\s*$/, "\n") + t : t)); toast.success(`Loaded ${file.name}`); });
                  }} />
                  <div className={`h-full min-h-[132px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 text-center px-6 transition ${
                    dragOver ? "border-primary bg-primary/10" : "border-primary/30 hover:border-primary/60 hover:bg-primary/5"
                  }`}>
                    <div className="h-10 w-10 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
                      <FileText className="h-4 w-4 text-primary-glow" />
                    </div>
                    <p className="text-sm text-primary-glow">Drop <b>.txt / .csv / .tsv</b> here or click to browse</p>
                    <p className="text-[11px] text-muted-foreground">Any delimiter · any column order · appends to the editor</p>
                  </div>
                </label>
              </div>

              {/* LIVE STATS */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                <Chip label="Lines" value={formatPreview.totalLines} tone="muted" />
                <Chip label="Valid" value={formatPreview.valid} tone="success" />
                <Chip label="Duplicates" value={formatPreview.dupes} tone="warning" />
                <Chip label="Unreadable" value={formatPreview.failedCount} tone="danger" />
              </div>

              {formatPreview.brands.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {formatPreview.brands.map(([b, n]) => (
                    <span key={b} className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-secondary/40 px-2.5 py-1 text-[11px] text-muted-foreground">
                      <BrandLogo brand={b} className="h-4 w-6" /> {b} · <b className="text-foreground">{n}</b>
                    </span>
                  ))}
                </div>
              )}

              <Textarea rows={10} value={cardRaw} onChange={e => setCardRaw(e.target.value)}
                placeholder="4111111111111111|12|28|123|John Smith|123 Main St|New York|NY|10001|US|+15555551234|john@x.com"
                className="bg-input/60 font-mono text-xs mb-3" />

              <div className="flex items-center gap-2 flex-wrap">
                <Button onClick={publishCards} disabled={uploadBusy || formatPreview.valid === 0} className="bg-gradient-primary shadow-neon">
                  <Upload className="h-4 w-4 mr-2" />{uploadBusy ? (uploadProgress ? `Publishing ${uploadProgress.done}/${uploadProgress.total}…` : "Publishing…") : `Publish ${formatPreview.valid || ""} Cards`.trim()}
                </Button>
                <Button onClick={() => {
                  const { lines, failed } = parseAndFormat(cardRaw);
                  const { unique, dropped } = dedupe(lines);
                  if (!unique.length) return toast.error("No valid cards detected");
                  setCardRaw([...unique.map(toPipeFormat), ...failed].join("\n"));
                  toast.success(`Formatted ${unique.length} cards` + (dropped ? ` · ${dropped} dupes removed` : "") + (failed.length ? ` · ${failed.length} unreadable kept below` : ""));
                }} variant="outline" className="border-primary/40 text-primary-glow">
                  <Wand2 className="h-4 w-4 mr-2" />Auto-Format & Dedupe
                </Button>
                <Button onClick={() => {
                  const { lines } = parseAndFormat(cardRaw);
                  const { unique } = dedupe(lines);
                  if (!unique.length) return toast.error("Nothing to copy");
                  void navigator.clipboard.writeText(unique.map(toPipeFormat).join("\n"));
                  toast.success("Formatted list copied");
                }} variant="outline" className="border-primary/40 text-primary-glow">
                  <FileText className="h-4 w-4 mr-2" />Copy formatted
                </Button>
                <Button onClick={() => setCardRaw("")} variant="outline" className="ml-auto text-muted-foreground">
                  <Trash2 className="h-4 w-4 mr-2" />Clear
                </Button>
              </div>

              {formatPreview.cards.length > 0 && (
                <div className="mt-4 rounded-xl border border-border/40 bg-secondary/20 overflow-hidden">
                  <div className="px-3 py-2 border-b border-border/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Preview · first {Math.min(6, formatPreview.cards.length)} of {formatPreview.valid}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-xs">
                      <thead className="text-[10px] uppercase tracking-wider text-muted-foreground bg-secondary/40">
                        <tr>
                          {["Brand", "BIN", "EXP", "CVV", "Name", "City", "State", "ZIP", "Country"].map(h => (
                            <th key={h} className="p-2 text-left font-normal">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {formatPreview.cards.slice(0, 6).map((c, i) => (
                          <tr key={`${c.cc}-${i}`} className="border-t border-border/30">
                            <td className="p-2"><BrandLogo brand={detectBrand(c.cc) || detectBrandFromBin(c.cc.slice(0, 6))} className="h-5 w-8" /></td>
                            <td className="p-2 font-mono text-primary-glow">{c.cc.slice(0, 6)}••••{c.cc.slice(-4)}</td>
                            <td className="p-2 font-mono">{c.month}/{c.year}</td>
                            <td className="p-2 font-mono">{c.cvv}</td>
                            <td className="p-2">{c.name}</td>
                            <td className="p-2">{c.city}</td>
                            <td className="p-2">{c.state}</td>
                            <td className="p-2 font-mono">{c.zip}</td>
                            <td className="p-2">{c.country}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}


            </Section>
          </>
        )}

        {/* ═══ BROADCAST TAB ═══ */}
        {tab === "broadcast" && (
          <>
            <Section icon={Newspaper} title="PUBLISH NEWS / BROADCAST">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
                <div className="md:col-span-2">
                  <Input value={annTitle} onChange={e => setAnnTitle(e.target.value)} placeholder="Title" className="bg-input/60" />
                </div>
                <Select value={annType} onValueChange={setAnnType}>
                  <SelectTrigger className="bg-input/60"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="update">Update</SelectItem>
                    <SelectItem value="alert">Alert</SelectItem>
                    <SelectItem value="promo">Promotion</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={postNews} className="bg-gradient-primary shadow-neon"><Send className="h-4 w-4 mr-2" />Publish</Button>
              </div>
              <Textarea value={annBody} onChange={e => setAnnBody(e.target.value)} placeholder="Write your broadcast message…" rows={4} className="bg-input/60" />
            </Section>

            <Section icon={Megaphone} title={`NEWS HISTORY (${news.length})`}>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {news.map(n => (
                  <div key={n.id} className="p-4 rounded-lg bg-secondary/40 border border-border/40">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                            n.type === "alert" ? "bg-destructive/20 text-destructive border-destructive/40" :
                            n.type === "promo" ? "bg-gold/20 text-gold border-gold/40" :
                            n.type === "maintenance" ? "bg-warning/20 text-warning border-warning/40" :
                            "bg-primary/20 text-primary-glow border-primary/40"
                          }`}>{n.type}</span>
                          <span className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString()}</span>
                        </div>
                        <h3 className="font-display text-sm text-foreground">{n.title}</h3>
                        <p className="text-xs text-muted-foreground mt-1">{n.body}</p>
                      </div>
                      <button onClick={() => deleteNews(n.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {news.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No broadcasts yet.</p>}
              </div>
            </Section>
          </>
        )}
      </div>

      {/* Manual balance modal */}
      {balanceUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !balanceBusy && setBalanceUser(null)}>
          <div className="w-full max-w-sm rounded-lg border border-border bg-card p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="h-4 w-4 text-primary-glow" />
              <h3 className="font-semibold">Manual balance</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              {balanceUser.username} · current ${Number(balanceUser.balance ?? 0).toFixed(2)}
            </p>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Amount (USD)</label>
            <Input
              autoFocus type="number" min="0" step="0.01" value={balanceAmount}
              onChange={e => setBalanceAmount(e.target.value)} placeholder="10.00" className="bg-input/60 mt-1 mb-3"
            />
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Note (optional)</label>
            <Input value={balanceNote} onChange={e => setBalanceNote(e.target.value)} placeholder="Reason…" className="bg-input/60 mt-1 mb-4" />
            <div className="flex gap-2">
              <Button className="flex-1" disabled={balanceBusy} onClick={() => submitBalance(1)}>
                <ArrowUpRight className="h-3.5 w-3.5 mr-1" /> Add
              </Button>
              <Button className="flex-1" variant="destructive" disabled={balanceBusy} onClick={() => submitBalance(-1)}>
                <ArrowDownRight className="h-3.5 w-3.5 mr-1" /> Remove
              </Button>
            </div>
            <Button variant="ghost" className="w-full mt-2 h-8 text-xs" disabled={balanceBusy} onClick={() => setBalanceUser(null)}>Cancel</Button>
          </div>
        </div>
      )}

      <BackdateCardUploadDialog
        open={showBackdateModal}
        onOpenChange={setShowBackdateModal}
        categories={categories}
        onUploadSuccess={load}
      />
    </AdminLayout>

  );
};

const Section = ({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) => (
  <section className="glass rounded-2xl p-6">
    <div className="flex items-center gap-2 mb-4"><Icon className="h-4 w-4 text-primary-glow" /><h2 className="font-display tracking-wider text-primary-glow text-sm">{title}</h2></div>
    {children}
  </section>
);

const StatCard = ({ icon: Icon, label, value, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; accent: "gold" | "primary" | "success" | "warning" }) => {
  const color = accent === "gold" ? "text-gold" : accent === "success" ? "text-success" : accent === "warning" ? "text-warning" : "text-primary-glow";
  return (
    <div className="glass rounded-xl p-3.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground leading-tight">{label}</span>
        <Icon className={`h-3.5 w-3.5 ${color}`} />
      </div>
      <p className={`font-display text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
};

const Chip = ({ label, value, tone }: { label: string; value: number; tone: "muted" | "success" | "warning" | "danger" }) => {
  const color = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "danger" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-lg border border-border/40 bg-secondary/30 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`font-display text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
};

const Mini = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => (
  <div className={`p-3 rounded-lg border ${highlight ? "bg-primary/10 border-primary/40" : "bg-secondary/30 border-border/40"}`}>
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className={`font-display text-lg font-bold mt-1 ${highlight ? "neon-text" : "text-foreground"}`}>{value}</p>
  </div>
);

export default Admin;
