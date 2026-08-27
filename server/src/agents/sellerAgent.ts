import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RfqPayload, OfferPayload, UpsellItem } from "../types/domain.js";
import { InventoryStore } from "../inventory/inventoryStore.js";
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
  const directKeys = raw.split(",").map((k) => k.trim()).filter((k) => k.length > 10);
  if (process.env.GEMINI_API_KEY_1) directKeys.push(process.env.GEMINI_API_KEY_1.trim());
  if (process.env.GEMINI_API_KEY_2) directKeys.push(process.env.GEMINI_API_KEY_2.trim());
  return Array.from(new Set(directKeys));
}

function getGroqKey(): string | null {
  const k = process.env.GROQ_API_KEY?.trim();
  return k && k.length > 10 ? k : null;
}

async function callGemini(
  apiKey: string,
  rfq: RfqPayload,
  sellerId: string,
  tomorrow: string,
  expiresAt: string
): Promise<OfferPayload | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const sellerCard = InventoryStore.getSellerCard(sellerId);
  const catalogContext = sellerCard ? JSON.stringify(sellerCard) : "{}";

  const tools = [
    {
      functionDeclarations: [
        {
          name: "get_stock",
          description: "Check current available stock and volume discount tiers for a seller's item.",
          parameters: {
            type: "OBJECT",
            properties: {
              seller_id: { type: "STRING" },
              item: { type: "STRING" },
              quantity: { type: "NUMBER" },
            },
            required: ["seller_id", "item", "quantity"],
          },
        },
        {
          name: "make_offer",
          description: "Submit an official wholesale quote with explainable rationale and optional bundle upsell.",
          parameters: {
            type: "OBJECT",
            properties: {
              seller_id: { type: "STRING" },
              item: { type: "STRING" },
              quantity: { type: "NUMBER" },
              quality: { type: "STRING" },
              base_price: { type: "NUMBER" },
              discount_pct: { type: "NUMBER" },
              discount_reason: { type: "STRING" },
              final_price: { type: "NUMBER" },
              total_price: { type: "NUMBER" },
              rationale: { type: "STRING" },
              upsell_item_name: { type: "STRING" },
              upsell_quantity: { type: "NUMBER" },
              upsell_price: { type: "NUMBER" },
              upsell_discount_pct: { type: "NUMBER" },
              upsell_reason: { type: "STRING" },
            },
            required: ["item", "quantity", "final_price", "total_price", "rationale"],
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
          text: `${SELLER_SYSTEM_PROMPT}\n\nYou represent Seller ID: "${sellerId}". Your Catalog: ${catalogContext}.\n\nReceived RFQ: ${JSON.stringify(
            rfq
          )}.\nCall \`get_stock\` to check stock & pricing, then call \`make_offer\` with an explainable rationale.`,
        },
      ],
    },
  ];

  const res1 = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents, tools }),
    signal: AbortSignal.timeout(3500),
  });

  if (!res1.ok) return null;
  const data1 = await res1.json();
  const candidate = data1.candidates?.[0];
  const functionCalls = candidate?.content?.parts?.filter((p: any) => p.functionCall);

  if (!functionCalls || functionCalls.length === 0) return null;

  const stockCall = functionCalls.find((p: any) => p.functionCall.name === "get_stock");
  if (stockCall) {
    const args = stockCall.functionCall.args || {};
    const pricing = InventoryStore.computeSellerDiscount(
      args.seller_id || sellerId,
      args.item || rfq.item,
      Number(args.quantity) || rfq.quantity_kg
    );

    contents.push(candidate.content);
    contents.push({
      role: "function",
      parts: [
        {
          functionResponse: {
            name: "get_stock",
            response: { output: pricing },
          },
        },
      ],
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
    const offerCall = secondCalls?.find((p: any) => p.functionCall.name === "make_offer");

    if (offerCall) {
      const off = offerCall.functionCall.args;
      let upsell: UpsellItem | undefined;
      if (off.upsell_item_name && off.upsell_price) {
        upsell = {
          item: off.upsell_item_name,
          quantity_kg: Number(off.upsell_quantity) || 2,
          unit_price: Number(off.upsell_price),
          discount_pct: Number(off.upsell_discount_pct) || 10,
          reason: off.upsell_reason || "Surplus bundle discount",
        };
      }

      return {
        seller_id: sellerId,
        item: off.item || rfq.item,
        quantity_kg: Number(off.quantity) || rfq.quantity_kg,
        quality: off.quality || rfq.quality_min || "Grade A",
        base_price_per_kg: Number(off.base_price) || pricing.basePricePerUnit,
        discount_pct: Number(off.discount_pct) ?? pricing.discountPct,
        discount_reason: off.discount_reason || pricing.reason,
        final_price_per_kg: Number(off.final_price) || pricing.finalPricePerUnit,
        total_price: Number(off.total_price) || pricing.totalPrice,
        delivery_by: tomorrow,
        offer_expires: expiresAt,
        rationale:
          off.rationale ||
          `Offered ${off.item || rfq.item} at ₹${pricing.finalPricePerUnit}/unit (${pricing.discountPct}% ${pricing.reason}).`,
        upsell_item: upsell,
      };
    }
  }

  return null;
}

export async function sellerRespondToRfq(
  rfq: RfqPayload,
  sellerId: string = "agent:seller:razor_pies"
): Promise<OfferPayload> {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();

  if (process.env.NODE_ENV !== "test") {
    const geminiKeys = getGeminiKeys();
    for (let i = 0; i < geminiKeys.length; i++) {
      try {
        const offer = await callGemini(geminiKeys[i], rfq, sellerId, tomorrow, expiresAt);
        if (offer) return offer;
      } catch (err: any) {
        console.warn(`[SellerAgent:${sellerId}] Gemini key #${i + 1} failed: ${err.message}`);
      }
    }
  }

  // Legacy item compatibility
  if (
    rfq.item.toLowerCase() === "tomato" &&
    (!sellerId || sellerId === "agent:seller:veggie_vendor_09" || sellerId === "agent:seller:razor_pies")
  ) {
    const legacy = InventoryStore.computeDiscount("tomato", rfq.quantity_kg);
    return {
      item: "tomato",
      quantity_kg: rfq.quantity_kg,
      quality: rfq.quality_min || "Grade A",
      base_price_per_kg: legacy.basePricePerKg,
      discount_pct: legacy.discountPct,
      discount_reason: legacy.reason,
      final_price_per_kg: legacy.finalPricePerKg,
      total_price: legacy.totalPrice,
      delivery_by: tomorrow,
      offer_expires: expiresAt,
      seller_id: sellerId || "agent:seller:veggie_vendor_09",
      rationale: `Wholesale quote formulated with ${legacy.discountPct}% ${legacy.reason}.`,
    };
  }

  const pricing = InventoryStore.computeSellerDiscount(sellerId, rfq.item, rfq.quantity_kg);
  const sellerCard = InventoryStore.getSellerCard(sellerId);
  const sellerName = sellerCard ? sellerCard.name : sellerId;

  let upsell: UpsellItem | undefined;
  if (sellerId === "agent:seller:razor_pies" && rfq.item.toLowerCase().includes("cheese")) {
    upsell = {
      item: "milk",
      quantity_kg: 2,
      unit_price: 8.1,
      discount_pct: 10,
      reason: "Surplus dairy bundle discount (-10%)",
    };
  }

  return {
    seller_id: sellerId,
    item: pricing.item,
    quantity_kg: rfq.quantity_kg,
    quality: rfq.quality_min || "Grade A",
    base_price_per_kg: pricing.basePricePerUnit,
    discount_pct: pricing.discountPct,
    discount_reason: pricing.reason,
    final_price_per_kg: pricing.finalPricePerUnit,
    total_price: pricing.totalPrice,
    delivery_by: tomorrow,
    offer_expires: expiresAt,
    rationale: `${sellerName} computed rate ₹${pricing.finalPricePerUnit}/unit for ${rfq.quantity_kg} units from available stock of ${pricing.availableStockUnits} units (${pricing.discountPct > 0 ? `${pricing.discountPct}% ${pricing.reason}` : "base catalog rate"}).`,
    upsell_item: upsell,
  };
}

export class SellerAgent {
  static respondToRfq = sellerRespondToRfq;
}

export default SellerAgent;
