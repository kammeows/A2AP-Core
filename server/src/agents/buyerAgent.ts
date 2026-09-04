import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  OfferPayload,
  RfqPayload,
  RestaurantProfile,
  AgentCard,
  BuyerDecision,
  SplitAcceptPayload,
  UpsellItem,
} from "../types/domain.js";
import { InventoryStore } from "../inventory/inventoryStore.js";
import { BUYER_SYSTEM_PROMPT } from "./prompts.js";
import {
  evaluateOfferAgainstCeiling,
  computeCounterQuantity,
  getBuyerCeiling,
  normalizeIngredientKey,
  defaultBuyerNegotiationPolicy,
} from "./negotiationPolicy.js";
import {
  allocateSplitAccept,
  AllocationLine,
} from "./pricingEngine.js";
import {
  ProcurementOption,
  LivePantryState,
  computeProcurementOptions,
  validateReasoningNumbers,
} from "./procurementOptions.js";
import {
  DeferredDecisionStore,
  checkDeferredDecisions,
  DeferredDecision,
} from "../procurement/deferredDecisions.js";

try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
} catch {
  dotenv.config();
}
dotenv.config();

function getGeminiKeys(): string[] {
  const raw = process.env.GEMINI_API_KEY || "";
  const directKeys = raw
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 10);
  if (process.env.GEMINI_API_KEY_1)
    directKeys.push(process.env.GEMINI_API_KEY_1.trim());
  if (process.env.GEMINI_API_KEY_2)
    directKeys.push(process.env.GEMINI_API_KEY_2.trim());
  return Array.from(new Set(directKeys));
}

export const RAZORSLICE_MENU = {
  margherita: { flour: 5, cheese: 2, tomato: 1 },
  farm_fresh: { flour: 5, cheese: 1, tomato: 1, onion: 2 },
  milk_shake: { milk: 2 },
};

const VALID_MENU_INGREDIENTS = new Set([
  "flour",
  "cheese",
  "tomato",
  "tomatoes",
  "onion",
  "onions",
  "milk",
]);

async function callGemini(
  apiKey: string,
  offers: OfferPayload[],
  profile: RestaurantProfile,
  agentCards: AgentCard[],
  neededItem: string,
  neededQuantity: number
): Promise<BuyerDecision | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const ceiling = getBuyerCeiling(neededItem, profile.max_price_per_kg[neededItem]);

  const tools = [
    {
      functionDeclarations: [
        {
          name: "evaluate_offer_against_ceiling",
          description: "Check if a seller's quoted unit price is within budget ceiling for this item.",
          parameters: {
            type: "OBJECT",
            properties: {
              unit_price: { type: "NUMBER" },
            },
            required: ["unit_price"],
          },
        },
        {
          name: "compute_counter_quantity",
          description: "Compute bounded counter-quantity to unlock a better volume tier without over-ordering.",
          parameters: {
            type: "OBJECT",
            properties: {
              current_ask: { type: "NUMBER" },
              deficit: { type: "NUMBER" },
            },
            required: ["current_ask", "deficit"],
          },
        },
        {
          name: "propose_accept",
          description: "Propose accepting an offer from a single seller for Policy Engine verification.",
          parameters: {
            type: "OBJECT",
            properties: {
              seller_id: { type: "STRING" },
              item: { type: "STRING" },
              quantity_kg: { type: "NUMBER" },
              final_price_per_kg: { type: "NUMBER" },
              total_price: { type: "NUMBER" },
              rationale: { type: "STRING" },
            },
            required: ["seller_id", "item", "quantity_kg", "total_price", "rationale"],
          },
        },
        {
          name: "propose_split_accept",
          description: "Propose splitting an ingredient purchase across multiple sellers if total cost is lower.",
          parameters: {
            type: "OBJECT",
            properties: {
              item: { type: "STRING" },
              total_quantity_kg: { type: "NUMBER" },
              total_cost: { type: "NUMBER" },
              splits_json: { type: "STRING" },
              rationale: { type: "STRING" },
            },
            required: ["item", "total_quantity_kg", "total_cost", "splits_json", "rationale"],
          },
        },
        {
          name: "send_counter",
          description: "Send an adjusted volume counter-offer to a seller.",
          parameters: {
            type: "OBJECT",
            properties: {
              seller_id: { type: "STRING" },
              item: { type: "STRING" },
              counter_quantity_kg: { type: "NUMBER" },
              target_price_per_kg: { type: "NUMBER" },
              reason: { type: "STRING" },
            },
            required: ["seller_id", "counter_quantity_kg", "reason"],
          },
        },
      ],
    },
  ];

  const contents: any[] = [
    {
      role: "user",
      parts: [
        {
          text: `${BUYER_SYSTEM_PROMPT}\n\nTarget Item: "${neededItem}", Deficit Quantity: ${neededQuantity} units, Ceiling: ₹${ceiling}/unit.\nReceived Quotes: ${JSON.stringify(
            offers
          )}.\nRestaurant Profile: ${JSON.stringify(profile)}.\nMenu Recipes: ${JSON.stringify(
            RAZORSLICE_MENU
          )}.\n\nEvaluate offers using \`evaluate_offer_against_ceiling\` and call \`propose_accept\`, \`propose_split_accept\`, or \`send_counter\`.`,
        },
      ],
    },
  ];

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents, tools }),
    signal: AbortSignal.timeout(3500),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const candidate = data.candidates?.[0];
  const functionCalls = candidate?.content?.parts?.filter((p: any) => p.functionCall);

  if (!functionCalls || functionCalls.length === 0) return null;

  const functionResponses: any[] = [];
  for (const call of functionCalls) {
    const fnName = call.functionCall.name;
    const args = call.functionCall.args || {};

    if (fnName === "evaluate_offer_against_ceiling") {
      const p = Number(args.unit_price) || (offers[0]?.final_price_per_kg ?? 10);
      const check = evaluateOfferAgainstCeiling(p, ceiling);
      functionResponses.push({
        functionResponse: {
          name: "evaluate_offer_against_ceiling",
          response: check,
        },
      });
    } else if (fnName === "compute_counter_quantity") {
      const cur = Number(args.current_ask) || neededQuantity;
      const def = Number(args.deficit) || neededQuantity;
      const counterQty = computeCounterQuantity(cur, def, defaultBuyerNegotiationPolicy);
      functionResponses.push({
        functionResponse: {
          name: "compute_counter_quantity",
          response: { counterQty },
        },
      });
    } else if (fnName === "propose_accept") {
      const matchedOffer = offers.find((o) => o.seller_id === args.seller_id) || offers[0];
      return {
        action: "propose_accept",
        target_offer: matchedOffer,
        rationale:
          args.rationale ||
          `Proposed acceptance for ${matchedOffer.quantity_kg} units from ${matchedOffer.seller_id} at total ₹${matchedOffer.total_price}.`,
      };
    } else if (fnName === "send_counter") {
      return {
        action: "send_counter",
        counter: {
          item: args.item || neededItem,
          quantity_kg: Number(args.counter_quantity_kg) || neededQuantity,
          buyer_max_price_per_kg: Number(args.target_price_per_kg) || ceiling,
          target_seller_id: args.seller_id,
        },
        reason: args.reason || "Counter-offer proposed to fit budget limits.",
      };
    }
  }

  if (functionResponses.length > 0) {
    contents.push(candidate.content);
    contents.push({
      role: "function",
      parts: functionResponses,
    });

    const res2 = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents, tools }),
      signal: AbortSignal.timeout(3500),
    });

    if (!res2.ok) return null;
    const data2 = await res2.json();
    const secondCalls = data2.candidates?.[0]?.content?.parts?.filter((p: any) => p.functionCall);
    const firstCall = secondCalls?.[0]?.functionCall;

    if (firstCall) {
      const name = firstCall.name;
      const args = firstCall.args || {};

      if (name === "propose_accept") {
        const matchedOffer = offers.find((o) => o.seller_id === args.seller_id) || offers[0];
        return {
          action: "propose_accept",
          target_offer: matchedOffer,
          rationale:
            args.rationale ||
            `Proposed acceptance for ${matchedOffer.quantity_kg} units from ${matchedOffer.seller_id} at total ₹${matchedOffer.total_price}.`,
        };
      } else if (name === "propose_split_accept") {
        let parsedSplits = [];
        try {
          parsedSplits =
            typeof args.splits_json === "string" ? JSON.parse(args.splits_json) : args.splits_json || [];
        } catch {
          parsedSplits = [];
        }
        const splitPayload: SplitAcceptPayload = {
          item: args.item || neededItem,
          total_quantity_kg: Number(args.total_quantity_kg) || neededQuantity,
          total_cost: Number(args.total_cost) || 0,
          splits: parsedSplits,
          rationale: args.rationale || `Split order across ${parsedSplits.length} sellers.`,
        };
        return {
          action: "propose_split_accept",
          split_payload: splitPayload,
          rationale: splitPayload.rationale,
        };
      } else if (name === "send_counter") {
        return {
          action: "send_counter",
          counter: {
            item: args.item || neededItem,
            quantity_kg: Number(args.counter_quantity_kg) || neededQuantity,
            buyer_max_price_per_kg: Number(args.target_price_per_kg) || ceiling,
            target_seller_id: args.seller_id,
          },
          reason: args.reason || "Counter-offer proposed to fit budget limits.",
        };
      }
    }
  }

  return null;
}

export function evaluateOffersDeterministically(
  offers: OfferPayload[],
  neededItem: string,
  neededQuantity: number,
  profile: RestaurantProfile
): BuyerDecision {
  const validOffers = offers.filter((o) => o.quantity_kg > 0);

  if (validOffers.length === 0) {
    return {
      action: "reject",
      reason: `No sellers with available stock for ${neededItem}.`,
    };
  }

  const ceiling = getBuyerCeiling(neededItem, profile.max_price_per_kg[neededItem]);

  // Determine best single offer
  // Prefer offers that can fully fulfill neededQuantity; if none, lowest unit price
  const fullyFulfilling = validOffers.filter((o) => o.quantity_kg >= neededQuantity);
  const bestSingle = fullyFulfilling.length > 0
    ? [...fullyFulfilling].sort((a, b) => a.final_price_per_kg - b.final_price_per_kg || a.total_price - b.total_price)[0]
    : [...validOffers].sort((a, b) => a.final_price_per_kg - b.final_price_per_kg || b.quantity_kg - a.quantity_kg)[0];

  // Check unit price ceiling violation on best single offer
  if (bestSingle.final_price_per_kg > ceiling) {
    const counterQty = computeCounterQuantity(bestSingle.quantity_kg, neededQuantity, defaultBuyerNegotiationPolicy);
    return {
      action: "send_counter",
      counter: {
        item: neededItem,
        quantity_kg: counterQty,
        buyer_max_price_per_kg: ceiling,
        target_seller_id: bestSingle.seller_id,
      },
      reason: `Best offered rate (₹${bestSingle.final_price_per_kg}/kg) exceeds price ceiling of ₹${ceiling}/kg. Countered with ${counterQty} units to reach volume tier.`,
    };
  }

  // Check substantial overspend on single transaction cap
  if (bestSingle.total_price > profile.per_transaction_cap * 1.5) {
    const reducedQty = Math.max(1, Math.floor(profile.per_transaction_cap / bestSingle.final_price_per_kg));
    return {
      action: "send_counter",
      counter: {
        item: neededItem,
        quantity_kg: reducedQty,
        buyer_max_price_per_kg: ceiling,
        target_seller_id: bestSingle.seller_id,
      },
      reason: `Total deal amount ₹${bestSingle.total_price} is substantially over budget cap (₹${profile.per_transaction_cap}). Countering with ${reducedQty} units.`,
    };
  }

  // Split-deal evaluation across multi-sellers using allocateSplitAccept
  let bestSplit: SplitAcceptPayload | null = null;
  if (validOffers.length >= 2) {
    const { allocation, unmetQuantity } = allocateSplitAccept(neededQuantity, validOffers);

    // If allocation spans across 2 or more sellers, evaluate whether multi-seller split is advantageous
    if (allocation.length >= 2) {
      const splitTotalCost = Number(allocation.reduce((sum, line) => sum + line.cost, 0).toFixed(2));
      const splitTotalQty = allocation.reduce((sum, line) => sum + line.quantity, 0);

      // Check if split deal is required (no single seller had enough stock)
      // OR if split deal saves cost compared to single vendor procurement
      const singleCanFulfill = bestSingle.quantity_kg >= neededQuantity;
      const singleCostForNeeded = Number((bestSingle.final_price_per_kg * neededQuantity).toFixed(2));

      const isAdvantageous = !singleCanFulfill || splitTotalCost < singleCostForNeeded || splitTotalCost < bestSingle.total_price;

      if (isAdvantageous) {
        const splitLinesSummary = allocation.map((a) => `${a.quantity}u from ${a.sellerId}`).join(" + ");
        const savingsText = singleCanFulfill
          ? `, saving ₹${(singleCostForNeeded - splitTotalCost).toFixed(2)} over single-vendor procurement`
          : `, overcoming single-vendor stock limits (max single stock was ${bestSingle.quantity_kg}u)`;
        const shortfallText = unmetQuantity > 0 ? ` [Sourcing Shortfall: ${unmetQuantity}u unmet]` : "";

        bestSplit = {
          item: neededItem,
          total_quantity_kg: splitTotalQty,
          total_cost: splitTotalCost,
          splits: allocation.map((line) => ({
            seller_id: line.sellerId,
            item: neededItem,
            quantity_kg: line.quantity,
            unit_price: line.unitPrice,
            total_price: line.cost,
          })),
          unmet_quantity_kg: unmetQuantity > 0 ? unmetQuantity : undefined,
          rationale: `Split order (${splitLinesSummary}) yields total ₹${splitTotalCost}${savingsText} within verified seller stocks${shortfallText}.`,
        };
      }
    }
  }

  // Handle Upsell / Bundle Evaluation
  let acceptedUpsell: UpsellItem | undefined;
  let declinedUpsellReason: string | undefined;

  for (const off of validOffers) {
    if (off.upsell_item) {
      const itemKey = off.upsell_item.item.toLowerCase().trim();
      const isItemInMenu = VALID_MENU_INGREDIENTS.has(itemKey);

      if (!isItemInMenu) {
        declinedUpsellReason = `Declined unsolicited upsell of "${off.upsell_item.item}" because it is not used in any RazorSlice pizza recipe.`;
      } else {
        const upsellTotal = off.upsell_item.quantity_kg * off.upsell_item.unit_price;
        if (bestSingle.total_price + upsellTotal <= profile.per_transaction_cap) {
          acceptedUpsell = off.upsell_item;
        } else {
          declinedUpsellReason = `Declined upsell of "${off.upsell_item.item}" to avoid exceeding transaction budget cap of ₹${profile.per_transaction_cap}.`;
        }
      }
    }
  }

  if (bestSplit) {
    return {
      action: "propose_split_accept",
      split_payload: bestSplit,
      rationale: bestSplit.rationale,
      accepted_upsell: acceptedUpsell,
      declined_upsell_reason: declinedUpsellReason,
    };
  }

  let rationale = "";
  const sortedOffers = [...validOffers].sort((a, b) => a.total_price - b.total_price);
  if (sortedOffers.length > 1) {
    const nextBest = sortedOffers.find((o) => o.seller_id !== bestSingle.seller_id) || sortedOffers[1];
    const diff = (nextBest.total_price - bestSingle.total_price).toFixed(2);
    rationale = `Selected ${bestSingle.seller_id || "vendor"} among ${sortedOffers.length} competing supplier quotes: ${bestSingle.quantity_kg}u at ₹${bestSingle.final_price_per_kg}/unit (Total ₹${bestSingle.total_price}, ${bestSingle.discount_pct}% discount). Saves ₹${diff} over alternative quote from ${nextBest.seller_id} and clears our ₹${ceiling.toFixed(2)}/unit ceiling rule.`;
  } else {
    rationale = `Selected ${bestSingle.seller_id || "vendor"}: ${bestSingle.quantity_kg}u ${neededItem} at ₹${bestSingle.final_price_per_kg}/unit (Total ₹${bestSingle.total_price}${bestSingle.discount_pct > 0 ? `, ${bestSingle.discount_pct}% volume tier discount` : ""}). Rate complies with ₹${ceiling.toFixed(2)}/unit budget ceiling.`;
  }

  return {
    action: "propose_accept",
    target_offer: bestSingle,
    rationale,
    accepted_upsell: acceptedUpsell,
    declined_upsell_reason: declinedUpsellReason,
  };
}

export interface CachedSellerCatalog {
  seller_id: string;
  name: string;
  stocked_items: string[];
  base_prices: Record<string, { base_price: number; unit?: string }>;
  discount_tiers: Record<string, { min_quantity: number; discount_pct: number }[]>;
  negotiable: boolean;
  description: string;
  cached_at: string;
}

/**
 * Buyer Catalog Discovery & Caching Service
 * 
 * Per my-files/catalog-discovery.md:
 * 1. At session start, the buyer agent discovers and caches all known sellers' Agent Cards,
 *    base price sheets, and published volume-discount tiers ("what pricing is possible").
 * 2. Crucial split: Tier structures and base prices are cached, but stock levels are NEVER
 *    cached as decision-grade data. Live stock is always re-queried dynamically at the exact
 *    moment of an actual RFQ to eliminate stale-data issues.
 */
export class BuyerCatalogService {
  private static cachedCatalogs: CachedSellerCatalog[] | null = null;

  /**
   * Discovers all known sellers via Agent Cards and caches their published tier structures & base prices.
   */
  static discoverAndCacheCatalogs(): CachedSellerCatalog[] {
    const cards = InventoryStore.getAgentCards();
    const cached: CachedSellerCatalog[] = cards.map((card) => {
      const basePrices: Record<string, { base_price: number; unit?: string }> = {};
      for (const [item, info] of Object.entries(card.catalog)) {
        basePrices[item] = {
          base_price: info.base_price,
          unit: info.unit,
        };
      }
      return {
        seller_id: card.agent_id,
        name: card.name,
        stocked_items: [...card.stocked_items],
        base_prices: basePrices,
        discount_tiers: card.discount_tiers ? JSON.parse(JSON.stringify(card.discount_tiers)) : {},
        negotiable: card.negotiable,
        description: card.description,
        cached_at: new Date().toISOString(),
      };
    });
    BuyerCatalogService.cachedCatalogs = cached;
    return cached;
  }

  /**
   * Returns cached seller catalogs, auto-discovering if not yet initialized.
   */
  static getCachedCatalogs(): CachedSellerCatalog[] {
    if (!BuyerCatalogService.cachedCatalogs) {
      return BuyerCatalogService.discoverAndCacheCatalogs();
    }
    return BuyerCatalogService.cachedCatalogs;
  }

  /**
   * Discovers matching sellers for a specific deficit item from the cached catalog.
   */
  static getCachedSellersForItem(item: string): CachedSellerCatalog[] {
    const catalogs = BuyerCatalogService.getCachedCatalogs();
    const norm = normalizeIngredientKey(item);
    return catalogs.filter((c) =>
      c.stocked_items.some(
        (si) =>
          normalizeIngredientKey(si) === norm ||
          si.toLowerCase().includes(item.toLowerCase()) ||
          item.toLowerCase().includes(si.toLowerCase())
      )
    );
  }

  /**
   * Retrieves published discount tiers for a specific seller and item.
   */
  static getTierStructure(
    sellerId: string,
    item: string
  ): { min_quantity: number; discount_pct: number }[] {
    const catalogs = BuyerCatalogService.getCachedCatalogs();
    const normalizedSeller = InventoryStore.normalizeSellerId(sellerId);
    const cleanSeller = sellerId.toLowerCase().replace(/[^a-z0-9]/g, "");
    const seller = catalogs.find((c) => {
      const cNorm = InventoryStore.normalizeSellerId(c.seller_id);
      const cClean = c.seller_id.toLowerCase().replace(/[^a-z0-9]/g, "");
      return (
        cNorm === normalizedSeller ||
        cClean === cleanSeller ||
        c.seller_id.toLowerCase() === sellerId.toLowerCase() ||
        c.name.toLowerCase() === sellerId.toLowerCase()
      );
    });
    if (!seller || !seller.discount_tiers) return [];

    const norm = normalizeIngredientKey(item);
    const tierKey = Object.keys(seller.discount_tiers).find(
      (k) => normalizeIngredientKey(k) === norm || k.toLowerCase() === item.toLowerCase()
    );
    return tierKey ? seller.discount_tiers[tierKey] : [];
  }

  /**
   * Clears the in-memory catalog cache (e.g. for testing or system reset).
   */
  static clearCache(): void {
    BuyerCatalogService.cachedCatalogs = null;
  }
}

export async function buyerEvaluateOffer(
  offer: OfferPayload,
  profile: RestaurantProfile,
  allOffers?: OfferPayload[],
  requestedQuantity?: number
): Promise<BuyerDecision> {
  const offersToCompare = allOffers && allOffers.length > 0 ? allOffers : [offer];
  const agentCards = InventoryStore.getAgentCards();
  const neededItem = offer.item;
  const neededQuantity = requestedQuantity ?? offer.requested_quantity_kg ?? offer.quantity_kg;

  if (process.env.NODE_ENV !== "test") {
    const geminiKeys = getGeminiKeys();
    for (let i = 0; i < geminiKeys.length; i++) {
      try {
        const decision = await callGemini(
          geminiKeys[i],
          offersToCompare,
          profile,
          agentCards,
          neededItem,
          neededQuantity
        );
        if (decision) return decision;
      } catch (err: any) {
        console.warn(`[BuyerAgent] Gemini key #${i + 1} attempt failed: ${err.message}`);
      }
    }
  }

  return evaluateOffersDeterministically(offersToCompare, neededItem, neededQuantity, profile);
}

export function chooseProcurementOptionDeterministically(
  options: ProcurementOption[]
): { chosen_option: ProcurementOption; reasoning: string } {
  if (options.length === 0) {
    throw new Error("Cannot choose from empty procurement options");
  }

  // 1. If wait is available and consumption rate is very low (<= 0.3u/tick), prefer deferring
  const waitOption = options.find((o) => o.option_id === "wait");
  const consumptionRate = Number(waitOption?.reasoning_facts.consumption_rate || 0);
  if (waitOption && consumptionRate <= 0.3) {
    return {
      chosen_option: waitOption,
      reasoning: `Selected wait: low consumption rate (${consumptionRate}u/tick) projects ${waitOption.reasoning_facts.projected_stock_in_n_ticks}u remaining in ${waitOption.reasoning_facts.safe_wait_ticks} ticks, safely above ${waitOption.reasoning_facts.safety_floor}u floor.`,
    };
  }

  // 2. Look for a bulk tier option with significant discount (e.g. >= 10%)
  const tierOption = options.find(
    (o) => o.option_id.startsWith("buy_to_tier") && (o.discount_pct || 0) >= 10
  );
  if (tierOption) {
    const savings = tierOption.reasoning_facts.unit_savings_vs_minimal;
    return {
      chosen_option: tierOption,
      reasoning: `Selected ${tierOption.option_id} (${tierOption.quantity}u at ₹${tierOption.unit_price}/unit): unlocks ${tierOption.discount_pct}% volume discount tier, saving ₹${savings}/unit over minimal restock while staying within target bounds.`,
    };
  }

  // 3. Default to minimal restock
  const minimalOption = options.find((o) => o.option_id === "buy_minimal") || options[0];
  return {
    chosen_option: minimalOption,
    reasoning: `Selected buy_minimal: ordering ${minimalOption.quantity}u ${minimalOption.item} to restore stock from ${minimalOption.reasoning_facts.current_stock}u to ${minimalOption.reasoning_facts.target_stock}u target at ₹${minimalOption.unit_price}/unit.`,
  };
}

export async function chooseProcurementOption(
  item: string,
  live: LivePantryState,
  profile?: RestaurantProfile
): Promise<{
  chosen_option: ProcurementOption;
  reasoning: string;
  all_options: ProcurementOption[];
  is_flagged: boolean;
  unexplained_numbers: number[];
}> {
  const options = computeProcurementOptions(item, live);

  if (process.env.NODE_ENV !== "test") {
    const geminiKeys = getGeminiKeys();
    const tools = [
      {
        functionDeclarations: [
          {
            name: "choose_procurement_option",
            description:
              "Select optimal procurement path from locked enum. Cite ONLY values present in reasoning_facts.",
            parameters: {
              type: "OBJECT",
              properties: {
                option_id: {
                  type: "STRING",
                  enum: options.map((o) => o.option_id),
                },
                reasoning: {
                  type: "STRING",
                  description:
                    "Plain-language explanation for audit trail. MUST cite ONLY values from reasoning_facts.",
                },
              },
              required: ["option_id", "reasoning"],
            },
          },
        ],
      },
    ];

    const contents = [
      {
        role: "user",
        parts: [
          {
            text: `You are the RazorSlice procurement strategist. Evaluate the pre-computed deterministic options for "${item}":\n\nOptions & Ground-Truth Facts:\n${JSON.stringify(
              options,
              null,
              2
            )}\n\nCall \`choose_procurement_option\` with your selected option_id and reasoning. You MUST cite ONLY facts provided in reasoning_facts.`,
          },
        ],
      },
    ];

    for (let i = 0; i < geminiKeys.length; i++) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKeys[i]}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents, tools }),
          signal: AbortSignal.timeout(3500),
        });

        if (res.ok) {
          const data = await res.json();
          const call = data.candidates?.[0]?.content?.parts?.find(
            (p: any) => p.functionCall?.name === "choose_procurement_option"
          );

          if (call) {
            const selectedId = call.functionCall.args?.option_id;
            const reasoning = call.functionCall.args?.reasoning || "";
            const chosen = options.find((o) => o.option_id === selectedId) || options[0];

            const validation = validateReasoningNumbers(reasoning, chosen.reasoning_facts);

            return {
              chosen_option: chosen,
              reasoning,
              all_options: options,
              is_flagged: !validation.isValid,
              unexplained_numbers: validation.unexplained,
            };
          }
        }
      } catch (err: any) {
        console.warn(`[BuyerAgent:Options] Gemini key #${i + 1} attempt failed: ${err.message}`);
      }
    }
  }

  const fallback = chooseProcurementOptionDeterministically(options);
  const validation = validateReasoningNumbers(
    fallback.reasoning,
    fallback.chosen_option.reasoning_facts
  );

  return {
    chosen_option: fallback.chosen_option,
    reasoning: fallback.reasoning,
    all_options: options,
    is_flagged: !validation.isValid,
    unexplained_numbers: validation.unexplained,
  };
}

export class BuyerAgent {
  static evaluateOffer = buyerEvaluateOffer;
  static evaluateOffersDeterministically = evaluateOffersDeterministically;
  static discoverAndCacheCatalogs = BuyerCatalogService.discoverAndCacheCatalogs;
  static getCachedCatalogs = BuyerCatalogService.getCachedCatalogs;
  static getCachedSellersForItem = BuyerCatalogService.getCachedSellersForItem;
  static getTierStructure = BuyerCatalogService.getTierStructure;
  static clearCache = BuyerCatalogService.clearCache;
  static computeProcurementOptions = computeProcurementOptions;
  static chooseProcurementOption = chooseProcurementOption;
  static chooseProcurementOptionDeterministically = chooseProcurementOptionDeterministically;
  static validateReasoningNumbers = validateReasoningNumbers;
  static DeferredDecisions = DeferredDecisionStore;
  static checkDeferredDecisions = checkDeferredDecisions;
  static allocateSplitAccept = allocateSplitAccept;
}

export { allocateSplitAccept, AllocationLine };
export default BuyerAgent;
