import { useEffect, useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import Seo from "@/components/Seo";
import { BuildBotBanner } from "@/components/BuildBotBanner";
import { listAnnouncements, type Announcement } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { publicBase, sortBasesLatestFirst } from "@/lib/baseLabel";
import { Send, ShieldCheck, MessageCircle, Bot } from "lucide-react";

/**
 * Buyer HOME — Zoru Shop:
 *   - News & Updates (left) + Announcement (right)
 *   - Zoru Shop Rules + Contact Information
 */

const Index = () => {
  const [news, setNews] = useState<{ id: string; label: string; count: number }[]>([]);
  const [anns, setAnns] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [annRes, prodRes] = await Promise.allSettled([
        listAnnouncements(),
        supabase
          .from("products")
          .select("id, title, stock, base, created_at")
          .eq("active", true)
          .order("created_at", { ascending: false })
          .limit(300),
      ]);

      const baseCandidates: { id: string; label: string; count: number }[] = [];
      const promoAnns: Announcement[] = [];

      if (annRes.status === "fulfilled" && Array.isArray(annRes.value)) {
        for (const a of annRes.value) {
          const isBaseUpdate =
            a.kind === "update" ||
            /^base update:/i.test(a.title.trim()) ||
            /^\d{4}[_\-]\d{2}[_\-]\d{2}/i.test(a.title.trim());

          if (isBaseUpdate) {
            const rawBase = a.title.replace(/^base update:\s*/i, "").trim();
            const label = publicBase(rawBase);
            if (label) {
              baseCandidates.push({ id: a.id, label, count: 0 });
            }
          } else {
            promoAnns.push(a);
          }
        }
        setAnns(promoAnns);
      }

      if (prodRes.status === "fulfilled" && prodRes.value.data) {
        for (const p of prodRes.value.data) {
          const label = p.base ? publicBase(p.base) : p.title;
          if (label) {
            baseCandidates.push({ id: p.id, label, count: Number(p.stock || 1) });
          }
        }
      }

      // Deduplicate by normalized label
      const map = new Map<string, { id: string; label: string; count: number }>();
      for (const b of baseCandidates) {
        const norm = publicBase(b.label);
        const existing = map.get(norm);
        if (existing) {
          existing.count += b.count;
        } else {
          map.set(norm, { id: b.id, label: norm, count: b.count });
        }
      }

      // Sort newest base first (covers full 6 months history)
      const sortedKeys = sortBasesLatestFirst(Array.from(map.keys()));
      const sortedList = sortedKeys.map((k) => map.get(k)!).filter(Boolean);
      setNews(sortedList.slice(0, 50));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 2500);
    void loadData().finally(() => clearTimeout(timer));
  }, [loadData]);

  useEffect(() => {
    intervalRef.current = setInterval(loadData, 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [loadData]);

  return (
    <AppShell>
      <Seo title="Zoru Shop — Главная" description="Личный кабинет покупателя, живая лента поступлений и объявления." path="/" />

      <BuildBotBanner className="mb-5" />



      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* НОВОСТИ И ОБНОВЛЕНИЯ */}
        <Panel title="Новости и обновления">
          <div className="max-h-[420px] overflow-y-auto py-3 text-center font-mono text-[15px] leading-[2.1] text-[#d32f2f]">
            {loading && (
              <div className="space-y-3 px-6 py-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-3 bg-[#f0f0f0] animate-pulse" style={{ width: `${60 + (i % 3) * 12}%`, marginInline: "auto" }} />
                ))}
              </div>
            )}
            {!loading && news.length === 0 && (
              <div className="text-[#888] font-sans text-sm py-6">Пока нет обновлений.</div>
            )}
            {!loading && news.map((n) => (
              <div key={n.id}>
                <Link
                  to={`/shop?base=${encodeURIComponent(n.label)}`}
                  className="hover:underline hover:text-[#b71c1c] transition-colors"
                >
                  {n.label}
                </Link>
              </div>
            ))}
          </div>
        </Panel>

        {/* ОБЪЯВЛЕНИЯ */}
        <Panel title="Объявления">
          <div className="px-6 py-6 space-y-6 text-center max-h-[420px] overflow-y-auto">
            {anns.length === 0 ? (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-[#8e24aa] mb-2">
                    Добро пожаловать в Zoru Shop
                  </h3>
                  <p className="text-[14px] text-[#333] leading-[1.9]">
                    Следите за официальным каналом, чтобы не пропустить обновления.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#d32f2f] mb-2">Акция на пополнение</h3>
                  <p className="text-[14px] text-[#d32f2f] font-semibold leading-[1.9]">
                    Пополнение на $500 — бонус $35. Пополнение на $1000 — бонус $100.
                  </p>
                  <p className="text-[14px] text-[#d32f2f] font-semibold leading-[1.9] mt-2">
                    Пополнение на $2000 — бонус $240. Пополнение на $5000 — бонус $750.
                  </p>
                </div>
              </div>
            ) : (
              anns.map((a, i) => (
                <div key={a.id}>
                  <h3 className={`text-lg font-semibold mb-2 ${i === 0 ? "text-[#8e24aa]" : "text-[#d32f2f]"}`}>
                    {a.title}
                  </h3>
                  <p className="text-[14px] text-[#333] leading-[1.75] whitespace-pre-line">
                    {a.body}
                  </p>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>

      {/* ПРАВИЛА + КОНТАКТЫ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
        <Panel title="Правила Zoru Shop">
          <div className="px-6 py-5 text-[13px] text-[#333] border-l-2 border-[#e6e6e6] ml-3 space-y-2 leading-[1.7]">
            <p>Регистрируясь, вы автоматически соглашаетесь с правилами магазина.</p>
            <p>Правила могут изменяться без уведомления пользователей.</p>
            <p>Если вы нашли ошибку или уязвимость, сообщите об этом через тикеты.</p>
            <p>Умышленное использование ошибок в корыстных целях приведёт к безвозвратной блокировке аккаунта.</p>
            <p>После очистки раздела покупок администрация не сможет восстановить данные. Сохраняйте покупки на своих устройствах.</p>
            <p>При потере доступа к аккаунту администрация не сможет восстановить данные, доступ будет утерян навсегда.</p>
            <p>Пополняйте баланс разумно. Средства на балансе возврату не подлежат.</p>
            <p>Владельцы магазина не несут ответственности за то, как вы используете информацию с этого ресурса.</p>
          </div>
        </Panel>

        <Panel title="Контактная информация / Official Contacts">
          <div className="px-6 py-5 space-y-3.5 text-[13px] text-[#333] border-l-2 border-[#e6e6e6] ml-3 leading-[1.7]">
            <p className="text-[#555]">
              Остерегайтесь фейков и мошенников. Все официальные ресурсы и поддержка <b>Zoru Shop</b> перечислены ниже:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <a
                href="https://t.me/zorushop"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2.5 p-2.5 rounded-lg border border-[#e0e6ed] bg-[#f8fafc] hover:bg-[#eff6ff] hover:border-[#3b82f6]/40 transition group"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#229ed9]/15 text-[#229ed9] group-hover:scale-110 transition-transform">
                  <Send className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">Main Channel</div>
                  <div className="text-[13px] font-bold text-[#0f172a] truncate group-hover:text-[#229ed9]">Zoru Main Group</div>
                </div>
              </a>

              <a
                href="https://t.me/zorushop_backup"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2.5 p-2.5 rounded-lg border border-[#e0e6ed] bg-[#f8fafc] hover:bg-[#eff6ff] hover:border-[#3b82f6]/40 transition group"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#3b82f6]/15 text-[#3b82f6] group-hover:scale-110 transition-transform">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">Backup Channel</div>
                  <div className="text-[13px] font-bold text-[#0f172a] truncate group-hover:text-[#3b82f6]">Zoru Back up Group</div>
                </div>
              </a>

              <a
                href="https://t.me/Zorushop_service"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2.5 p-2.5 rounded-lg border border-[#e0e6ed] bg-[#f8fafc] hover:bg-[#fef3c7] hover:border-[#f59e0b]/40 transition group"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f59e0b]/15 text-[#f59e0b] group-hover:scale-110 transition-transform">
                  <MessageCircle className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">Direct Support</div>
                  <div className="text-[13px] font-bold text-[#0f172a] truncate group-hover:text-[#d97706]">@Zorushop_service</div>
                </div>
              </a>

              <a
                href="https://t.me/ZoruCheckerbot"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2.5 p-2.5 rounded-lg border border-[#e0e6ed] bg-[#f8fafc] hover:bg-[#f0fdf4] hover:border-[#22c55e]/40 transition group"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#22c55e]/15 text-[#22c55e] group-hover:scale-110 transition-transform">
                  <Bot className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">Telegram Bot</div>
                  <div className="text-[13px] font-bold text-[#0f172a] truncate group-hover:text-[#16a34a]">Zoru Checker Bot</div>
                </div>
              </a>
            </div>

            <p className="text-[#d32f2f] font-semibold pt-2 text-[12px]">
              ★ Приглашаем проверенных продавцов и поставщиков к сотрудничеству через тикеты или @Zorushop_service.
            </p>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
};

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-[#e6e6e6]">
      <header className="px-5 py-3 border-b border-[#eee] text-center">
        <h2 className="text-[15px] font-medium text-[#1a1a1a]">{title}</h2>
      </header>
      <div>{children}</div>
    </section>
  );
}

export default Index;
