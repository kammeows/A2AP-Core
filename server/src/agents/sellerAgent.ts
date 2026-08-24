import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RfqPayload, OfferPayload } from "../types/domain.js";
import { InventoryStore } from "../inventory/inventoryStore.js";
import { SELLER_SYSTEM_PROMPT } from "./prompts.js";

// Load environment variables
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
} catch {
  dotenv.config();
}
dotenv.config();

// Extract API keys with support for comma-separated or numbered keys
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

/**
 * Call Gemini API with function/tool calling support
 */
async function callGemini(
  apiKey: string,
  rfq: RfqPayload,
  tomorrow: string,
  expiresAt: string
): Promise<OfferPayload | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const tools = [
    {
      functionDeclarations: [
        {
          name: "get_stock",
          description: "Check available stock and get computed volume discount tiers for an item.",
          parameters: {
            type: "OBJECT",
            properties: {
              item: { type: "STRING", description: "The item name, e.g. 'tomato'" },
              quantity_kg: { type: "NUMBER", description: "Requested quantity in kg" },
            },
            required: ["item", "quantity_kg"],
          },
        },
        {
          name: "make_offer",
          description: "Submit an official wholesale offer to the buyer agent.",
          parameters: {
            type: "OBJECT",
            properties: {
              item: { type: "STRING" },
              quantity_kg: { type: "NUMBER" },
              quality: { type: "STRING" },
              base_price_per_kg: { type: "NUMBER" },
              discount_pct: { type: "NUMBER" },
              discount_reason: { type: "STRING" },
              final_price_per_kg: { type: "NUMBER" },
              total_price: { type: "NUMBER" },
              delivery_by: { type: "STRING" },
              offer_expires: { type: "STRING" },
            },
            required: [
              "item",
              "quantity_kg",
              "quality",
              "base_price_per_kg",
              "discount_pct",
              "discount_reason",
              "final_price_per_kg",
              "total_price",
              "delivery_by",
              "offer_expires",
            ],
          },
        },
      ],
    },
  ];

  // Turn 1: Send RFQ to Gemini
  const contents: any[] = [
    {
      role: "user",
      parts: [
        {
          text: `${SELLER_SYSTEM_PROMPT}\n\nWe received an RFQ: ${JSON.stringify(
            rfq
          )}. Check available inventory using \`get_stock\` and formulate an offer using \`make_offer\`. Delivery by: ${tomorrow}, Offer expires: ${expiresAt}.`,
        },
      ],
    },
  ];

  const res1 = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents, tools }),
  });

  if (!res1.ok) {
    const errText = await res1.text();
    throw new Error(`Gemini HTTP ${res1.status}: ${errText}`);
  }

  const data1 = await res1.json();
  const candidate = data1.candidates?.[0];
  const functionCalls = candidate?.content?.parts?.filter((p: any) => p.functionCall);

  if (!functionCalls || functionCalls.length === 0) {
    return null;
  }

  // Handle get_stock tool call
  const stockCall = functionCalls.find((p: any) => p.functionCall.name === "get_stock");
  if (stockCall) {
    const args = stockCall.functionCall.args || {};
    const pricing = InventoryStore.computeDiscount(
      args.item || rfq.item,
      Number(args.quantity_kg) || rfq.quantity_kg
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

    // Turn 2: Receive make_offer
    const res2 = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents, tools }),
    });

    if (!res2.ok) {
      const errText = await res2.text();
      throw new Error(`Gemini Turn 2 HTTP ${res2.status}: ${errText}`);
    }

    const data2 = await res2.json();
    const secondCalls = data2.candidates?.[0]?.content?.parts?.filter((p: any) => p.functionCall);
    const offerCall = secondCalls?.find((p: any) => p.functionCall.name === "make_offer");

    if (offerCall) {
      const off = offerCall.functionCall.args;
      return {
        item: off.item || rfq.item,
        quantity_kg: Number(off.quantity_kg) || rfq.quantity_kg,
        quality: off.quality || rfq.quality_min || "Grade A",
        base_price_per_kg: Number(off.base_price_per_kg) || pricing.basePricePerKg,
        discount_pct: Number(off.discount_pct) ?? pricing.discountPct,
        discount_reason: off.discount_reason || pricing.reason,
        final_price_per_kg: Number(off.final_price_per_kg) || pricing.finalPricePerKg,
        total_price: Number(off.total_price) || pricing.totalPrice,
        delivery_by: off.delivery_by || tomorrow,
        offer_expires: off.offer_expires || expiresAt,
      };
    }
  }

  const directOffer = functionCalls.find((p: any) => p.functionCall.name === "make_offer");
  if (directOffer) {
    return directOffer.functionCall.args as OfferPayload;
  }

  return null;
}

/**
 * Call Groq API with function/tool calling support
 */
async function callGroq(
  apiKey: string,
  rfq: RfqPayload,
  tomorrow: string,
  expiresAt: string
): Promise<OfferPayload | null> {
  const url = "https://api.groq.com/openai/v1/chat/completions";
  const model = "openai/gpt-oss-20b";

  const tools = [
    {
      type: "function",
      function: {
        name: "get_stock",
        description: "Check available stock and get computed volume discount tiers for an item.",
        parameters: {
          type: "object",
          properties: {
            item: { type: "string" },
            quantity_kg: { type: "number" },
          },
          required: ["item", "quantity_kg"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "make_offer",
        description: "Submit an official wholesale offer to the buyer agent.",
        parameters: {
          type: "object",
          properties: {
            item: { type: "string" },
            quantity_kg: { type: "number" },
            quality: { type: "string" },
            base_price_per_kg: { type: "number" },
            discount_pct: { type: "number" },
            discount_reason: { type: "string" },
            final_price_per_kg: { type: "number" },
            total_price: { type: "number" },
            delivery_by: { type: "string" },
            offer_expires: { type: "string" },
          },
          required: [
            "item",
            "quantity_kg",
            "quality",
            "base_price_per_kg",
            "discount_pct",
            "discount_reason",
            "final_price_per_kg",
            "total_price",
            "delivery_by",
            "offer_expires",
          ],
        },
      },
    },
  ];

  const messages: any[] = [
    { role: "system", content: SELLER_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Received RFQ: ${JSON.stringify(
        rfq
      )}. Call \`get_stock\` first, then \`make_offer\`. Delivery by: ${tomorrow}, Offer expires: ${expiresAt}.`,
    },
  ];

  const res1 = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, tools }),
  });

  if (!res1.ok) {
    const errText = await res1.text();
    throw new Error(`Groq HTTP ${res1.status}: ${errText}`);
  }

  const data1 = await res1.json();
  const choice = data1.choices?.[0]?.message;
  const toolCalls = choice?.tool_calls;

  if (toolCalls && toolCalls.length > 0) {
    const stockCall = toolCalls.find((tc: any) => tc.function?.name === "get_stock");
    if (stockCall) {
      const args = JSON.parse(stockCall.function.arguments || "{}");
      const pricing = InventoryStore.computeDiscount(
        args.item || rfq.item,
        Number(args.quantity_kg) || rfq.quantity_kg
      );

      messages.push(choice);
      messages.push({
        role: "tool",
        tool_call_id: stockCall.id,
        name: "get_stock",
        content: JSON.stringify(pricing),
      });

      const res2 = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, messages, tools }),
      });

      if (!res2.ok) {
        const errText = await res2.text();
        throw new Error(`Groq Turn 2 HTTP ${res2.status}: ${errText}`);
      }

      const data2 = await res2.json();
      const secondChoice = data2.choices?.[0]?.message;
      const makeOfferCall = secondChoice?.tool_calls?.find(
        (tc: any) => tc.function?.name === "make_offer"
      );

      if (makeOfferCall) {
        const off = JSON.parse(makeOfferCall.function.arguments || "{}");
        return {
          item: off.item || rfq.item,
          quantity_kg: Number(off.quantity_kg) || rfq.quantity_kg,
          quality: off.quality || rfq.quality_min || "Grade A",
          base_price_per_kg: Number(off.base_price_per_kg) || pricing.basePricePerKg,
          discount_pct: Number(off.discount_pct) ?? pricing.discountPct,
          discount_reason: off.discount_reason || pricing.reason,
          final_price_per_kg: Number(off.final_price_per_kg) || pricing.finalPricePerKg,
          total_price: Number(off.total_price) || pricing.totalPrice,
          delivery_by: off.delivery_by || tomorrow,
          offer_expires: off.offer_expires || expiresAt,
        };
      }
    }
  }

  return null;
}

/**
 * Seller Agent entry point.
 * Robust fallback chain: Gemini Key 1 -> Gemini Key 2 -> Groq -> Local Deterministic Engine.
 */
export async function sellerRespondToRfq(rfq: RfqPayload): Promise<OfferPayload> {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();

  // 1. Try Gemini Keys in sequence
  const geminiKeys = getGeminiKeys();
  for (let i = 0; i < geminiKeys.length; i++) {
    try {
      const offer = await callGemini(geminiKeys[i], rfq, tomorrow, expiresAt);
      if (offer) {
        return offer;
      }
    } catch (err: any) {
      console.warn(`[SellerAgent] Gemini key #${i + 1} attempt failed: ${err.message}. Trying next fallback...`);
    }
  }

  // 2. Try Groq Key
  const groqKey = getGroqKey();
  if (groqKey) {
    try {
      const offer = await callGroq(groqKey, rfq, tomorrow, expiresAt);
      if (offer) {
        return offer;
      }
    } catch (err: any) {
      console.warn(`[SellerAgent] Groq attempt failed: ${err.message}. Trying local engine...`);
    }
  }

  // 3. Guaranteed Local Fallback (Exact same pricing rules, zero crash)
  console.log(`[SellerAgent] Using deterministic local engine for RFQ (${rfq.quantity_kg}kg ${rfq.item})`);
  const pricing = InventoryStore.computeDiscount(rfq.item, rfq.quantity_kg);
  return {
    item: rfq.item,
    quantity_kg: rfq.quantity_kg,
    quality: rfq.quality_min || "Grade A",
    base_price_per_kg: pricing.basePricePerKg,
    discount_pct: pricing.discountPct,
    discount_reason: pricing.reason,
    final_price_per_kg: pricing.finalPricePerKg,
    total_price: pricing.totalPrice,
    delivery_by: tomorrow,
    offer_expires: expiresAt,
  };
}

export class SellerAgent {
  static respondToRfq = sellerRespondToRfq;
}

export default SellerAgent;
