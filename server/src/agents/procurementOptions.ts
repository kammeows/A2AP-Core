import { CachedSellerCatalog, BuyerCatalogService } from "./buyerAgent.js";
import { normalizeIngredientKey } from "./negotiationPolicy.js";

export interface InventoryEvent {
  item: string;
  tick: number;
  quantityUsed: number;
  orderId?: number;
  timestamp?: string;
}

export interface LivePantryState {
  currentTick: number;
  stock: Record<string, number>;
  target: Record<string, number>;
  safetyFloor: Record<string, number>;
  recentEvents: InventoryEvent[];
}

export interface ProcurementOption {
  option_id: string; // e.g. "buy_minimal", "buy_to_tier_20", "wait"
  item: string;
  action_type: "buy" | "wait";
  quantity?: number;
  unit_price?: number;
  discount_pct?: number;
  total_cost?: number;
  recheck_after_ticks?: number; // only present on "wait"
  reasoning_facts: Record<string, number | string>; // the ONLY facts the LLM may cite
}

export const LOOKBACK_TICKS = 10;
export const SAFE_WAIT_TICKS = 3;
export const MAX_OVERBUY_MULTIPLIER = 1.5;

/**
 * Computes the real consumption rate of an item per tick over the recent event window.
 * Never estimated or guessed -- computed strictly over actual kitchen events.
 */
export function computeConsumptionRate(
  item: string,
  recentEvents: InventoryEvent[],
  currentTick: number = 0,
  lookbackTicks: number = LOOKBACK_TICKS
): number {
  if (!recentEvents || recentEvents.length === 0) return 0;
  const norm = normalizeIngredientKey(item);
  const minTick = Math.max(0, currentTick - lookbackTicks);

  const windowEvents = recentEvents.filter((e) => {
    const eNorm = normalizeIngredientKey(e.item);
    return eNorm === norm && e.tick >= minTick;
  });

  const totalUsed = windowEvents.reduce((sum, e) => sum + e.quantityUsed, 0);
  const activeTicks = Math.max(1, Math.min(lookbackTicks, currentTick > 0 ? currentTick : lookbackTicks));
  return Number((totalUsed / activeTicks).toFixed(2));
}

/**
 * Projects future inventory stock based on current stock and consumption rate.
 */
export function projectStock(
  currentStock: number,
  rate: number,
  ticksAhead: number
): number {
  return Math.max(0, Number((currentStock - rate * ticksAhead).toFixed(1)));
}

/**
 * Deterministically looks up the best estimated unit price, discount, and total cost
 * across cached seller catalogs for a given quantity.
 */
export function costLookup(
  item: string,
  quantity: number,
  cachedCatalogs?: CachedSellerCatalog[]
): { unit_price: number; discount_pct: number; total_cost: number; seller_id?: string } {
  const catalogs = cachedCatalogs || BuyerCatalogService.getCachedCatalogs();
  const matching = BuyerCatalogService.getCachedSellersForItem(item);

  if (matching.length === 0) {
    const defaultBase = item.toLowerCase().includes("tomato") ? 28 : (item.toLowerCase() === "flour" ? 6 : 4);
    return {
      unit_price: defaultBase,
      discount_pct: 0,
      total_cost: Number((defaultBase * quantity).toFixed(2)),
    };
  }

  let bestCost = Infinity;
  let bestUnitPrice = 0;
  let bestDiscount = 0;
  let bestSellerId = matching[0].seller_id;
  const norm = normalizeIngredientKey(item);

  for (const seller of matching) {
    const baseEntry = Object.entries(seller.base_prices).find(
      ([k]) => normalizeIngredientKey(k) === norm || k.toLowerCase() === item.toLowerCase()
    );
    const basePrice = baseEntry ? baseEntry[1].base_price : 10;

    const tiers = seller.discount_tiers
      ? Object.entries(seller.discount_tiers).find(
          ([k]) => normalizeIngredientKey(k) === norm || k.toLowerCase() === item.toLowerCase()
        )?.[1] || []
      : [];

    const sortedTiers = [...tiers].sort((a, b) => a.min_quantity - b.min_quantity);
    const matchedTier = [...sortedTiers].reverse().find((t) => quantity >= t.min_quantity);
    const discountPct = matchedTier ? matchedTier.discount_pct : 0;
    const unitPrice = Number((basePrice * (1 - discountPct / 100)).toFixed(2));
    const totalCost = Number((unitPrice * quantity).toFixed(2));

    if (totalCost < bestCost) {
      bestCost = totalCost;
      bestUnitPrice = unitPrice;
      bestDiscount = discountPct;
      bestSellerId = seller.seller_id;
    }
  }

  return {
    unit_price: bestUnitPrice,
    discount_pct: bestDiscount,
    total_cost: bestCost,
    seller_id: bestSellerId,
  };
}

/**
 * Computes all available procurement options deterministically:
 * - Option A: buy_minimal (restock exactly up to target)
 * - Option B: buy_to_tier_{X} (step up quantity to unlock volume discount tier within policy ceiling)
 * - Option C: wait (defer ordering if projected stock remains safely above the floor)
 */
export function computeProcurementOptions(
  item: string,
  live: LivePantryState,
  cachedCatalogs?: CachedSellerCatalog[],
  maxOverbuyMultiplier: number = MAX_OVERBUY_MULTIPLIER,
  safeWaitTicks: number = SAFE_WAIT_TICKS
): ProcurementOption[] {
  const norm = normalizeIngredientKey(item);
  const currentStock = live.stock[item] ?? live.stock[norm] ?? 0;
  const targetStock = live.target[item] ?? live.target[norm] ?? currentStock;
  const safetyFloor = live.safetyFloor[item] ?? live.safetyFloor[norm] ?? 5;

  const rate = computeConsumptionRate(item, live.recentEvents, live.currentTick);
  const options: ProcurementOption[] = [];
  const catalogs = cachedCatalogs || BuyerCatalogService.getCachedCatalogs();

  // -------------------------------------------------------------
  // Option A: Buy Minimal (restock exactly up to target level)
  // -------------------------------------------------------------
  const minimalQty = Math.max(1, targetStock - currentStock);
  const minCost = costLookup(item, minimalQty, catalogs);
  options.push({
    option_id: "buy_minimal",
    item,
    action_type: "buy",
    quantity: minimalQty,
    unit_price: minCost.unit_price,
    discount_pct: minCost.discount_pct,
    total_cost: minCost.total_cost,
    reasoning_facts: {
      current_stock: currentStock,
      target_stock: targetStock,
      minimal_quantity: minimalQty,
      estimated_unit_price: minCost.unit_price,
      estimated_total_cost: minCost.total_cost,
      discount_pct: minCost.discount_pct,
      consumption_rate: rate,
    },
  });

  // -------------------------------------------------------------
  // Option B: Buy to Volume Tier (bounded by MAX_OVERBUY_MULTIPLIER)
  // -------------------------------------------------------------
  const matching = BuyerCatalogService.getCachedSellersForItem(item);
  const seenTierQuantities = new Set<number>();

  for (const seller of matching) {
    const tiers = seller.discount_tiers
      ? Object.entries(seller.discount_tiers).find(
          ([k]) => normalizeIngredientKey(k) === norm || k.toLowerCase() === item.toLowerCase()
        )?.[1] || []
      : [];

    for (const t of tiers) {
      const tierThreshold = t.min_quantity;
      // We evaluate buying either the tier threshold directly or stepping up order
      const tierOrderQty = Math.max(minimalQty, tierThreshold);
      const postOrderStock = currentStock + tierOrderQty;

      // Bound: Cannot exceed targetStock * maxOverbuyMultiplier
      if (
        tierOrderQty > minimalQty &&
        !seenTierQuantities.has(tierOrderQty) &&
        postOrderStock <= targetStock * maxOverbuyMultiplier
      ) {
        seenTierQuantities.add(tierOrderQty);
        const tierCost = costLookup(item, tierOrderQty, catalogs);
        const unitSavings = Number((minCost.unit_price - tierCost.unit_price).toFixed(2));

        options.push({
          option_id: `buy_to_tier_${tierOrderQty}`,
          item,
          action_type: "buy",
          quantity: tierOrderQty,
          unit_price: tierCost.unit_price,
          discount_pct: tierCost.discount_pct,
          total_cost: tierCost.total_cost,
          reasoning_facts: {
            current_stock: currentStock,
            target_stock: targetStock,
            tier_threshold: tierThreshold,
            tier_order_quantity: tierOrderQty,
            tier_discount_pct: tierCost.discount_pct,
            estimated_unit_price: tierCost.unit_price,
            estimated_total_cost: tierCost.total_cost,
            unit_savings_vs_minimal: unitSavings,
            consumption_rate: rate,
          },
        });
      }
    }
  }

  // -------------------------------------------------------------
  // Option C: Wait (only offered if projected stock stays above floor)
  // -------------------------------------------------------------
  const projected = projectStock(currentStock, rate, safeWaitTicks);
  if (projected > safetyFloor) {
    options.push({
      option_id: "wait",
      item,
      action_type: "wait",
      recheck_after_ticks: safeWaitTicks,
      reasoning_facts: {
        current_stock: currentStock,
        projected_stock_in_n_ticks: projected,
        safety_floor: safetyFloor,
        safe_wait_ticks: safeWaitTicks,
        consumption_rate: rate,
      },
    });
  }

  return options;
}

/**
 * Validates the LLM's free-text reasoning against the exact facts provided in reasoning_facts.
 * Flags any numeric citation that doesn't correspond to a known ground-truth fact.
 */
export function validateReasoningNumbers(
  reasoning: string,
  facts: Record<string, number | string>
): { isValid: boolean; unexplained: number[] } {
  if (!reasoning) return { isValid: true, unexplained: [] };

  const matches = [...reasoning.matchAll(/\b\d+(\.\d+)?\b/g)];
  const mentionedNumbers = matches.map((m) => parseFloat(m[0])).filter((n) => !isNaN(n));

  const knownValues = Object.values(facts)
    .filter((v): v is number => typeof v === "number" || (!isNaN(Number(v)) && v !== ""))
    .map((v) => Number(v));

  const unexplained = mentionedNumbers.filter(
    (n) => !knownValues.some((v) => Math.abs(v - n) < 0.05)
  );

  return {
    isValid: unexplained.length === 0,
    unexplained,
  };
}
