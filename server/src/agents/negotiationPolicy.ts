export interface BuyerNegotiationPolicy {
  maxRounds: number;
  maxOrderMultiplier: number; // hard ceiling: never counter above deficit * this
}

export const defaultBuyerNegotiationPolicy: BuyerNegotiationPolicy = {
  maxRounds: 2,
  maxOrderMultiplier: 1.5,
};

/**
 * Called by the buyer agent's compute_counter_quantity tool.
 * Bounds how aggressively the buyer can chase a better tier -- it can't
 * invent an arbitrarily large counter just to force a discount.
 */
export function computeCounterQuantity(
  currentAsk: number,
  deficit: number,
  policy: BuyerNegotiationPolicy = defaultBuyerNegotiationPolicy
): number {
  const bumped = Math.ceil(currentAsk * 1.4);
  const hardCap = Math.ceil(deficit * policy.maxOrderMultiplier);
  return Math.min(bumped, hardCap);
}

/**
 * Called by the buyer agent's evaluate_offer tool. Reuses the same shape
 * as the main policy engine -- this IS a policy check, just scoped to one
 * seller thread before the final cross-seller decision.
 */
export function evaluateOfferAgainstCeiling(
  unitPrice: number,
  ceiling: number
): {
  rule: string;
  passed: boolean;
  value: number;
  limit: number;
} {
  return {
    rule: "unit_price_within_ceiling",
    passed: unitPrice <= ceiling,
    value: unitPrice,
    limit: ceiling,
  };
}

export const BUYER_NEGOTIATION_CEILINGS: Record<string, number> = {
  flour: 6.5,
  cheese: 3.8,
  milk: 8.8,
  tomato: 30.0,
  tomatoes: 3.8,
  onion: 3.8,
  onions: 3.8,
};

export function getBuyerCeiling(item: string, customLimit?: number): number {
  if (customLimit !== undefined && customLimit < 35 && customLimit > 0) {
    return customLimit;
  }
  const norm = item.toLowerCase().trim().replace(/s$/, "");
  if (norm === "flour") return 6.5;
  if (norm === "cheese") return 3.8;
  if (norm === "milk") return 8.8;
  if (norm === "tomato") return item.toLowerCase() === "tomato" ? 30.0 : 3.8;
  if (norm === "onion") return 3.8;
  return customLimit ?? 35;
}
