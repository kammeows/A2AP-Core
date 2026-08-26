import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OfferPayload, RfqPayload, RestaurantProfile } from "../types/domain.js";
import { BUYER_SYSTEM_PROMPT } from "./prompts.js";

// Load environment variables
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
} catch {
  dotenv.config();
}
dotenv.config();

export type BuyerDecisionAction = "propose_accept" | "send_counter" | "reject";

export interface BuyerDecision {
  action: BuyerDecisionAction;
  counter?: Partial<RfqPayload>;
  reason?: string;
  rationale?: string;
}

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
 * Call Gemini with function/tool calling for Buyer Agent
 */
async function callGemini(
  apiKey: string,
  offer: OfferPayload,
  profile: RestaurantProfile
): Promise<BuyerDecision | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const tools = [
    {
      functionDeclarations: [
        {
          name: "propose_accept",
          description: "Propose acceptance of the offer to the Policy Engine for spending verification.",
          parameters: {
            type: "OBJECT",
            properties: {
              offer_ref: { type: "STRING", description: "Reference/ID of the offer" },
              rationale: { type: "STRING", description: "Reason why this offer matches procurement requirements" },
            },
            required: ["offer_ref", "rationale"],
          },
        },
        {
          name: "send_counter",
          description: "Send a counter-offer to the seller agent if price or quantity need adjustment.",
          parameters: {
            type: "OBJECT",
            properties: {
              counter_quantity_kg: { type: "NUMBER", description: "Proposed adjusted quantity in kg" },
              target_price_per_kg: { type: "NUMBER", description: "Target price per kg" },
              reason: { type: "STRING", description: "Reason for the counter-proposal" },
            },
            required: ["reason"],
          },
        },
        {
          name: "reject",
          description: "Reject the offer if unviable or incompatible with requirements.",
          parameters: {
            type: "OBJECT",
            properties: {
              reason: { type: "STRING", description: "Reason for rejection" },
            },
            required: ["reason"],
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
          text: `${BUYER_SYSTEM_PROMPT}\n\nWe received this wholesale offer: ${JSON.stringify(
            offer
          )}.\nOur restaurant profile: ${JSON.stringify(
            profile
          )}.\nRemember: You cannot execute transactions directly. Call \`propose_accept\` if the deal meets expectations, or \`send_counter\` / \`reject\` if unsatisfactory.`,
        },
      ],
    },
  ];

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents, tools }),
    signal: AbortSignal.timeout(7000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini HTTP ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const functionCalls = data.candidates?.[0]?.content?.parts?.filter((p: any) => p.functionCall);

  if (!functionCalls || functionCalls.length === 0) {
    return null;
  }

  const firstCall = functionCalls[0].functionCall;
  const name = firstCall.name;
  const args = firstCall.args || {};

  if (name === "propose_accept") {
    return {
      action: "propose_accept",
      rationale: args.rationale || `Proposed acceptance for ${offer.quantity_kg}kg at ₹${offer.total_price}.`,
    };
  } else if (name === "send_counter") {
    return {
      action: "send_counter",
      counter: {
        item: offer.item,
        quantity_kg: Number(args.counter_quantity_kg) || offer.quantity_kg,
        buyer_max_price_per_kg: Number(args.target_price_per_kg) || profile.max_price_per_kg[offer.item] || 35,
      },
      reason: args.reason || "Counter-offer proposed.",
    };
  } else if (name === "reject") {
    return {
      action: "reject",
      reason: args.reason || "Offer rejected.",
    };
  }

  return null;
}

/**
 * Call Groq with function/tool calling for Buyer Agent
 */
async function callGroq(
  apiKey: string,
  offer: OfferPayload,
  profile: RestaurantProfile
): Promise<BuyerDecision | null> {
  const url = "https://api.groq.com/openai/v1/chat/completions";
  const model = "openai/gpt-oss-20b";

  const tools = [
    {
      type: "function",
      function: {
        name: "propose_accept",
        description: "Propose acceptance of the offer to the Policy Engine for spending verification.",
        parameters: {
          type: "object",
          properties: {
            offer_ref: { type: "string" },
            rationale: { type: "string" },
          },
          required: ["offer_ref", "rationale"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "send_counter",
        description: "Send a counter-offer to the seller agent.",
        parameters: {
          type: "object",
          properties: {
            counter_quantity_kg: { type: "number" },
            target_price_per_kg: { type: "number" },
            reason: { type: "string" },
          },
          required: ["reason"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "reject",
        description: "Reject the offer if unviable.",
        parameters: {
          type: "object",
          properties: {
            reason: { type: "string" },
          },
          required: ["reason"],
        },
      },
    },
  ];

  const messages = [
    { role: "system", content: BUYER_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Offer received: ${JSON.stringify(offer)}. Profile: ${JSON.stringify(
        profile
      )}. Call \`propose_accept\`, \`send_counter\`, or \`reject\`.`,
    },
  ];

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, tools }),
    signal: AbortSignal.timeout(7000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq HTTP ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const toolCalls = data.choices?.[0]?.message?.tool_calls;

  if (toolCalls && toolCalls.length > 0) {
    const tc = toolCalls[0];
    const name = tc.function.name;
    const args = JSON.parse(tc.function.arguments || "{}");

    if (name === "propose_accept") {
      return {
        action: "propose_accept",
        rationale: args.rationale || `Proposed acceptance for ${offer.quantity_kg}kg at ₹${offer.total_price}.`,
      };
    } else if (name === "send_counter") {
      return {
        action: "send_counter",
        counter: {
          item: offer.item,
          quantity_kg: Number(args.counter_quantity_kg) || offer.quantity_kg,
          buyer_max_price_per_kg: Number(args.target_price_per_kg) || profile.max_price_per_kg[offer.item] || 35,
        },
        reason: args.reason || "Counter-offer proposed.",
      };
    } else if (name === "reject") {
      return {
        action: "reject",
        reason: args.reason || "Offer rejected.",
      };
    }
  }

  return null;
}

/**
 * Buyer Agent Entry Point.
 * Evaluates an offer using Gemini Key 1 -> Gemini Key 2 -> Groq -> Local Deterministic Engine.
 */
export async function buyerEvaluateOffer(
  offer: OfferPayload,
  profile: RestaurantProfile
): Promise<BuyerDecision> {
  const maxPrice = profile.max_price_per_kg[offer.item] || 35;

  // 1. Try Gemini API Keys
  const geminiKeys = getGeminiKeys();
  for (let i = 0; i < geminiKeys.length; i++) {
    try {
      const decision = await callGemini(geminiKeys[i], offer, profile);
      if (decision) {
        return decision;
      }
    } catch (err: any) {
      console.warn(`[BuyerAgent] Gemini key #${i + 1} attempt failed: ${err.message}. Trying next fallback...`);
    }
  }

  // 2. Try Groq API
  const groqKey = getGroqKey();
  if (groqKey) {
    try {
      const decision = await callGroq(groqKey, offer, profile);
      if (decision) {
        return decision;
      }
  // Strict: NO fallback permitted
  throw new Error(
    `[BuyerAgent Error] AI LLM agent communication failed for Buyer. All LLM calls failed and NO fallback is permitted.`
  );
}

export class BuyerAgent {
  static evaluateOffer = buyerEvaluateOffer;
}

export default BuyerAgent;
