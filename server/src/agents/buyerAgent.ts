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
  const directKeys = raw.split(",").map((k) => k.trim()).filter((k) => k.length > 10);
  if (process.env.GEMINI_API_KEY_1) directKeys.push(process.env.GEMINI_API_KEY_1.trim());
  if (process.env.GEMINI_API_KEY_2) directKeys.push(process.env.GEMINI_API_KEY_2.trim());
  return Array.from(new Set(directKeys));
}

export const RAZORSLICE_MENU = {
  margherita: { flour: 2, cheese: 2, tomato: 1 },
  farm_fresh: { flour: 2, cheese: 1, tomato: 1, onion: 2 },
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

  const tools = [
    {
      functionDeclarations: [
        {
          name: "fetch_agent_cards",
          description: "Retrieve official Agent Cards of all known wholesale sellers in the A2A network.",
          parameters: { type: "OBJECT", properties: {} },
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
          description: "Send an adjusted counter offer to a seller.",
          parameters: {
            type: "OBJECT",
            properties: {
              seller_id: { type: "STRING" },
              item: { type: "STRING" },
              counter_quantity_kg: { type: "NUMBER" },
              target_price_per_kg: { type: "NUMBER" },
              reason: { type: "STRING" },
            },
            required: ["seller_id", "reason"],
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
          text: `${BUYER_SYSTEM_PROMPT}\n\nTarget Item: "${neededItem}", Deficit Quantity: ${neededQuantity} units.\nKnown Sellers Agent Cards: ${JSON.stringify(
            agentCards
          )}.\nReceived Seller Quotes: ${JSON.stringify(
            offers
          )}.\nRestaurant Profile: ${JSON.stringify(
            profile
          )}.\nMenu Recipes: ${JSON.stringify(
            RAZORSLICE_MENU
          )}.\n\nCompare offers and call propose_accept, propose_split_accept, or send_counter.`,
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
  const functionCalls = data.candidates?.[0]?.content?.parts?.filter((p: any) => p.functionCall);

  if (!functionCalls || functionCalls.length === 0) return null;

  const firstCall = functionCalls[0].functionCall;
  const name = firstCall.name;
  const args = firstCall.args || {};

  if (name === "propose_accept") {
    const matchedOffer = offers.find((o) => o.seller_id === args.seller_id) || offers[0];
    return {
      action: "propose_accept",
      target_offer: {
        ...matchedOffer,
        final_price_per_kg: Number(args.final_price_per_kg) || matchedOffer?.final_price_per_kg,
        total_price: Number(args.total_price) || matchedOffer?.total_price,
      },
      rationale:
        args.rationale ||
        `Proposed acceptance for ${args.quantity_kg || neededQuantity} units from ${args.seller_id} at total ₹${args.total_price}.`,
    };
  } else if (name === "propose_split_accept") {
    let parsedSplits = [];
    try {
      parsedSplits = typeof args.splits_json === "string" ? JSON.parse(args.splits_json) : args.splits_json || [];
    } catch {
      parsedSplits = [];
    }

    const splitPayload: SplitAcceptPayload = {
      item: args.item || neededItem,
      total_quantity_kg: Number(args.total_quantity_kg) || neededQuantity,
      total_cost: Number(args.total_cost) || 0,
      splits: parsedSplits,
      rationale: args.rationale || `Split order across ${parsedSplits.length} sellers to minimize total cost.`,
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
        buyer_max_price_per_kg: Number(args.target_price_per_kg) || profile.max_price_per_kg[neededItem] || 35,
        target_seller_id: args.seller_id,
      },
      reason: args.reason || "Counter-offer proposed to fit budget limits.",
    };
  }

  return null;
}

export function evaluateOffersDeterministically(
  offers: OfferPayload[],
  neededItem: string,
  neededQuantity: number,
  profile: RestaurantProfile
): BuyerDecision {
  if (!offers || offers.length === 0) {
    return {
      action: "reject",
      reason: `No sellers available for ${neededItem}.`,
    };
  }

  // Check unit price ceiling violation
  const ceiling = profile.max_price_per_kg[neededItem] || 35;
  const single = offers[0];

  if (single.final_price_per_kg > ceiling) {
    return {
      action: "send_counter",
      counter: {
        item: neededItem,
        quantity_kg: neededQuantity,
        buyer_max_price_per_kg: ceiling,
      },
      reason: `Offered rate (₹${single.final_price_per_kg}/kg) exceeds price ceiling of ₹${ceiling}/kg. Countered with ceiling price.`,
    };
  }

  // Check substantial overspend
  if (single.total_price > profile.per_transaction_cap * 1.5) {
    const reducedQty = Math.floor(profile.per_transaction_cap / single.final_price_per_kg);
    return {
      action: "send_counter",
      counter: {
        item: neededItem,
        quantity_kg: reducedQty,
        buyer_max_price_per_kg: ceiling,
      },
      reason: `Total deal amount ₹${single.total_price} is substantially over budget cap (₹${profile.per_transaction_cap}). Countering with ${reducedQty}kg.`,
    };
  }

  const sortedOffers = [...offers].sort((a, b) => a.total_price - b.total_price);
  const bestSingle = sortedOffers[0];

  let bestSplit: SplitAcceptPayload | null = null;
  if (offers.length >= 2 && neededQuantity > 3) {
    const splitQty1 = Math.ceil(neededQuantity * 0.6);
    const splitQty2 = neededQuantity - splitQty1;
    const seller1 = offers[0];
    const seller2 = offers[1];

    const cost1 = Number((seller1.final_price_per_kg * splitQty1).toFixed(2));
    const cost2 = Number((seller2.final_price_per_kg * splitQty2).toFixed(2));
    const splitTotal = Number((cost1 + cost2).toFixed(2));

    if (splitTotal < bestSingle.total_price) {
      bestSplit = {
        item: neededItem,
        total_quantity_kg: neededQuantity,
        total_cost: splitTotal,
        splits: [
          {
            seller_id: seller1.seller_id || "agent:seller:razor_pies",
            item: neededItem,
            quantity_kg: splitQty1,
            unit_price: seller1.final_price_per_kg,
            total_price: cost1,
          },
          {
            seller_id: seller2.seller_id || "agent:seller:razorcery_1",
            item: neededItem,
            quantity_kg: splitQty2,
            unit_price: seller2.final_price_per_kg,
            total_price: cost2,
          },
        ],
        rationale: `Split order (${splitQty1}u from ${seller1.seller_id} + ${splitQty2}u from ${seller2.seller_id}) yields total ₹${splitTotal}, saving ₹${Number((bestSingle.total_price - splitTotal).toFixed(2))} over single-vendor procurement.`,
      };
    }
  }

  let acceptedUpsell: UpsellItem | undefined;
  let declinedUpsellReason: string | undefined;

  for (const off of offers) {
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

  return {
    action: "propose_accept",
    target_offer: bestSingle,
    rationale: `Selected ${bestSingle.seller_id || "vendor"} offering ${bestSingle.quantity_kg} units at ₹${bestSingle.final_price_per_kg}/unit (Total: ₹${bestSingle.total_price}) with ${bestSingle.discount_pct}% discount.`,
    accepted_upsell: acceptedUpsell,
    declined_upsell_reason: declinedUpsellReason,
  };
}

export async function buyerEvaluateOffer(
  offer: OfferPayload,
  profile: RestaurantProfile,
  allOffers?: OfferPayload[]
): Promise<BuyerDecision> {
  const offersToCompare = allOffers && allOffers.length > 0 ? allOffers : [offer];
  const agentCards = InventoryStore.getAgentCards();
  const neededItem = offer.item;
  const neededQuantity = offer.quantity_kg;

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

export class BuyerAgent {
  static evaluateOffer = buyerEvaluateOffer;
  static evaluateOffersDeterministically = evaluateOffersDeterministically;
}

export default BuyerAgent;
