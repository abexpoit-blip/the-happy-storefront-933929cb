import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { listAnnouncements } from "@/lib/store";
import { Newspaper, Calendar, AlertTriangle, Sparkles, Wrench, Bell, ChevronRight } from "lucide-react";
import Seo from "@/components/Seo";

interface NewsItem {
  id: string;
  title: string;
  body: string;
  type?: string;
  created_at: string;
}

const typeConfig: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; gradient: string; border: string; badge: string; glow: string }> = {
  update: {
    label: "Update",
    icon: Bell,
    gradient: "from-primary/20 via-primary/10 to-transparent",
    border: "border-primary/30",
    badge: "bg-primary/20 text-primary-glow border-primary/40",
    glow: "shadow-gold",
  },
  alert: {
    label: "Alert",
    icon: AlertTriangle,
    gradient: "from-destructive/15 via-destructive/5 to-transparent",
    border: "border-destructive/30",
    badge: "bg-destructive/10 text-destructive border-destructive/30",
    glow: "shadow-[0_0_20px_-6px_hsl(var(--destructive)/0.22)]",
  },
  promo: {
    label: "Promotion",
    icon: Sparkles,
    gradient: "from-gold/15 via-gold/5 to-transparent",
    border: "border-gold/30",
    badge: "bg-gold/10 text-gold border-gold/30",
    glow: "shadow-gold",
  },
  maintenance: {
    label: "Maintenance",
    icon: Wrench,
    gradient: "from-accent/15 via-accent/5 to-transparent",
    border: "border-accent/30",
    badge: "bg-accent/10 text-accent border-accent/30",
    glow: "shadow-[0_0_20px_-6px_hsl(var(--accent)/0.2)]",
  },
};

const News = () => {
  const [updates, setUpdates] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listAnnouncements()
      .then((items) => {
        setUpdates(
          items.map((i) => ({
            id: i.id,
            title: i.title,
            body: i.body,
            type: i.kind || "update",
            created_at: i.created_at,
          }))
        );
      })
      .catch(() => setUpdates([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell>
      <Seo title="News & Updates | Zoru Shop" description="Latest marketplace updates, restock alerts and platform announcements from Zoru Shop." path="/news" />
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div className="relative">
          <div className="absolute -top-4 -left-4 w-24 h-24 bg-primary/10 rounded-full blur-3xl" />
          <div className="relative flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/30 flex items-center justify-center shadow-gold">
              <Newspaper className="h-6 w-6 text-primary-glow" />
            </div>
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-black tracking-wider neon-text">NEWS & ANNOUNCEMENTS</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Stay updated with the latest from Zoru Shop</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="glass rounded-2xl p-6 animate-pulse">
                <div className="h-4 w-20 bg-muted/30 rounded-full mb-3" />
                <div className="h-5 w-2/3 bg-muted/20 rounded mb-2" />
                <div className="h-3 w-1/4 bg-muted/10 rounded mb-4" />
                <div className="space-y-2">
                  <div className="h-3 w-full bg-muted/10 rounded" />
                  <div className="h-3 w-5/6 bg-muted/10 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : updates.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center border border-border/40">
            <div className="h-16 w-16 rounded-2xl bg-muted/10 border border-border/40 flex items-center justify-center mx-auto mb-4">
              <Newspaper className="h-8 w-8 text-muted-foreground/60" />
            </div>
            <p className="font-display text-lg text-muted-foreground mb-1">No announcements yet</p>
            <p className="text-sm text-muted-foreground/60">Check back later for updates and news.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {updates.map((n, idx) => {
              const cfg = typeConfig[n.type || "update"] || typeConfig.update;
              const Icon = cfg.icon;
              const isLatest = idx === 0;

              return (
                <article
                  key={n.id}
                  className={`relative glass rounded-2xl overflow-hidden border transition-all hover:scale-[1.005] ${cfg.border} ${cfg.glow}`}
                >
                  {/* Gradient accent bar */}
                  <div className={`absolute inset-0 bg-gradient-to-r ${cfg.gradient} pointer-events-none`} />

                  <div className="relative p-6">
                    {/* Top row: badge + date */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border backdrop-blur-sm ${cfg.badge}`}>
                          <Icon className="h-3 w-3" />
                          {cfg.label}
                        </span>
                        {isLatest && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-success/15 text-success border border-success/35 animate-pulse">
                            <span className="h-1.5 w-1.5 rounded-full bg-success" />
                            Latest
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {new Date(n.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                      </div>
                    </div>

                    {/* Title */}
                    <h2 className="font-display text-lg md:text-xl font-bold text-foreground tracking-wide leading-tight mb-3">
                      {n.title}
                    </h2>

                    {/* Body */}
                    <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap border-t border-border/30 pt-3">
                      {n.body}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
};

export default News;
