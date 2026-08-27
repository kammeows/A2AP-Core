import { appendMessage, getThread, db } from "../thread/threadStore.js";
import { evaluateDeal } from "../policy/policyEngine.js";
import { sellerRespondToRfq } from "../agents/sellerAgent.js";
import { buyerEvaluateOffer } from "../agents/buyerAgent.js";
import { razorpayClient } from "../payments/razorpayClient.js";
import { Envelope, MessageType } from "../types/messages.js";
import {
  RfqPayload,
  OfferPayload,
  RestaurantProfile,
  SplitAcceptPayload,
  BuyerDecision,
  AgentCard,
  PurchasedItem,
} from "../types/domain.js";
import { PolicyConfig, PolicyResult } from "../types/policy.js";
import { InventoryStore } from "../inventory/inventoryStore.js";

export const BUYER_ID = "agent:buyer:razorslice";
export const POLICY_ENGINE_ID = "system:policy_engine";
export const RAZORPAY_SYSTEM_ID = "system:razorpay";
export const HUMAN_MANAGER_ID = "system:human_escalation";
export const MIN_VIABLE_QUANTITY = 1;

export const defaultBuyerPolicy: PolicyConfig = {
  agent_id: BUYER_ID,
  delegation_mode: "full",
  weekly_budget_cap: 2000,
  per_transaction_cap: 1600,
  per_unit_price_ceiling: {
    cheese: 35,
    flour: 35,
    tomato: 35,
    tomatoes: 35,
    onion: 35,
    onions: 35,
    milk: 35,
  },
  seller_allowlist: [
    "agent:seller:razor_pies",
    "agent:seller:razorcery_1",
    "agent:seller:razorcery_2",
    "agent:seller:veggie_vendor_09",
  ],
};

export interface NegotiationResult {
  thread_id: string;
  scenario: "happy" | "failure" | "custom";
  status:
    | "CONFIRMED"
    | "AWAITING_CONFIRMATION"
    | "RENEGOTIATED_AND_CONFIRMED"
    | "ESCALATED_POLICY_VIOLATION"
    | "NO_SELLER_FOUND"
    | "NO_PURCHASE_NEEDED"
    | "PAYMENT_FAILED"
    | "REJECTED";
  final_message_type: MessageType;
  order_id?: string;
  total_amount?: number;
  pending_offer?: OfferPayload;
  policy_checks?: PolicyResult["checks"];
  message?: string;
  buyer_stock?: number;
  seller_stock?: number;
  purchased_items?: PurchasedItem[];
}

let msgCounter = 0;
export function logEnvelope(
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

export function getWeekSpent(buyerId: string = BUYER_ID): number {
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

export function getPolicyConfig(agentId: string = BUYER_ID): PolicyConfig {
  try {
    const row = db.prepare(`SELECT config FROM policy_configs WHERE agent_id = ?`).get(agentId) as
      | { config: string }
      | undefined;
    if (row) {
      return JSON.parse(row.config);
    }
    return defaultBuyerPolicy;
  } catch {
    return defaultBuyerPolicy;
  }
}

export interface ItemDeficit {
  item: string;
  quantity: number;
}

export interface RunNegotiationParams {
  threadId?: string;
  scenario?: "happy" | "failure" | "custom";
  customRfq?: Partial<RfqPayload>;
  allowRenegotiation?: boolean;
  buyerStockKg?: number;
  sellerStockKg?: number;
  buyerTargetStockKg?: number;
  delegationMode?: "full" | "partial";
  simulatePaymentFail?: boolean;
  itemToProcure?: string;
  quantityNeeded?: number;
  itemsToProcure?: ItemDeficit[];
}

export async function runNegotiation(
  paramsOrThreadId?: RunNegotiationParams | string,
  scenarioArg?: "happy" | "failure" | "custom",
  customRfqArg?: Partial<RfqPayload>,
  allowRenegotiationArg?: boolean
): Promise<NegotiationResult> {
  let params: RunNegotiationParams = {};
  if (typeof paramsOrThreadId === "string") {
    params = {
      threadId: paramsOrThreadId,
      scenario: scenarioArg,
      customRfq: customRfqArg,
      allowRenegotiation: allowRenegotiationArg,
    };
  } else if (paramsOrThreadId) {
    params = paramsOrThreadId;
  }

  const threadId =
    params.threadId || `thread_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const scenario = params.scenario || "custom";
  const allowRenegotiation = params.allowRenegotiation !== false;
  const policy: PolicyConfig = {
    ...getPolicyConfig(BUYER_ID),
    ...(params.delegationMode ? { delegation_mode: params.delegationMode } : {}),
  };

  const restaurantProfile: RestaurantProfile = {
    restaurant_id: BUYER_ID,
    weekly_budget_cap: policy.weekly_budget_cap,
    per_transaction_cap: policy.per_transaction_cap,
    quality_min: "Grade A",
    max_price_per_kg: policy.per_unit_price_ceiling,
  };

  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // Determine items to procure: either list of items or single item
  let itemsList: ItemDeficit[] = [];

  if (scenario === "happy") {
    itemsList = [{ item: "tomato", quantity: 50 }];
  } else if (scenario === "failure") {
    itemsList = [{ item: "tomato", quantity: 75 }];
  } else if (params.itemsToProcure && params.itemsToProcure.length > 0) {
    itemsList = params.itemsToProcure.filter((i) => i.quantity > 0);
  } else if (params.itemToProcure) {
    itemsList = [{ item: params.itemToProcure, quantity: params.quantityNeeded || 5 }];
  } else if (params.customRfq?.item) {
    itemsList = [{ item: params.customRfq.item, quantity: params.customRfq.quantity_kg || 5 }];
  } else {
    itemsList = [{ item: "flour", quantity: 6 }];
  }

  if (itemsList.length === 0) {
    return {
      thread_id: threadId,
      scenario,
      status: "NO_PURCHASE_NEEDED",
      final_message_type: "ACCEPT",
      message: "No ingredient deficits detected; pantry covers all orders.",
    };
  }

  const allPurchasedItems: PurchasedItem[] = [];
  let totalDealAmount = 0;
  let allPolicyChecks: PolicyResult["checks"] = [];
  let lastChosenOffer: OfferPayload | undefined;
  let overallApproved = true;

  // Process all deficit items concurrently across the A2A seller network
  for (const it of itemsList) {
    const item = it.item;
    const deficitQuantity = it.quantity;

    let matchingSellers: AgentCard[];
    if (scenario === "happy" || scenario === "failure") {
      matchingSellers = [
        {
          agent_id: "agent:seller:veggie_vendor_09",
          name: "Veggie Vendor 09",
          stocked_items: ["tomato"],
          catalog: { tomato: { base_price: 32, stock: 500 } },
          negotiable: true,
          description: "Wholesale produce vendor",
        },
      ];
    } else {
      const agentCards = InventoryStore.getAgentCards();
      matchingSellers = agentCards.filter((card) =>
        card.stocked_items.some(
          (si) =>
            si.toLowerCase().includes(item.toLowerCase()) ||
            item.toLowerCase().includes(si.toLowerCase()) ||
            si.toLowerCase().replace(/s$/, "") === item.toLowerCase().replace(/s$/, "")
        )
      );
      if (matchingSellers.length === 0) {
        matchingSellers = [
          {
            agent_id: "agent:seller:veggie_vendor_09",
            name: "Veggie Vendor 09",
            stocked_items: [item],
            catalog: { [item]: { base_price: 32, stock: 500 } },
            negotiable: true,
            description: "Wholesale produce vendor",
          },
        ];
      }
    }

    const rfqBase: RfqPayload = {
      item,
      quantity_kg: deficitQuantity,
      quality_min: "Grade A",
      needed_by: tomorrow,
      buyer_max_price_per_kg: policy.per_unit_price_ceiling[item] || 35,
      ...params.customRfq,
    };

    // Broadcast RFQs concurrently
    for (const seller of matchingSellers) {
      logEnvelope(threadId, "RFQ", BUYER_ID, seller.agent_id, {
        ...rfqBase,
        target_seller_id: seller.agent_id,
        seller_name: seller.name,
        narrative: `RazorSlice requested wholesale quote for ${rfqBase.quantity_kg} units of ${rfqBase.item} from ${seller.name}.`,
      });
    }

    // Collect Quotes concurrently
    const sellerOfferPromises = matchingSellers.map((seller) =>
      sellerRespondToRfq(rfqBase, seller.agent_id)
    );
    const sellerOffers = await Promise.all(sellerOfferPromises);

    for (const offer of sellerOffers) {
      logEnvelope(threadId, "OFFER", offer.seller_id || "agent:seller", BUYER_ID, {
        ...offer,
        narrative: `Wholesale quote: ${offer.quantity_kg} units at ₹${offer.final_price_per_kg}/unit (Total ₹${offer.total_price}) with ${offer.discount_pct}% discount.`,
      });
    }

    // Evaluate quotes using Buyer Agent
    const buyerDecision: BuyerDecision = await buyerEvaluateOffer(
      sellerOffers[0],
      restaurantProfile,
      sellerOffers
    );

    if (buyerDecision.declined_upsell_reason) {
      logEnvelope(threadId, "UPSELL_DECLINE", BUYER_ID, "system", {
        reason: buyerDecision.declined_upsell_reason,
        narrative: buyerDecision.declined_upsell_reason,
      });
    }
    if (buyerDecision.accepted_upsell) {
      logEnvelope(threadId, "UPSELL_ACCEPT", BUYER_ID, "system", {
        upsell_item: buyerDecision.accepted_upsell,
        narrative: `Accepted valuable upsell bundle of ${buyerDecision.accepted_upsell.quantity_kg} units ${buyerDecision.accepted_upsell.item} at ₹${buyerDecision.accepted_upsell.unit_price}/unit.`,
      });
    }

    let itemChosenOffer: OfferPayload;
    let itemWinningSellerId = sellerOffers[0].seller_id || "agent:seller:razor_pies";

    if (buyerDecision.action === "propose_split_accept" && buyerDecision.split_payload) {
      const split = buyerDecision.split_payload;
      itemChosenOffer = {
        item: split.item,
        quantity_kg: split.total_quantity_kg,
        quality: "Grade A",
        base_price_per_kg: Number((split.total_cost / split.total_quantity_kg).toFixed(2)),
        discount_pct: 10,
        discount_reason: "multi_seller_split_optimization",
        final_price_per_kg: Number((split.total_cost / split.total_quantity_kg).toFixed(2)),
        total_price: split.total_cost,
        delivery_by: tomorrow,
        offer_expires: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
        seller_id: split.splits.map((s) => s.seller_id).join(" + "),
        rationale: split.rationale,
      };

      logEnvelope(threadId, "SPLIT_ACCEPT", BUYER_ID, POLICY_ENGINE_ID, {
        proposal: "propose_split_accept",
        split_deal: split,
        total_cost: split.total_cost,
        rationale: split.rationale,
      });

      for (const sp of split.splits) {
        allPurchasedItems.push({
          seller_id: sp.seller_id,
          item: sp.item,
          quantity: sp.quantity_kg,
          price: sp.unit_price,
        });
      }
    } else {
      itemChosenOffer = buyerDecision.target_offer || sellerOffers[0];
      itemWinningSellerId = itemChosenOffer.seller_id || "agent:seller:razor_pies";

      logEnvelope(threadId, "ACCEPT", BUYER_ID, POLICY_ENGINE_ID, {
        proposal: "propose_accept",
        target_offer: itemChosenOffer,
        rationale:
          buyerDecision.rationale ||
          `Proposed acceptance for ${itemChosenOffer.quantity_kg} units from ${itemWinningSellerId} at ₹${itemChosenOffer.total_price}.`,
      });

      allPurchasedItems.push({
        seller_id: itemWinningSellerId,
        item: itemChosenOffer.item,
        quantity: itemChosenOffer.quantity_kg,
        price: itemChosenOffer.final_price_per_kg,
      });
    }

    if (buyerDecision.accepted_upsell) {
      allPurchasedItems.push({
        seller_id: itemWinningSellerId,
        item: buyerDecision.accepted_upsell.item,
        quantity: buyerDecision.accepted_upsell.quantity_kg,
        price: buyerDecision.accepted_upsell.unit_price,
      });
    }

    totalDealAmount += itemChosenOffer.total_price;
    lastChosenOffer = itemChosenOffer;

    const weekSpentSoFar = getWeekSpent(BUYER_ID);
    const policyResult = evaluateDeal(itemChosenOffer, itemWinningSellerId, policy, weekSpentSoFar);
    allPolicyChecks.push(...policyResult.checks);

    if (!policyResult.approved) {
      overallApproved = false;
    }
  }

  logEnvelope(threadId, "POLICY_CHECK", POLICY_ENGINE_ID, BUYER_ID, {
    approved: overallApproved,
    action: overallApproved ? "AUTO_ACCEPT" : "RENEGOTIATE_OR_ESCALATE",
    checks: allPolicyChecks,
    summary: overallApproved
      ? `Policy Engine APPROVED: Batch procurement for ₹${totalDealAmount} passed all spend caps, unit ceilings, and allowlists.`
      : `Policy Engine REJECTED: Proposed deal of ₹${totalDealAmount} breached policy bounds.`,
  });

  if (overallApproved) {
    if (policy.delegation_mode === "partial") {
      return {
        thread_id: threadId,
        scenario,
        status: "AWAITING_CONFIRMATION",
        final_message_type: "ACCEPT",
        pending_offer: lastChosenOffer,
        policy_checks: allPolicyChecks,
        total_amount: totalDealAmount,
        purchased_items: allPurchasedItems,
      };
    }

    if (params.simulatePaymentFail) {
      logEnvelope(threadId, "ORDER_FAIL", RAZORPAY_SYSTEM_ID, BUYER_ID, {
        reason: "GATEWAY_ERROR",
        message: "Payment simulation trigger: Gateway rejected test transaction.",
      });
      return {
        thread_id: threadId,
        scenario,
        status: "PAYMENT_FAILED",
        final_message_type: "ORDER_FAIL",
        message: "Simulated payment failure",
      };
    }

    const amountInPaise = Math.round(totalDealAmount * 100);
    const receipt = `rcpt_${threadId}_${Date.now().toString(36)}`;
    const order = await razorpayClient.createOrder(amountInPaise, "INR", receipt);

    logEnvelope(threadId, "ORDER_CREATE", BUYER_ID, RAZORPAY_SYSTEM_ID, {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      total_price: totalDealAmount,
      is_mock: order.is_mock,
    });

    logEnvelope(threadId, "ORDER_CONFIRM", RAZORPAY_SYSTEM_ID, BUYER_ID, {
      status: order.status,
      orderId: order.id,
      amount_inr: totalDealAmount,
      message: `Razorpay test-mode order ${order.id} confirmed for ₹${totalDealAmount} across ${allPurchasedItems.length} items.`,
    });

    // Update database & store for all purchased items
    InventoryStore.updateStockAfterOrder(allPurchasedItems);

    return {
      thread_id: threadId,
      scenario,
      status: "CONFIRMED",
      final_message_type: "ORDER_CONFIRM",
      order_id: order.id,
      total_amount: totalDealAmount,
      policy_checks: allPolicyChecks,
      purchased_items: allPurchasedItems,
    };
  } else {
    // Failure path handling
    const failedRules = allPolicyChecks.filter((c) => !c.passed).map((c) => c.rule);
    const canRenegotiate = allowRenegotiation && lastChosenOffer && lastChosenOffer.quantity_kg > MIN_VIABLE_QUANTITY;

    if (canRenegotiate && failedRules.includes("within_per_transaction_cap")) {
      const reducedQty = scenario === "failure" ? 50 : Math.max(1, Math.floor(lastChosenOffer!.quantity_kg * 0.6));
      const targetSeller = lastChosenOffer!.seller_id || "agent:seller:veggie_vendor_09";

      logEnvelope(threadId, "COUNTER_OFFER", BUYER_ID, targetSeller, {
        item: lastChosenOffer!.item,
        quantity_kg: reducedQty,
        reason: `Initial quote of ₹${lastChosenOffer!.total_price} breached per-transaction cap (₹${policy.per_transaction_cap}). Auto-renegotiating with reduced quantity (${reducedQty} units) to fit budget bounds.`,
        failed_rules: failedRules,
      });

      const counterOffer = await sellerRespondToRfq(
        {
          item: lastChosenOffer!.item,
          quantity_kg: reducedQty,
          quality_min: "Grade A",
          needed_by: tomorrow,
          buyer_max_price_per_kg: policy.per_unit_price_ceiling[lastChosenOffer!.item] || 35,
        },
        targetSeller
      );

      logEnvelope(threadId, "OFFER", targetSeller, BUYER_ID, {
        ...counterOffer,
        narrative: `Revised quote: ${counterOffer.quantity_kg} units at ₹${counterOffer.final_price_per_kg}/unit (Total ₹${counterOffer.total_price}).`,
      });

      logEnvelope(threadId, "ACCEPT", BUYER_ID, POLICY_ENGINE_ID, {
        proposal: "propose_accept",
        target_offer: counterOffer,
        rationale: `Accepted renegotiated offer for ${counterOffer.quantity_kg} units at ₹${counterOffer.total_price}.`,
      });

      const weekSpentSoFar = getWeekSpent(BUYER_ID);
      const rePolicyResult = evaluateDeal(counterOffer, targetSeller, policy, weekSpentSoFar);
      logEnvelope(threadId, "POLICY_CHECK", POLICY_ENGINE_ID, BUYER_ID, {
        approved: rePolicyResult.approved,
        action: rePolicyResult.action,
        checks: rePolicyResult.checks,
        summary: rePolicyResult.approved
          ? "Policy Engine APPROVED renegotiated offer: Now within all policy limits."
          : "Policy Engine REJECTED revised offer.",
      });

      if (rePolicyResult.approved) {
        const amountInPaise = Math.round(counterOffer.total_price * 100);
        const receipt = `rcpt_${threadId}_reneg_${Date.now().toString(36)}`;
        const order = await razorpayClient.createOrder(amountInPaise, "INR", receipt);

        logEnvelope(threadId, "ORDER_CREATE", BUYER_ID, RAZORPAY_SYSTEM_ID, {
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
          receipt: order.receipt,
          total_price: counterOffer.total_price,
        });

        logEnvelope(threadId, "ORDER_CONFIRM", RAZORPAY_SYSTEM_ID, BUYER_ID, {
          status: order.status,
          orderId: order.id,
          amount_inr: counterOffer.total_price,
          item: counterOffer.item,
          quantity_kg: counterOffer.quantity_kg,
          message: `Negotiation succeeded: Razorpay order ${order.id} confirmed for ₹${counterOffer.total_price} after bounded renegotiation.`,
        });

        const renegPurchased: PurchasedItem[] = [
          {
            seller_id: targetSeller,
            item: counterOffer.item,
            quantity: counterOffer.quantity_kg,
            price: counterOffer.final_price_per_kg,
          },
        ];
        InventoryStore.updateStockAfterOrder(renegPurchased);

        return {
          thread_id: threadId,
          scenario,
          status: "RENEGOTIATED_AND_CONFIRMED",
          final_message_type: "ORDER_CONFIRM",
          order_id: order.id,
          total_amount: counterOffer.total_price,
          policy_checks: rePolicyResult.checks,
          purchased_items: renegPurchased,
        };
      }
    }

    logEnvelope(threadId, "ORDER_FAIL", BUYER_ID, HUMAN_MANAGER_ID, {
      reason: "policy_violation",
      violation: failedRules,
      requires_human_approval: true,
      offer_total: totalDealAmount,
      transaction_cap: policy.per_transaction_cap,
      message: `Deal blocked: Proposed purchase of ₹${totalDealAmount} violates policy bounds. Zero funds transferred. Escalated to human manager.`,
    });

    return {
      thread_id: threadId,
      scenario,
      status: "ESCALATED_POLICY_VIOLATION",
      final_message_type: "ORDER_FAIL",
      policy_checks: allPolicyChecks,
      message: "Deal blocked by policy engine",
    };
  }
}

export async function confirmPendingTransaction(params: {
  threadId: string;
  offer: Partial<OfferPayload>;
  action?: "approve" | "decline";
  simulatePaymentFail?: boolean;
}): Promise<{
  success: boolean;
  status: string;
  order_id?: string;
  total_amount?: number;
  buyer_stock?: number;
  seller_stock?: number;
  purchased_items?: PurchasedItem[];
}> {
  const { threadId, offer, action = "approve", simulatePaymentFail = false } = params;

  if (action === "decline") {
    logEnvelope(threadId, "ORDER_FAIL", "human:manager", BUYER_ID, {
      reason: "HUMAN_DECLINED",
      message: "Transaction declined by restaurant manager in Partial Autonomous Mode.",
    });
    return { success: true, status: "DECLINED" };
  }

  if (simulatePaymentFail) {
    logEnvelope(threadId, "ORDER_FAIL", RAZORPAY_SYSTEM_ID, BUYER_ID, {
      reason: "PAYMENT_GATEWAY_ERROR",
      message: "Simulated payment processing error at gateway.",
    });
    return { success: false, status: "PAYMENT_FAILED" };
  }

  const totalPrice = offer.total_price || 1440;
  const amountInPaise = Math.round(totalPrice * 100);
  const receipt = `rcpt_${threadId}_human_${Date.now().toString(36)}`;
  const order = await razorpayClient.createOrder(amountInPaise, "INR", receipt);

  logEnvelope(threadId, "ORDER_CREATE", BUYER_ID, RAZORPAY_SYSTEM_ID, {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    receipt: order.receipt,
    total_price: totalPrice,
  });

  logEnvelope(threadId, "ORDER_CONFIRM", RAZORPAY_SYSTEM_ID, BUYER_ID, {
    status: order.status,
    orderId: order.id,
    amount_inr: totalPrice,
    item: offer.item || "flour",
    quantity_kg: offer.quantity_kg || 50,
    message: `Human-authorized Razorpay order ${order.id} confirmed for ₹${totalPrice}.`,
  });

  const purchasedItems: PurchasedItem[] = [
    {
      seller_id: offer.seller_id || "agent:seller:razor_pies",
      item: offer.item || "flour",
      quantity: offer.quantity_kg || 5,
      price: offer.final_price_per_kg || 6,
    },
  ];
  InventoryStore.updateStockAfterOrder(purchasedItems);

  return {
    success: true,
    status: "CONFIRMED",
    order_id: order.id,
    total_amount: totalPrice,
    buyer_stock: (offer.quantity_kg || 5) + 15,
    purchased_items: purchasedItems,
  };
}

export class Orchestrator {
  static runNegotiation = runNegotiation;
  static confirmPendingTransaction = confirmPendingTransaction;
}

export default Orchestrator;
