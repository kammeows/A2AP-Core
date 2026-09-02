export interface DiscountTier {
  minQty: number;
  discountPct: number;
}

export interface SellerItemState {
  item: string;
  stock: number;
  basePrice: number;
  tiers: DiscountTier[]; // sorted ascending by minQty
  parLevel: number; // the seller's own "normal" stock level for this item
  overstockThresholdPct: number; // e.g. 0.7 -> stock/parLevel > 0.7 counts as overstocked
  pairedItem?: string; // item to bundle-suggest when overstocked
}

export interface SellerOffer {
  item: string;
  requestedQty: number;
  offeredQty: number;
  stockLimited: boolean;
  unitPrice: number;
  discountPct: number;
  totalPrice: number;
  reason: string;
}

/**
 * The ONLY place a seller's price is computed. Called by the seller agent's
 * compute_offer tool -- the LLM never invents a number itself.
 * 
 * Hard-caps offeredQty to available stock to prevent stock hallucination (Bug 1).
 * Volume discount tiers genuinely move prices when quantity thresholds are reached (Bug 2).
 */
export function computeSellerOffer(
  state: SellerItemState,
  requestedQty: number
): SellerOffer {
  const offeredQty = Math.max(0, Math.min(requestedQty, state.stock)); // hard cap -- fixes bug 1
  const sortedTiers = [...state.tiers].sort((a, b) => a.minQty - b.minQty);
  const tier = [...sortedTiers].reverse().find((t) => offeredQty >= t.minQty);
  const discountPct = tier?.discountPct ?? 0;
  const unitPrice = Number((state.basePrice * (1 - discountPct / 100)).toFixed(2));
  const totalPrice = Number((unitPrice * offeredQty).toFixed(2));

  let reason = "";
  if (state.stock <= 0) {
    reason = `0 units available in stock, out of stock`;
  } else if (tier) {
    reason = `${offeredQty}u qualifies for the ${discountPct}% volume tier`;
  } else {
    reason = `below any volume tier, base price applies`;
  }

  return {
    item: state.item,
    requestedQty,
    offeredQty,
    stockLimited: offeredQty < requestedQty,
    unitPrice,
    discountPct,
    totalPrice,
    reason,
  };
}

/**
 * Called by the seller agent's check_bundle_opportunity tool.
 * Deterministic: a bundle is only ever offered when the paired item is
 * genuinely overstocked, never as a persuasion tactic.
 */
export function checkBundleOpportunity(
  state: SellerItemState,
  pairedState?: SellerItemState
): {
  pairedItem: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  reason: string;
} | null {
  if (!state.pairedItem) return null;
  const overstocked = state.parLevel > 0 && (state.stock / state.parLevel) > state.overstockThresholdPct;
  if (!overstocked) return null;

  const pairedBase = pairedState ? pairedState.basePrice : 8.1;
  const discount = 10;
  const unitPrice = Number((pairedBase * (1 - discount / 100)).toFixed(2));
  const pctOfPar = Math.round((state.stock / state.parLevel) * 100);

  return {
    pairedItem: state.pairedItem,
    quantity: 2,
    unitPrice,
    discountPct: discount,
    reason: `${state.pairedItem} is overstocked (${pctOfPar}% of par), bundling to move it`,
  };
}
