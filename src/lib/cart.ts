import type { Product } from "@/lib/store";

export interface CartLine {
  id: string;
  title: string;
  bin: string | null;
  brand: string | null;
  country: string | null;
  base: string | null;
  exp_month: string | null;
  exp_year: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  price: number;
  refundable?: boolean;
  last_digits?: string | null;
}

const KEY = "zoru_cart_v1";
const EVT = "zoru-cart-updated";

export const getCart = (): CartLine[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as CartLine[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const save = (lines: CartLine[]) => {
  window.localStorage.setItem(KEY, JSON.stringify(lines));
  window.dispatchEvent(new Event(EVT));
};

export const toLine = (p: Product): CartLine => ({
  id: p.id,
  title: p.title,
  bin: p.bin,
  brand: p.brand,
  country: p.country,
  base: p.base,
  exp_month: p.exp_month,
  exp_year: p.exp_year,
  city: p.city,
  state: p.state,
  zip: p.zip,
  price: Number(p.price),
  refundable: Boolean((p as { refundable?: boolean }).refundable),
  last_digits: (p as { last_digits?: string | null }).last_digits ?? null,
});

/** Adds products to cart, ignoring duplicates. Returns how many were added. */
export const addToCart = (products: Product[]): number => {
  const cart = getCart();
  const have = new Set(cart.map((l) => l.id));
  const fresh = products.filter((p) => !have.has(p.id)).map(toLine);
  if (fresh.length) save([...cart, ...fresh]);
  return fresh.length;
};

export const removeFromCart = (id: string) => save(getCart().filter((l) => l.id !== id));

export const clearCart = () => save([]);

export const cartCount = () => getCart().length;

export const onCartChange = (cb: () => void) => {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", cb);
  };
};
