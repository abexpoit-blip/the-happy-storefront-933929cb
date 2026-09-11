import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { listMyOrders } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import {
  Wallet, ShoppingBag, User, ArrowRight, CreditCard,
  TrendingDown, Clock, CheckCircle, XCircle, Eye, PackageX
} from "lucide-react";
import { RoleBadge, countryFlag, BrandLogo } from "@/lib/brands";
import { UserAvatar } from "@/components/UserAvatar";

const Dashboard = () => {
  const { profile, user } = useAuth();
  const [balance, setBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setBalance(Number(profile?.balance ?? 0));
        const [oRes, dRes] = await Promise.allSettled([
          listMyOrders(),
          supabase.from("deposits").select("id, amount, status, created_at").order("created_at", { ascending: false }).limit(15),
        ]);
        if (oRes.status === "fulfilled" && oRes.value) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setOrders(oRes.value.map((ord: any) => ({
            id: ord.id,
            total: ord.total,
            status: ord.status,
            created_at: ord.created_at,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            items: (ord.order_items ?? []).map((i: any) => ({
              card_id: i.product_id,
              price: i.price,
              brand: i.title,
            })),
          })));
        }
        if (dRes.status === "fulfilled" && dRes.value.data) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setTransactions(dRes.value.data.map((dep: any) => ({
            id: dep.id,
            type: "deposit",
            amount: dep.amount,
            status: dep.status,
            created_at: dep.created_at,
          })));
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, [profile?.balance]);

  const statusIcon = (s: string) => {
    if (s === "paid" || s === "completed") return <CheckCircle className="h-4 w-4 text-success" />;
    if (s === "cancelled" || s === "failed") return <XCircle className="h-4 w-4 text-destructive" />;
    return <Clock className="h-4 w-4 text-gold" />;
  };

  const txTypeColor = (type: string) => {
    if (type === "deposit" || type === "refund") return "text-success";
    if (type === "purchase") return "text-destructive";
    return "text-gold";
  };

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="font-display text-3xl lg:text-4xl font-bold tracking-tight">
            Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Welcome back, <span className="text-primary-glow font-semibold">{profile?.username ?? user?.username}</span>
          </p>
        </div>

        {/* Profile + Wallet Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Profile Card */}
          <div className="glass rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 rounded-2xl flex items-center justify-center overflow-hidden">
                <UserAvatar username={profile?.username} avatarUrl={profile?.avatar_url} className="h-14 w-14 rounded-2xl object-cover" />
              </div>
              <div className="min-w-0">
                <p className="font-display font-bold text-lg truncate">{profile?.display_name || profile?.username}</p>
                <p className="text-xs text-muted-foreground font-mono">@{profile?.username}</p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Role</span>
                <RoleBadge role={profile?.role ?? "buyer"} />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email</span>
                <span className="font-mono text-xs text-foreground truncate ml-2">{user?.email}</span>
              </div>
            </div>
            <Link to="/settings" className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-secondary/50 border border-border/60 hover:border-primary/50 text-sm font-medium transition">
              Edit Profile <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* Wallet Balance */}
          <div className="glass-neon rounded-2xl p-6 relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-primary/20 blur-3xl" />
            <div className="relative space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center">
                  <Wallet className="h-5 w-5 text-primary-glow" />
                </div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Wallet Balance</p>
              </div>
              <p className="font-display text-4xl font-bold neon-text">
                ${balance.toFixed(2)}
              </p>
              <div className="flex gap-2">
                <Link to="/recharge" className="btn-luxe text-sm py-2 px-4">
                  Recharge
                </Link>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="glass rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-xl bg-gold/15 border border-gold/30 flex items-center justify-center">
                <ShoppingBag className="h-5 w-5 text-gold" />
              </div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Order Stats</p>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Total Orders</span>
                <span className="font-display text-2xl font-bold gold-text">{orders.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Total Spent</span>
                <span className="font-display text-lg font-bold text-foreground">
                  ${orders.reduce((s, o) => s + Number(o.total), 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Items Bought</span>
                <span className="font-display text-lg font-bold text-foreground">
                  {orders.reduce((s, o) => s + (o.items?.length ?? 0), 0)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center">
                <TrendingDown className="h-4 w-4 text-primary-glow" />
              </div>
              <h2 className="font-display text-lg font-bold tracking-tight">Recent Transactions</h2>
            </div>
          </div>
          {loading ? (
            <div className="text-center text-muted-foreground py-8">Loading...</div>
          ) : transactions.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">No transactions yet.</div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto scrollbar-thin pr-1">
              {transactions.slice(0, 20).map((tx) => (
                <div key={tx.id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-border/40">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`text-xs font-mono uppercase font-semibold ${txTypeColor(tx.type)}`}>
                      {tx.type}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <span className={`font-mono font-bold text-sm ${Number(tx.amount) >= 0 ? "text-success" : "text-destructive"}`}>
                    {Number(tx.amount) >= 0 ? "+" : ""}${Number(tx.amount).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Orders */}
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-gold/15 border border-gold/30 flex items-center justify-center">
                <CreditCard className="h-4 w-4 text-gold" />
              </div>
              <h2 className="font-display text-lg font-bold tracking-tight">My Orders</h2>
            </div>
            <Link to="/orders" className="text-xs text-primary-glow hover:underline flex items-center gap-1">
              View All <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {loading ? (
            <div className="text-center text-muted-foreground py-8">Loading...</div>
          ) : orders.length === 0 ? (
            <div className="text-center py-8">
              <ShoppingBag className="h-10 w-10 text-muted-foreground/60 mx-auto mb-3" />
              <p className="text-muted-foreground">No orders yet.</p>
              <Link to="/shop" className="btn-luxe mt-4 inline-flex text-sm py-2 px-5">
                Browse Shop <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto scrollbar-thin pr-1">
              {orders.slice(0, 15).map((order) => (
                <div key={order.id} className="rounded-xl border border-border/40 overflow-hidden">
                  <div
                    className="flex items-center justify-between p-4 bg-secondary/30 hover:bg-secondary/50 cursor-pointer transition"
                    onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {statusIcon(order.status)}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">Order #{order.id.slice(0, 8)}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(order.created_at).toLocaleDateString()} · {order.items?.length ?? 0} item(s)
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-display font-bold text-foreground">${Number(order.total).toFixed(2)}</span>
                      <Eye className={`h-4 w-4 transition ${expandedOrder === order.id ? "text-primary-glow" : "text-muted-foreground"}`} />
                    </div>
                  </div>
                  {expandedOrder === order.id && order.items && order.items.length > 0 && (
                    <div className="p-3 border-t border-border/30 bg-secondary/10 space-y-1.5">
                    {order.items.map((item: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg bg-secondary/30">
                          <div className="flex items-center gap-2 font-mono min-w-0">
                            {item.digital_product_id ? (
                              <>
                                <PackageX className="h-4 w-4 text-primary-glow" />
                                <span className="truncate">{item.product_title || "Digital Product"}</span>
                              </>
                            ) : (
                              <>
                                <BrandLogo brand={item.brand ?? "Card"} className="h-4" />
                                <span>{item.bin}****{item.last4}</span>
                                <span className="text-muted-foreground hidden sm:inline">{item.country ? `${countryFlag(item.country)} ${item.country}` : ""}</span>
                              </>
                            )}
                          </div>
                          <span className="font-medium shrink-0 ml-2">${Number(item.price).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
};

export default Dashboard;
