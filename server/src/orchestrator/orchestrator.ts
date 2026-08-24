import { appendMessage, getThread, db } from "../thread/threadStore.js";
import { evaluateDeal } from "../policy/policyEngine.js";
import { sellerRespondToRfq } from "../agents/sellerAgent.js";
import { buyerEvaluateOffer } from "../agents/buyerAgent.js";
import { razorpayClient } from "../payments/razorpayClient.js";
import { Envelope, MessageType } from "../types/messages.js";
import { RfqPayload, OfferPayload, RestaurantProfile } from "../types/domain.js";
import { PolicyConfig, PolicyResult } from "../types/policy.js";

const BUYER_ID = "agent:buyer:restaurant_42";
const SELLER_ID = "agent:seller:veggie_vendor_09";
const POLICY_ENGINE_ID = "system:policy_engine";
const RAZORPAY_SYSTEM_ID = "system:razorpay";
const MIN_VIABLE_QUANTITY = 20;

export const defaultBuyerPolicy: PolicyConfig = {
  agent_id: BUYER_ID,
  delegation_mode: "full",
  weekly_budget_cap: 2000,
  per_transaction_cap: 1600,
  per_unit_price_ceiling: { tomato: 35 },
  seller_allowlist: [SELLER_ID],
};

export interface NegotiationResult {
  thread_id: string;
  scenario: "happy" | "failure" | "custom";
  status: "CONFIRMED" | "RENEGOTIATED_AND_CONFIRMED" | "ESCALATED_POLICY_VIOLATION" | "REJECTED";
  final_message_type: MessageType;
  order_id?: string;
  total_amount?: number;
  policy_checks?: PolicyResult["checks"];
}

let msgCounter = 0;
function logEnvelope(
  threadId: string,
  type: MessageType,
  from: string,
  to: string,
  payload: Record<string, unknown>
): Envelope {
  msgCounter += 1;
  const envelope: Envelope = {
    message_id: `msg_${Date.now().toString(36)}_${msgCounter}`,
    thread_id: threadId,
    timestamp: new Date().toISOString(),
    from,
    to,
    type,
    payload,
  };
  appendMessage(envelope);
  return envelope;
}

export function buildRfq(
  scenario: "happy" | "failure" | "custom",
  customParams?: Partial<RfqPayload>
): RfqPayload {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  if (scenario === "failure") {
    // 75kg tomatoes at 18% tier (₹26.24/kg) = ₹1,968, which deliberately exceeds the ₹1,600 cap
    return {
      item: "tomato",
      quantity_kg: 75,
      quality_min: "Grade A",
      needed_by: tomorrow,
      buyer_max_price_per_kg: 35,
      ...customParams,
    };
  }

  // Happy path: 50kg tomatoes at 10% discount (₹28.8/kg) = ₹1,440, comfortably within ₹1,600 cap
  return {
    item: "tomato",
    quantity_kg: 50,
    quality_min: "Grade A",
    needed_by: tomorrow,
    buyer_max_price_per_kg: 35,
    ...customParams,
  };
}

function getWeekSpent(buyerId: string): number {
  try {
    const stmt = db.prepare(`
      SELECT payload FROM messages
      WHERE from_agent = ? AND type = 'ORDER_CREATE'
    `);
    const rows = stmt.all(buyerId) as Array<{ payload: string }>;
    let total = 0;
    for (const r of rows) {
      try {
        const p = JSON.parse(r.payload);
        if (typeof p.total_price === "number") {
          total += p.total_price;
        } else if (typeof p.amount === "number") {
          total += p.amount / 100;
        }
      } catch {
        // ignore
      }
    }
    return total;
  } catch {
    return 0;
  }
}

/**
 * Runs a complete Agent-to-Agent negotiation lifecycle.
 * Coordinates Buyer Agent -> Seller Agent -> Policy Engine -> Razorpay Orders API.
 */
export async function runNegotiation(
  threadId: string = `thread_${Date.now().toString(36)}`,
  scenario: "happy" | "failure" | "custom" = "happy",
  customRfq?: Partial<RfqPayload>,
  allowRenegotiation: boolean = true
): Promise<NegotiationResult> {
  const policy: PolicyConfig = defaultBuyerPolicy;
  const restaurantProfile: RestaurantProfile = {
    restaurant_id: BUYER_ID,
    weekly_budget_cap: policy.weekly_budget_cap,
    per_transaction_cap: policy.per_transaction_cap,
    quality_min: "Grade A",
    max_price_per_kg: policy.per_unit_price_ceiling,
  };

  // 1. Initial RFQ
  const initialRfq = buildRfq(scenario, customRfq);
  logEnvelope(threadId, "RFQ", BUYER_ID, SELLER_ID, {
    ...initialRfq,
    narrative: `Buyer agent requests quote for ${initialRfq.quantity_kg}kg ${initialRfq.item} (Quality: ${initialRfq.quality_min}).`,
  });

  // 2. Seller Agent computes inventory & discount, then responds with Offer
  const offer = await sellerRespondToRfq(initialRfq);
  logEnvelope(threadId, "OFFER", SELLER_ID, BUYER_ID, {
    ...offer,
    narrative: `Seller offers ${offer.quantity_kg}kg at ₹${offer.final_price_per_kg}/kg (total ₹${offer.total_price}) with ${offer.discount_pct}% ${offer.discount_reason} discount.`,
  });

  // 3. Buyer Agent evaluates offer
  const buyerDecision = await buyerEvaluateOffer(offer, restaurantProfile);

  if (buyerDecision.action === "reject") {
    logEnvelope(threadId, "REJECT", BUYER_ID, SELLER_ID, {
      reason: buyerDecision.reason || "Offer rejected by buyer criteria.",
    });
    return {
      thread_id: threadId,
      scenario,
      status: "REJECTED",
      final_message_type: "REJECT",
    };
  }

  // Buyer proposes accept (Awaiting Policy Engine Authorization)
  logEnvelope(threadId, "ACCEPT", BUYER_ID, POLICY_ENGINE_ID, {
    proposal: "propose_accept",
    rationale: buyerDecision.rationale || `Proposed acceptance for ${offer.quantity_kg}kg at ₹${offer.total_price}.`,
    target_offer: offer,
  });

  // 4. Policy Engine Evaluates Deal (Pure & Deterministic)
  const weekSpentSoFar = getWeekSpent(BUYER_ID);
  const policyResult = evaluateDeal(offer, SELLER_ID, policy, weekSpentSoFar);

  logEnvelope(threadId, "POLICY_CHECK", POLICY_ENGINE_ID, BUYER_ID, {
    approved: policyResult.approved,
    action: policyResult.action,
    checks: policyResult.checks,
    summary: policyResult.approved
      ? "Policy Engine APPROVED: Deal conforms to all allowlist, unit price, and spending caps."
      : "Policy Engine REJECTED: Deal breaches one or more budget caps.",
  });

  // 5. Execution branch
  if (policyResult.approved) {
    // Happy path: create test-mode Razorpay order
    const amountInPaise = Math.round(offer.total_price * 100);
    const receipt = `rcpt_${threadId}_${Date.now()}`;
    const order = await razorpayClient.createOrder(amountInPaise, "INR", receipt);

    logEnvelope(threadId, "ORDER_CREATE", BUYER_ID, RAZORPAY_SYSTEM_ID, {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      total_price: offer.total_price,
      is_mock: order.is_mock,
    });

    logEnvelope(threadId, "ORDER_CONFIRM", RAZORPAY_SYSTEM_ID, BUYER_ID, {
      status: order.status,
      orderId: order.id,
      amount_inr: offer.total_price,
      item: offer.item,
      quantity_kg: offer.quantity_kg,
      message: `Razorpay test-mode order ${order.id} confirmed for ₹${offer.total_price}.`,
    });

    return {
      thread_id: threadId,
      scenario,
      status: "CONFIRMED",
      final_message_type: "ORDER_CONFIRM",
      order_id: order.id,
      total_amount: offer.total_price,
      policy_checks: policyResult.checks,
    };
  } else {
    // Failure path: check if bounded renegotiation can resolve the breach
    const failedRules = policyResult.checks.filter((c) => !c.passed).map((c) => c.rule);
    const canRenegotiate = allowRenegotiation && offer.quantity_kg > MIN_VIABLE_QUANTITY;

    if (canRenegotiate && failedRules.includes("within_per_transaction_cap")) {
      // Auto-renegotiate quantity down to 50kg so deal value ₹1,440 fits within ₹1,600 cap
      const targetQty = 50;

      logEnvelope(threadId, "COUNTER_OFFER", BUYER_ID, SELLER_ID, {
        item: offer.item,
        quantity_kg: targetQty,
        reason: `Initial offer of ₹${offer.total_price} breached per-transaction cap (₹${policy.per_transaction_cap}). Countering with ${targetQty}kg to stay within policy bounds.`,
        failed_policy_rules: failedRules,
      });

      // Seller responds to revised counter
      const counterOffer = await sellerRespondToRfq({
        item: offer.item,
        quantity_kg: targetQty,
        quality_min: "Grade A",
        needed_by: initialRfq.needed_by,
        buyer_max_price_per_kg: 35,
      });

      logEnvelope(threadId, "OFFER", SELLER_ID, BUYER_ID, {
        ...counterOffer,
        narrative: `Seller revised offer for ${counterOffer.quantity_kg}kg at ₹${counterOffer.final_price_per_kg}/kg (total ₹${counterOffer.total_price}).`,
      });

      // Buyer proposes acceptance of revised offer
      logEnvelope(threadId, "ACCEPT", BUYER_ID, POLICY_ENGINE_ID, {
        proposal: "propose_accept",
        rationale: `Revised offer of ${counterOffer.quantity_kg}kg at ₹${counterOffer.total_price} satisfies transaction cap. Proposing acceptance.`,
        target_offer: counterOffer,
      });

      // Policy Engine re-evaluates revised offer
      const secondPolicyResult = evaluateDeal(counterOffer, SELLER_ID, policy, weekSpentSoFar);
      logEnvelope(threadId, "POLICY_CHECK", POLICY_ENGINE_ID, BUYER_ID, {
        approved: secondPolicyResult.approved,
        action: secondPolicyResult.action,
        checks: secondPolicyResult.checks,
        summary: secondPolicyResult.approved
          ? "Policy Engine APPROVED revised offer: Now within all policy limits."
          : "Policy Engine REJECTED revised offer.",
      });

      if (secondPolicyResult.approved) {
        const amountInPaise = Math.round(counterOffer.total_price * 100);
        const receipt = `rcpt_${threadId}_renegotiated_${Date.now()}`;
        const order = await razorpayClient.createOrder(amountInPaise, "INR", receipt);

        logEnvelope(threadId, "ORDER_CREATE", BUYER_ID, RAZORPAY_SYSTEM_ID, {
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
          receipt: order.receipt,
          total_price: counterOffer.total_price,
          is_mock: order.is_mock,
        });

        logEnvelope(threadId, "ORDER_CONFIRM", RAZORPAY_SYSTEM_ID, BUYER_ID, {
          status: order.status,
          orderId: order.id,
          amount_inr: counterOffer.total_price,
          item: counterOffer.item,
          quantity_kg: counterOffer.quantity_kg,
          message: `Negotiation succeeded: Razorpay test-mode order ${order.id} confirmed for ₹${counterOffer.total_price} after bounded renegotiation.`,
        });

        return {
          thread_id: threadId,
          scenario,
          status: "RENEGOTIATED_AND_CONFIRMED",
          final_message_type: "ORDER_CONFIRM",
          order_id: order.id,
          total_amount: counterOffer.total_price,
          policy_checks: secondPolicyResult.checks,
        };
      }
    }

    // Escalate to human: zero money moves, clear audit record of policy failure
    logEnvelope(threadId, "ORDER_FAIL", BUYER_ID, "system:human_escalation", {
      reason: "policy_violation",
      violation: failedRules,
      requires_human_approval: true,
      offer_total: offer.total_price,
      transaction_cap: policy.per_transaction_cap,
      message: `Deal blocked: Proposed purchase of ₹${offer.total_price} exceeds policy cap. Escalated to human manager.`,
    });

    return {
      thread_id: threadId,
      scenario,
      status: "ESCALATED_POLICY_VIOLATION",
      final_message_type: "ORDER_FAIL",
      policy_checks: policyResult.checks,
    };
  }
}

export class Orchestrator {
  static runNegotiation = runNegotiation;
  static buildRfq = buildRfq;
}

export default Orchestrator;
