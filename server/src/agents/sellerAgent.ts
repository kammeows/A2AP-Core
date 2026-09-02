import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RfqPayload, OfferPayload, UpsellItem } from "../types/domain.js";
import { InventoryStore } from "../inventory/inventoryStore.js";
import {
  computeSellerOffer,
  checkBundleOpportunity,
  SellerOffer,
} from "./pricingEngine.js";
import { SELLER_SYSTEM_PROMPT } from "./prompts.js";

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

async function callGemini(
  apiKey: string,
  rfq: RfqPayload,
  sellerId: string,
  tomorrow: string,
  expiresAt: string,
): Promise<OfferPayload | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const sellerCard = InventoryStore.getSellerCard(sellerId);
  const catalogContext = sellerCard ? JSON.stringify(sellerCard) : "{}";
  const state = InventoryStore.getSellerItemState(sellerId, rfq.item);

  if (!state || state.stock <= 0) {
    return null; // Out of stock -- don't produce an offer
  }

  const tools = [
    {
      functionDeclarations: [
        {
          name: "get_stock",
          description: "Check current available stock for a seller's item.",
          parameters: {
            type: "OBJECT",
            properties: {
              item: { type: "STRING" },
            },
            required: ["item"],
          },
        },
        {
          name: "compute_offer",
          description:
            "Compute the deterministic wholesale offer (price, volume tier discount, stock clamping).",
          parameters: {
            type: "OBJECT",
            properties: {
              item: { type: "STRING" },
              requested_qty: { type: "NUMBER" },
            },
            required: ["item", "requested_qty"],
          },
        },
        {
          name: "check_bundle_opportunity",
          description:
            "Check if an overstocked pairing exists to offer as a bundle add-on.",
          parameters: {
            type: "OBJECT",
            properties: {
              item: { type: "STRING" },
            },
            required: ["item"],
          },
        },
        {
          name: "make_offer",
          description:
            "Submit official wholesale offer using EXACT tool numbers.",
          parameters: {
            type: "OBJECT",
            properties: {
              item: { type: "STRING" },
              quantity: { type: "NUMBER" },
              unit_price: { type: "NUMBER" },
              discount_pct: { type: "NUMBER" },
              total_price: { type: "NUMBER" },
              rationale: { type: "STRING" },
              upsell_item_name: { type: "STRING" },
              upsell_quantity: { type: "NUMBER" },
              upsell_price: { type: "NUMBER" },
              upsell_discount_pct: { type: "NUMBER" },
              upsell_reason: { type: "STRING" },
            },
            required: [
              "item",
              "quantity",
              "unit_price",
              "total_price",
              "rationale",
            ],
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
          text: `${SELLER_SYSTEM_PROMPT}\n\nYou represent Seller ID: "${sellerId}". Catalog: ${catalogContext}.\n\nReceived Purchase Request: ${JSON.stringify(
            rfq,
          )}.\nCall \`get_stock\` and \`compute_offer\` to compute the exact offer, then respond via \`make_offer\` with an explainable rationale.`,
        },
      ],
    },
  ];

  let lastComputedOffer: SellerOffer = computeSellerOffer(
    state,
    rfq.quantity_kg,
  );
  let lastBundle: ReturnType<typeof checkBundleOpportunity> = null;

  const res1 = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents, tools }),
    signal: AbortSignal.timeout(3500),
  });

  if (!res1.ok) return null;
  const data1 = await res1.json();
  const candidate = data1.candidates?.[0];
  const functionCalls = candidate?.content?.parts?.filter(
    (p: any) => p.functionCall,
  );

  if (!functionCalls || functionCalls.length === 0) return null;

  const functionResponses: any[] = [];
  for (const call of functionCalls) {
    const fnName = call.functionCall.name;
    const args = call.functionCall.args || {};

    if (fnName === "get_stock") {
      functionResponses.push({
        functionResponse: {
          name: "get_stock",
          response: { stock: state.stock, item: state.item },
        },
      });
    } else if (fnName === "compute_offer") {
      const q = Number(args.requested_qty) || rfq.quantity_kg;
      lastComputedOffer = computeSellerOffer(state, q);
      functionResponses.push({
        functionResponse: {
          name: "compute_offer",
          response: { output: lastComputedOffer },
        },
      });
    } else if (fnName === "check_bundle_opportunity") {
      const pairedState = state.pairedItem
        ? InventoryStore.getSellerItemState(sellerId, state.pairedItem) ||
          undefined
        : undefined;
      lastBundle = checkBundleOpportunity(state, pairedState);
      functionResponses.push({
        functionResponse: {
          name: "check_bundle_opportunity",
          response: { output: lastBundle },
        },
      });
    } else if (fnName === "make_offer") {
      // Gemini called make_offer directly
      const off = args;
      const fulfillableQty = lastComputedOffer.offeredQty;
      if (fulfillableQty <= 0) return null;

      let upsell: UpsellItem | undefined;
      if (off.upsell_item_name && off.upsell_price) {
        upsell = {
          item: off.upsell_item_name,
          quantity_kg: Number(off.upsell_quantity) || 2,
          unit_price: Number(off.upsell_price),
          discount_pct: Number(off.upsell_discount_pct) || 10,
          reason: off.upsell_reason || "Surplus bundle discount",
        };
      } else if (lastBundle) {
        upsell = {
          item: lastBundle.pairedItem,
          quantity_kg: lastBundle.quantity,
          unit_price: lastBundle.unitPrice,
          discount_pct: lastBundle.discountPct,
          reason: lastBundle.reason,
        };
      }

      return {
        seller_id: sellerId,
        item: lastComputedOffer.item,
        quantity_kg: fulfillableQty,
        quality: rfq.quality_min || "Grade A",
        base_price_per_kg: state.basePrice,
        discount_pct: lastComputedOffer.discountPct,
        discount_reason: lastComputedOffer.reason,
        final_price_per_kg: lastComputedOffer.unitPrice,
        total_price: lastComputedOffer.totalPrice,
        delivery_by: tomorrow,
        offer_expires: expiresAt,
        rationale: off.rationale,
        // ||
        // `Offered ${fulfillableQty}u ${lastComputedOffer.item} at ₹${lastComputedOffer.unitPrice}/unit (${lastComputedOffer.reason}).`,
        upsell_item: upsell,
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
    const secondCalls = data2.candidates?.[0]?.content?.parts?.filter(
      (p: any) => p.functionCall,
    );
    const offerCall = secondCalls?.find(
      (p: any) => p.functionCall.name === "make_offer",
    );

    if (offerCall) {
      const off = offerCall.functionCall.args;
      const fulfillableQty = lastComputedOffer.offeredQty;
      if (fulfillableQty <= 0) return null;

      let upsell: UpsellItem | undefined;
      if (off.upsell_item_name && off.upsell_price) {
        upsell = {
          item: off.upsell_item_name,
          quantity_kg: Number(off.upsell_quantity) || 2,
          unit_price: Number(off.upsell_price),
          discount_pct: Number(off.upsell_discount_pct) || 10,
          reason: off.upsell_reason || "Surplus bundle discount",
        };
      } else if (lastBundle) {
        upsell = {
          item: lastBundle.pairedItem,
          quantity_kg: lastBundle.quantity,
          unit_price: lastBundle.unitPrice,
          discount_pct: lastBundle.discountPct,
          reason: lastBundle.reason,
        };
      }

      return {
        seller_id: sellerId,
        item: lastComputedOffer.item,
        quantity_kg: fulfillableQty,
        quality: rfq.quality_min || "Grade A",
        base_price_per_kg: state.basePrice,
        discount_pct: lastComputedOffer.discountPct,
        discount_reason: lastComputedOffer.reason,
        final_price_per_kg: lastComputedOffer.unitPrice,
        total_price: lastComputedOffer.totalPrice,
        delivery_by: tomorrow,
        offer_expires: expiresAt,
        rationale:
          off.rationale ||
          `Offered ${fulfillableQty}u ${lastComputedOffer.item} at ₹${lastComputedOffer.unitPrice}/unit (${lastComputedOffer.reason}).`,
        upsell_item: upsell,
      };
    }
  }

  return null;
}

/**
 * Deterministically generates professional, business-grade seller rationale
 * explaining why specific pricing, volume tiers, or stock constraints apply.
 */
export function generateSellerRationale(
  sellerName: string,
  item: string,
  requestedQty: number,
  offeredQty: number,
  basePrice: number,
  finalPrice: number,
  discountPct: number,
  stock: number,
  reason: string,
  targetPrice?: number
): string {
  if (offeredQty <= 0 || stock <= 0) {
    return `${sellerName}: Zero inventory available for ${item} (0u in stock). Quote declined to prevent unfulfillable commitments.`;
  }

  const isStockLimited = offeredQty < requestedQty;
  const isDiscounted = discountPct > 0;

  if (isStockLimited) {
    return `${sellerName}: Inventory constrained to ${offeredQty}u ${item} (requested ${requestedQty}u). Quoting partial fulfillment of all available ${offeredQty}u at ₹${finalPrice.toFixed(2)}/unit${isDiscounted ? ` with ${discountPct}% volume tier discount applied` : ` at base catalog rate`}.`;
  }

  if (isDiscounted) {
    const savingsPerUnit = (basePrice - finalPrice).toFixed(2);
    return `${sellerName}: Order of ${offeredQty}u ${item} qualifies for our ${discountPct}% volume discount tier (saving ₹${savingsPerUnit}/u off ₹${basePrice.toFixed(2)} list price, net ₹${finalPrice.toFixed(2)}/unit). Fully backed by ${stock}u on-hand inventory.`;
  }

  const norm = item.toLowerCase().trim().replace(/s$/, "");
  const nextTier = norm === "flour" ? (sellerName.includes("RazorPies") ? 10 : 5) : norm === "cheese" ? 5 : norm === "tomato" || norm === "onion" ? 4 : 3;
  const unitsNeededForTier = Math.max(1, nextTier - offeredQty);

  if (targetPrice && targetPrice < basePrice) {
    return `${sellerName}: Buyer requested target price ₹${targetPrice.toFixed(2)}/unit. Standard catalog rate of ₹${basePrice.toFixed(2)}/unit applies for ${offeredQty}u ${item}; increase order size by +${unitsNeededForTier}u (to ${nextTier}u) to unlock our wholesale volume tier.`;
  }

  return `${sellerName}: Standard catalog rate of ₹${basePrice.toFixed(2)}/unit applies for ${offeredQty}u ${item} (order size is below our ${nextTier}u wholesale volume tier threshold). Verified with ${stock}u warehouse stock.`;
}

export async function sellerRespondToRfq(
  rfq: RfqPayload,
  sellerId: string = "agent:seller:razor_pies",
): Promise<OfferPayload> {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();

  if (process.env.NODE_ENV !== "test") {
    const geminiKeys = getGeminiKeys();
    for (let i = 0; i < geminiKeys.length; i++) {
      try {
        const offer = await callGemini(
          geminiKeys[i],
          rfq,
          sellerId,
          tomorrow,
          expiresAt,
        );
        if (offer) return offer;
      } catch (err: any) {
        console.warn(
          `[SellerAgent:${sellerId}] Gemini key #${i + 1} failed: ${err.message}`,
        );
      }
    }
  }

  const sellerCard = InventoryStore.getSellerCard(sellerId);
  const sellerName = sellerCard ? sellerCard.name : sellerId;
  const state = InventoryStore.getSellerItemState(sellerId, rfq.item);

  if (!state || state.stock <= 0) {
    return {
      seller_id: sellerId,
      item: rfq.item,
      quantity_kg: 0,
      quality: rfq.quality_min || "Grade A",
      base_price_per_kg: state ? state.basePrice : 10,
      discount_pct: 0,
      discount_reason: "out_of_stock",
      final_price_per_kg: state ? state.basePrice : 10,
      total_price: 0,
      delivery_by: tomorrow,
      offer_expires: expiresAt,
      rationale: `${sellerName}: 0 units of ${rfq.item} available in stock. Quote unavailable.`,
    };
  }

  const offer = computeSellerOffer(state, rfq.quantity_kg);
  const pairedState = state.pairedItem
    ? InventoryStore.getSellerItemState(sellerId, state.pairedItem) || undefined
    : undefined;
  const bundle = checkBundleOpportunity(state, pairedState);

  let upsell: UpsellItem | undefined;
  if (bundle) {
    upsell = {
      item: bundle.pairedItem,
      quantity_kg: bundle.quantity,
      unit_price: bundle.unitPrice,
      discount_pct: bundle.discountPct,
      reason: bundle.reason,
    };
  }

  const calculatedRationale = generateSellerRationale(
    sellerName,
    offer.item,
    rfq.quantity_kg,
    offer.offeredQty,
    state.basePrice,
    offer.unitPrice,
    offer.discountPct,
    state.stock,
    offer.reason,
    rfq.target_price_per_unit
  );

  return {
    seller_id: sellerId,
    item: offer.item,
    quantity_kg: offer.offeredQty,
    quality: rfq.quality_min || "Grade A",
    base_price_per_kg: state.basePrice,
    discount_pct: offer.discountPct,
    discount_reason: offer.reason,
    final_price_per_kg: offer.unitPrice,
    total_price: offer.totalPrice,
    delivery_by: tomorrow,
    offer_expires: expiresAt,
    rationale: calculatedRationale,
    upsell_item: upsell,
  };
}

export class SellerAgent {
  static respondToRfq = sellerRespondToRfq;
  static generateSellerRationale = generateSellerRationale;
}

export default SellerAgent;
