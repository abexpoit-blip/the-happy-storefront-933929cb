export type PricingMode = "fixed" | "dynamic_level";

export interface PricingConfig {
  mode: PricingMode;
  fixedPrice: number;
  minPrice: number;
  maxPrice: number;
  randomVariation?: boolean;
}

export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  mode: "fixed",
  fixedPrice: 1.50,
  minPrice: 0.20,
  maxPrice: 10.00,
  randomVariation: true,
};

export interface CardForPricing {
  cc?: string;
  brand?: string | null;
  card_level?: string | null;
  card_type?: string | null;
  refundable?: boolean;
}

/**
 * Determine the tier ranking (1 to 5) based on card level, type, and brand.
 */
export function detectCardTier(card: CardForPricing): {
  tier: number;
  tierName: "CLASSIC/STANDARD" | "GOLD/PREPAID" | "PLATINUM/TITANIUM" | "SIGNATURE/WORLD" | "INFINITE/BLACK";
  weight: number; // 0.0 to 1.0 position in range
} {
  const lvl = (card.card_level ?? "").toUpperCase();
  const type = (card.card_type ?? "").toUpperCase();
  const brand = (card.brand ?? "").toUpperCase();

  // Tier 5: Ultra Top (Infinite, World Elite, Centurion, Black, Ultra, Elite)
  if (
    lvl.includes("INFINITE") ||
    lvl.includes("WORLD ELITE") ||
    lvl.includes("CENTURION") ||
    lvl.includes("BLACK") ||
    lvl.includes("ULTRA") ||
    lvl.includes("DIAMOND")
  ) {
    return { tier: 5, tierName: "INFINITE/BLACK", weight: 0.95 };
  }

  // Tier 4: High Premium (Signature, World, Corporate, Business, Premier)
  if (
    lvl.includes("SIGNATURE") ||
    lvl.includes("WORLD") ||
    lvl.includes("BUSINESS") ||
    lvl.includes("CORPORATE") ||
    lvl.includes("PREMIER") ||
    lvl.includes("COMMERCIAL") ||
    brand.includes("AMEX")
  ) {
    return { tier: 4, tierName: "SIGNATURE/WORLD", weight: 0.78 };
  }

  // Tier 3: Upper Mid (Platinum, Titanium, Rewards, Executive)
  if (
    lvl.includes("PLATINUM") ||
    lvl.includes("TITANIUM") ||
    lvl.includes("REWARDS") ||
    lvl.includes("EXECUTIVE") ||
    lvl.includes("ENHANCED")
  ) {
    return { tier: 3, tierName: "PLATINUM/TITANIUM", weight: 0.58 };
  }

  // Tier 2: Mid (Gold, Prepaid, Purchasing, Preferred)
  if (
    lvl.includes("GOLD") ||
    lvl.includes("PREPAID") ||
    type.includes("PREPAID") ||
    lvl.includes("PURCHASING") ||
    lvl.includes("PREFERRED")
  ) {
    return { tier: 2, tierName: "GOLD/PREPAID", weight: 0.35 };
  }

  // Tier 1: Base (Classic, Standard, Traditional, Debit, Unknown)
  return { tier: 1, tierName: "CLASSIC/STANDARD", weight: 0.15 };
}

/**
 * Calculate dynamic card price based on card level and item value
 */
export function calculateCardPrice(card: CardForPricing, config: PricingConfig): number {
  if (config.mode === "fixed") {
    return Math.max(0.01, Math.round(config.fixedPrice * 100) / 100);
  }

  const min = Math.max(0.10, config.minPrice);
  const max = Math.max(min, config.maxPrice);
  const range = max - min;

  const { weight } = detectCardTier(card);

  // Small deterministic pseudo-random variance based on last 4 digits of CC
  let variance = 0;
  if (config.randomVariation && card.cc) {
    const digits = card.cc.replace(/\D/g, "");
    const seed = parseInt(digits.slice(-4) || "5555", 10) % 100;
    // -0.08 to +0.08 of range
    variance = ((seed - 50) / 100) * (range * 0.12);
  }

  // Extra boost for refundable cards or credit cards
  let boost = 0;
  if (card.refundable) boost += range * 0.06;
  if ((card.card_type ?? "").toUpperCase().includes("CREDIT")) boost += range * 0.04;

  let calculated = min + (range * weight) + variance + boost;

  // Clamp strictly between min and max
  calculated = Math.max(min, Math.min(max, calculated));

  // Format cleanly to 2 decimals
  return Math.round(calculated * 100) / 100;
}

export interface PricingSummary {
  min: number;
  max: number;
  avg: number;
  tierCounts: Record<string, { count: number; avgPrice: number }>;
}

export function getPricingSummary(cards: CardForPricing[], config: PricingConfig): PricingSummary {
  if (cards.length === 0) {
    return {
      min: config.fixedPrice,
      max: config.fixedPrice,
      avg: config.fixedPrice,
      tierCounts: {},
    };
  }

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;

  const tierMap: Record<string, { count: number; total: number }> = {};

  for (const card of cards) {
    const p = calculateCardPrice(card, config);
    if (p < min) min = p;
    if (p > max) max = p;
    sum += p;

    const { tierName } = detectCardTier(card);
    if (!tierMap[tierName]) tierMap[tierName] = { count: 0, total: 0 };
    tierMap[tierName].count += 1;
    tierMap[tierName].total += p;
  }

  const tierCounts: Record<string, { count: number; avgPrice: number }> = {};
  for (const [k, v] of Object.entries(tierMap)) {
    tierCounts[k] = {
      count: v.count,
      avgPrice: Math.round((v.total / v.count) * 100) / 100,
    };
  }

  return {
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    avg: Math.round((sum / cards.length) * 100) / 100,
    tierCounts,
  };
}
