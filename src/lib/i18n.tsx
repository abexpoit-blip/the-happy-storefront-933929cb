import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";

export type Lang = "ru" | "en";
const LS_KEY = "zoru.lang";

/** RU → EN dictionary. Keys must match the rendered text exactly (trimmed). */
const DICT: Record<string, string> = {
  // nav / shell
  "ГЛАВНАЯ": "HOME",
  "МАГАЗИН": "SHOP",
  "КОРЗИНА": "CART",
  "ЗАКАЗЫ": "ORDERS",
  "ПОПОЛНЕНИЕ": "RECHARGE",
  "Главная": "Home",
  "Магазин": "Shop",
  "Корзина": "Cart",
  "Заказы": "Orders",
  "Меню": "Menu",
  "Выйти": "Log out",
  "Войти": "Sign in",
  "Вход": "Sign in",
  "Регистрация": "Sign up",
  "Зарегистрироваться": "Create account",
  "Создать аккаунт": "Create account",
  "Имя пользователя": "Username",
  "Пароль": "Password",
  "пароль": "password",
  "пользователь": "user",
  "Запомнить меня": "Remember me",
  "Забыли пароль?": "Forgot password?",
  "Нет аккаунта?": "No account?",
  "Уже есть аккаунт?": "Already have an account?",
  "Сменить аккаунт": "Switch account",
  "Удалить сохранённый аккаунт": "Remove saved account",
  "Войти в маркетплейс": "Sign in to the marketplace",
  "Войти в консоль": "Sign in to console",
  "Выполняется вход…": "Signing in…",
  "Загрузка…": "Loading…",
  "Загрузка": "Loading",
  "Проверка…": "Checking…",
  "Проверка BIN…": "Checking BIN…",
  "Обработка": "Processing",
  "Обновить": "Refresh",
  "Обновить код": "Refresh code",
  "Код": "Code",
  "Неверный проверочный код": "Invalid verification code",
  "Введите ответ, показанный на кнопке.": "Enter the answer shown on the button.",
  "Активация аккаунта": "Account activation",
  "Аккаунт создан": "Account created",
  "Аккаунт заблокирован": "Account blocked",
  "Ваш аккаунт заблокирован. Свяжитесь с поддержкой, если считаете это ошибкой.":
    "Your account is blocked. Contact support if you think this is a mistake.",
  "Неверные данные": "Invalid credentials",
  "Проверьте email и пароль.": "Check your email and password.",
  "Ошибка входа": "Sign-in error",
  "Ошибка": "Error",
  "Ошибка загрузки": "Loading error",
  "Ошибка сохранения": "Save error",
  "Ошибка конфигурации сервера": "Server configuration error",
  "Сервер недоступен": "Server unavailable",
  "Не удалось загрузить профиль": "Failed to load profile",
  "Войдите в аккаунт.": "Please sign in.",
  "Только для персонала": "Staff only",
  "Только для администраторов. Перенаправление…": "Administrators only. Redirecting…",
  "Этот вход только для администраторов.": "This login is for administrators only.",
  "У этого аккаунта нет прав администратора.": "This account has no administrator rights.",
  "Не админ-аккаунт": "Not an admin account",
  "Админ-консоль": "Admin console",
  "Админ-консоль разблокирована": "Admin console unlocked",
  "Назад ко входу пользователя": "Back to user login",
  "Ограниченный доступ": "Restricted access",
  "НЕСАНКЦИОНИРОВАННЫЙ ДОСТУП ФИКСИРУЕТСЯ": "UNAUTHORIZED ACCESS IS LOGGED",
  "ОТСЛЕЖИВАЕТСЯ": "TRACKED",
  "С ВОЗВРАЩЕНИЕМ": "WELCOME BACK",
  "С возвращением": "Welcome back",
  "Вход и регистрация": "Sign in & sign up",
  "Регистрируясь, вы автоматически соглашаетесь с правилами магазина.":
    "By registering you automatically accept the shop rules.",
  "После входа вы будете перенаправлены на": "After signing in you will be redirected to",

  // shop
  "Поиск": "Search",
  "Поиск:": "Search:",
  "Поиск: BIN, база, бренд…": "Search: BIN, base, brand…",
  "Живой сток. Поиск по BIN, базе, стране и ZIP.": "Live stock. Search by BIN, base, country and ZIP.",
  "Склад": "Stock",
  "ЖИВОЙ СКЛАД": "LIVE STOCK",
  "Бренд": "Brand",
  "Страна": "Country",
  "Категория": "Category",
  "Категории": "Categories",
  "Категорий нет": "No categories",
  "Без категории": "Uncategorized",
  "Цена": "Price",
  "Цена ($)": "Price ($)",
  "Купить сейчас": "Buy now",
  "Добавить": "Add",
  "Добавлено в корзину:": "Added to cart:",
  "Уже в корзине": "Already in cart",
  "Позиции не найдены": "No items found",
  "Позиция": "Item",
  "Позиций:": "Items:",
  "Всего": "Total",
  "Итого:": "Total:",
  "Сброс": "Reset",
  "Очистить": "Clear",
  "Корзина пуста": "Cart is empty",
  "Корзина пуста.": "Cart is empty.",
  "Корзина очищена": "Cart cleared",
  "Ваша корзина покупок.": "Your shopping cart.",
  "К оплате": "To pay",
  "Оплата": "Payment",
  "Товар закончился.": "Out of stock.",
  "Товар недоступен.": "Item unavailable.",
  "Некорректное количество.": "Invalid quantity.",
  "Недостаточно средств на балансе.": "Insufficient balance.",
  "Недостаточно средств. Пополните баланс.": "Insufficient funds. Top up your balance.",
  "Хит продаж": "Best seller",
  "Куплено:": "Purchased:",
  "КОЛ-ВО:": "QTY:",
  "Минимум": "Minimum",
  "Номинал": "Denomination",
  "Перейти": "Go",
  "Перейти в магазин": "Go to shop",

  // orders
  "Выберите заказы": "Select orders",
  "Выберите карты": "Select cards",
  "Нет заказов": "No orders",
  "Скачать": "Download",
  "Скачано": "Downloaded",
  "Скачать выбранные": "Download selected",
  "Нет данных для скачивания": "Nothing to download",
  "Номер заказа": "Order number",
  "Введите номер заказа": "Enter order number",
  "Статус": "Status",
  "Операция": "Operation",
  "История операций": "Transaction history",
  "Активна": "Active",
  "Активно": "Active",
  "Готово к загрузке:": "Ready to download:",

  // recharge / payments
  "Пополнение баланса": "Balance top-up",
  "Сумма пополнения": "Top-up amount",
  "Сумма в USD": "Amount in USD",
  "Текущий баланс": "Current balance",
  "Пополнить через": "Top up via",
  "Создать новую заявку": "Create a new invoice",
  "Заявка создана — отправьте LTC на адрес ниже.": "Invoice created — send LTC to the address below.",
  "Заявка отменена или истекла.": "Invoice cancelled or expired.",
  "Платёж не завершён или истёк.": "Payment not completed or expired.",
  "Не удалось создать заявку": "Failed to create the invoice",
  "Ожидание оплаты": "Awaiting payment",
  "Время оплаты": "Payment time",
  "Время истекло": "Time expired",
  "Оплатите в течение": "Pay within",
  "Отсканируйте QR в вашем LTC-кошельке": "Scan the QR in your LTC wallet",
  "LTC-адрес для оплаты": "LTC payment address",
  "QR-код больше не действителен": "The QR code is no longer valid",
  "Адрес и сумма действительны": "Address and amount are valid",
  "Комиссия сети (2%)": "Network fee (2%)",
  "Копировать": "Copy",
  "Скопировано": "Copied",
  "Не удалось скопировать — скопируйте вручную": "Copy failed — copy manually",
  "Отправьте точно": "Send exactly",
  "Отправляйте": "Send",
  "Отправляйте точную сумму — иначе средства могут не зачислиться.":
    "Send the exact amount — otherwise funds may not be credited.",
  "на этот адрес. Другие монеты будут утеряны безвозвратно.":
    "to this address. Other coins will be lost permanently.",
  "Баланс пополняется автоматически после 2 подтверждений сети.":
    "The balance is credited automatically after 2 network confirmations.",
  "Каждая заявка получает уникальный адрес. Никогда не переиспользуйте старые адреса.":
    "Each invoice gets a unique address. Never reuse old addresses.",
  "Минимальная сумма пополнения —": "Minimum top-up amount is",
  "Последние пополнения": "Recent top-ups",
  "Акция на пополнение": "Top-up bonus",
  "только LTC": "LTC only",
  "30 минут": "30 minutes",
  "минут": "minutes",

  // news / info
  "Новости и обновления": "News & updates",
  "НОВОСТИ И ОБНОВЛЕНИЯ": "NEWS & UPDATES",
  "Объявления": "Announcements",
  "ОБЪЯВЛЕНИЯ": "ANNOUNCEMENTS",
  "Пока нет обновлений.": "No updates yet.",
  "Правила": "Rules",
  "ПРАВИЛА": "RULES",
  "КОНТАКТЫ": "CONTACTS",
  "Контактная информация": "Contact information",
  "Поддержка 24/7": "24/7 support",
  "ПОДДЕРЖКА 24/7": "24/7 SUPPORT",
  "Мгновенная доставка": "Instant delivery",
  "МГНОВЕННАЯ ДОСТАВКА": "INSTANT DELIVERY",
  "Безопасные расчёты": "Secure payments",
  "Все права защищены.": "All rights reserved.",
  "Все права защищены": "All rights reserved",
  "Проверенный маркетплейс": "Verified marketplace",
  "ПРОВЕРЕННЫЙ МАРКЕТПЛЕЙС": "VERIFIED MARKETPLACE",
  "Проверенный товар, мгновенная доставка, авто-замена и безопасные расчёты.":
    "Verified goods, instant delivery, auto-replacement and secure payments.",
  "Личный кабинет покупателя, живая лента поступлений и объявления.":
    "Buyer dashboard, live restock feed and announcements.",
  "Telegram-канал:": "Telegram channel:",
  "Остерегайтесь поддельной поддержки Zoru Shop. У нас нет Telegram и Discord — любые контакты в мессенджерах от имени магазина являются мошенниками.":
    "Beware of fake Zoru Shop support. We have no Telegram or Discord — any messenger contacts claiming to be the shop are scammers.",
  "Поддержка — только через тикеты на сайте. Мы не используем Telegram и Discord.":
    "Support is only available via on-site tickets. We do not use Telegram or Discord.",
  "Если вы нашли ошибку или уязвимость, сообщите об этом через тикеты.":
    "If you find a bug or vulnerability, report it through tickets.",
  "Владельцы магазина не несут ответственности за то, как вы используете информацию с этого ресурса.":
    "The shop owners are not responsible for how you use information from this resource.",
  "Пополняйте баланс разумно. Средства на балансе возврату не подлежат.":
    "Top up wisely. Funds on the balance are non-refundable.",
  "После очистки раздела покупок администрация не сможет восстановить данные. Сохраняйте покупки на своих устройствах.":
    "After clearing the purchases section, the administration cannot restore data. Keep your purchases on your own devices.",
  "При потере доступа к аккаунту администрация не сможет восстановить данные, доступ будет утерян навсегда.":
    "If you lose access to your account, the administration cannot restore data — access is lost forever.",
  "Умышленное использование ошибок в корыстных целях приведёт к безвозвратной блокировке аккаунта.":
    "Intentional abuse of bugs for profit leads to a permanent account ban.",
  "Правила могут изменяться без уведомления пользователей.":
    "The rules may change without notifying users.",
  "Приглашаем продавцов присоединиться к нашей платформе": "We invite sellers to join our platform",
  "↗ АВТОЗАМЕНА В ТЕЧЕНИЕ 5 МИНУТ": "↗ AUTO-REPLACE WITHIN 5 MINUTES",
  "● 99.4% ВАЛИДНОСТЬ НА ЭТОЙ НЕДЕЛЕ": "● 99.4% VALIDITY THIS WEEK",
  "● ЖИВОЙ СКЛАД · СВЕЖИЕ ПОСТУПЛЕНИЯ ЕЖЕДНЕВНО": "● LIVE STOCK · FRESH RESTOCKS DAILY",
  "● ПОДДЕРЖКА 24/7 · TELEGRAM": "● 24/7 SUPPORT",
  "● ПОДДЕРЖКА 24/7 · ТИКЕТЫ": "● 24/7 SUPPORT · TICKETS",
  "★ ПРОВЕРЕННЫЕ ПРОДАВЦЫ · МГНОВЕННАЯ ДОСТАВКА": "★ VERIFIED SELLERS · INSTANT DELIVERY",
  "BASE (качество / название базы)": "BASE (quality / base name)",
  "BIN (первые 6 цифр)": "BIN (first 6 digits)",
  "Email (необязательно)": "Email (optional)",
  "Иконка (emoji)": "Icon (emoji)",

  // admin / crud
  "Создать": "Create",
  "Сохранено": "Saved",
  "Удалено": "Deleted",
  "Удалить": "Delete",
  "Отмена": "Cancel",
  "Отменить": "Cancel",
  "Название": "Name",
  "Введите название": "Enter a name",
  "Введите название категории": "Enter a category name",
  "Новая категория": "New category",
  "Новая позиция": "New item",
  "Редактировать категорию": "Edit category",
  "Редактировать позицию": "Edit item",
  "Категория сохранена": "Category saved",
  "Краткое описание": "Short description",
  "Порядок": "Order",
  "Тип выдачи": "Delivery type",
  "Контент выдачи": "Delivery content",
  "Мгновенный текст": "Instant text",
  "Ссылка": "Link",
  "Ссылка на скачивание": "Download link",
  "Карты / товары": "Cards / products",
  "Карты из склада (key)": "Cards from stock (key)",
  "Загрузить": "Upload",
  "Загружено позиций:": "Items uploaded:",
  "Нет корректных строк": "No valid rows",
  "Загрузка карт — по одной в строке (CC|MM|YY|CVV|Name|Address|ZIP)":
    "Card upload — one per line (CC|MM|YY|CVV|Name|Address|ZIP)",
  "Сохранено. Добавлено карт:": "Saved. Cards added:",
  "Не удалось:": "Failed:",
  "скрыто": "hidden",
  "недоступ": "unavailable",
  "Бэкенд": "Backend",
  "Строка": "Row",
  "Проверить": "Check",
  "Проверьте": "Check",
};

const ATTRS = ["placeholder", "title", "aria-label", "alt"];
let lastLang: Lang = "ru";

function tr(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const hit = DICT[trimmed];
  if (!hit) return null;
  return text.replace(trimmed, hit);
}

function translateNode(root: Node) {
  if (lastLang !== "en") return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let n = walker.nextNode();
  while (n) { nodes.push(n as Text); n = walker.nextNode(); }
  if (root.nodeType === Node.TEXT_NODE) nodes.push(root as Text);
  for (const node of nodes) {
    const parent = node.parentElement;
    if (parent && (parent.tagName === "SCRIPT" || parent.tagName === "STYLE")) continue;
    const out = tr(node.nodeValue ?? "");
    if (out && out !== node.nodeValue) node.nodeValue = out;
  }
  const el = root.nodeType === Node.ELEMENT_NODE ? (root as Element) : null;
  const els: Element[] = el ? [el, ...Array.from(el.querySelectorAll("*"))] : [];
  for (const e of els) {
    for (const a of ATTRS) {
      const v = e.getAttribute(a);
      if (!v) continue;
      const out = tr(v);
      if (out && out !== v) e.setAttribute(a, out);
    }
  }
}

interface LangCtx { lang: Lang; setLang: (l: Lang) => void; toggle: () => void }
const Ctx = createContext<LangCtx>({ lang: "ru", setLang: () => {}, toggle: () => {} });

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLangState] = useState<Lang>("ru");

  useEffect(() => {
    const saved = (typeof localStorage !== "undefined" ? localStorage.getItem(LS_KEY) : null) as Lang | null;
    if (saved === "en" || saved === "ru") setLangState(saved);
  }, []);

  useEffect(() => {
    lastLang = lang;
    if (typeof document === "undefined") return;
    document.documentElement.lang = lang;
    if (lang === "ru") return;
    translateNode(document.body);
    const obs = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "characterData" && r.target) translateNode(r.target);
        r.addedNodes.forEach((node) => translateNode(node));
        if (r.type === "attributes" && r.target.nodeType === Node.ELEMENT_NODE) translateNode(r.target);
      }
    });
    obs.observe(document.body, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ATTRS,
    });
    return () => obs.disconnect();
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem(LS_KEY, l);
    setLangState(l);
    // Reload so already-rendered Russian text is re-rendered and translated cleanly,
    // and so switching back to Russian restores original strings.
    window.location.reload();
  }, []);

  const toggle = useCallback(() => setLang(lastLang === "en" ? "ru" : "en"), [setLang]);

  return <Ctx.Provider value={{ lang, setLang, toggle }}>{children}</Ctx.Provider>;
};

export const useLanguage = () => useContext(Ctx);

/** Small inline switcher — matches the flat Scorpion sub-bar style. */
export const LanguageToggle = ({ className = "" }: { className?: string }) => {
  const { lang, setLang } = useLanguage();
  return (
    <button
      type="button"
      onClick={() => setLang(lang === "en" ? "ru" : "en")}
      title={lang === "en" ? "Переключить на русский" : "Change language to English"}
      className={`px-3 py-1.5 border border-[#e6e6e6] text-[#666] hover:text-[#2196f3] hover:border-[#2196f3] transition text-[12px] font-medium tracking-wide ${className}`}
    >
      {lang === "en" ? "RU" : "EN"}
    </button>
  );
};
