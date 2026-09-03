import { useEffect, useState, useRef, useCallback } from "react";
import { newsApi, announcementsApi, ordersApi } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import Seo from "@/components/Seo";

/**
 * Buyer HOME — Scorpion-style layout copy:
 *   - News & Updates (left) + Announcement (right)
 *   - Scorpion Shop Rules + Contact Information
 */

const Index = () => {
  const [news, setNews] = useState<{ id: string; label: string; count: number }[]>([]);
  const [anns, setAnns] = useState<{ id: string; title: string; body: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadNews = useCallback(async () => {
    try {
      const res = await newsApi.list();
      setNews((res.updates ?? []) as typeof news);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    (async () => {
      const [, a] = await Promise.allSettled([
        loadNews(),
        announcementsApi.list(),
        ordersApi.mine().catch(() => null),
      ]);
      if (a.status === "fulfilled" && a.value)
        setAnns((a.value.announcements ?? []) as typeof anns);
      setLoading(false);
    })();
  }, [loadNews]);

  useEffect(() => {
    intervalRef.current = setInterval(loadNews, 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [loadNews]);

  return (
    <AppShell>
      <Seo title="Zoru Shop — Главная" description="Личный кабинет покупателя, живая лента поступлений и объявления." path="/" />

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
                {n.label}
                {n.count ? `,КОЛ-ВО:${n.count}` : ""}
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

        <Panel title="Контактная информация">
          <div className="px-6 py-5 space-y-3 text-[13px] text-[#333] border-l-2 border-[#e6e6e6] ml-3 leading-[1.7]">
            <p>Остерегайтесь поддельной поддержки Zoru Shop. У нас нет Telegram и Discord — любые контакты в мессенджерах от имени магазина являются мошенниками.</p>
            <div>
              <div className="text-[#333] mb-1">Поддержка:</div>
              <p className="block">Только через систему тикетов на сайте — раздел «Поддержка» в личном кабинете.</p>
            </div>
            <p>Ответы на вопросы, предложения и жалобы принимаются исключительно через тикеты на этом сайте.</p>
            <p className="text-[#d32f2f] font-semibold pt-2">Приглашаем продавцов присоединиться к нашей платформе</p>
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
