import { appendMessage, getThread, db } from "../thread/threadStore.js";
import { evaluateDeal } from "../policy/policyEngine.js";
import { sellerRespondToRfq } from "../agents/sellerAgent.js";
import { buyerEvaluateOffer, BuyerCatalogService } from "../agents/buyerAgent.js";
import {
  evaluateOfferAgainstCeiling,
  computeCounterQuantity,
  getBuyerCeiling,
  getBuyerTargetPrice,
  normalizeIngredientKey,
  defaultBuyerNegotiationPolicy,
} from "../agents/negotiationPolicy.js";
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
  payment_id?: string;
  signature?: string;
  signature_verified?: boolean;
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
    if (row && row.config) {
      const parsed = JSON.parse(row.config);
      return {
        ...defaultBuyerPolicy,
        ...parsed,
        agent_id: agentId,
        per_unit_price_ceiling: {
          ...defaultBuyerPolicy.per_unit_price_ceiling,
          ...(parsed.per_unit_price_ceiling || {}),
        },
        seller_allowlist: Array.isArray(parsed.seller_allowlist)
          ? parsed.seller_allowlist
          : defaultBuyerPolicy.seller_allowlist,
      };
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
  sellerInventories?: Record<string, Record<string, number>>;
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

  // Sync live seller inventories if provided from UI
  if (params.sellerInventories) {
    InventoryStore.syncSellerInventories(params.sellerInventories);
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

  // Process all deficit items concurrently across the A2A seller network with a hard 2-round cap
  for (const it of itemsList) {
    const item = it.item;
    const deficitQuantity = it.quantity;
    const norm = normalizeIngredientKey(item);

    // Strategic buyer target price anchored below wholesale list rates (guaranteed <= catalog base price)
    let targetPricePerUnit = getBuyerTargetPrice(
      item,
      scenario,
      params.customRfq?.target_price_per_unit
    );

    const ceilingMap = policy.per_unit_price_ceiling || defaultBuyerPolicy.per_unit_price_ceiling || {};
    const negotiationCeiling = getBuyerCeiling(item, ceilingMap[item] || ceilingMap[norm]);

    let matchingSellers: Array<{ agent_id: string; name: string; stocked_items: string[] }>;
    if (scenario === "happy" || scenario === "failure") {
      matchingSellers = [
        {
          agent_id: "agent:seller:veggie_vendor_09",
          name: "Veggie Vendor 09",
          stocked_items: ["tomato"],
        },
      ];
      targetPricePerUnit = 28.0;
    } else {
      // Discover matching sellers from Buyer's cached catalog (base prices & discount tiers cached at session start)
      const cachedMatching = BuyerCatalogService.getCachedSellersForItem(item);
      matchingSellers = cachedMatching.map((c) => ({
        agent_id: c.seller_id,
        name: c.name,
        stocked_items: c.stocked_items,
      }));

      if (matchingSellers.length === 0) {
        matchingSellers = [
          {
            agent_id: "agent:seller:veggie_vendor_09",
            name: "Veggie Vendor 09",
            stocked_items: [item],
          },
        ];
      }
    }

    const rfqBase: RfqPayload = {
      item,
      quantity_kg: deficitQuantity,
      quality_min: "Grade A",
      needed_by: tomorrow,
      buyer_max_price_per_kg: ceilingMap[item] || ceilingMap[norm] || 35,
      target_price_per_unit: targetPricePerUnit,
      ...params.customRfq,
    };

    // ==========================================
    // ROUND 1: Broadcast RFQs with Target Price
    // ==========================================
    for (const seller of matchingSellers) {
      logEnvelope(threadId, "RFQ", BUYER_ID, seller.agent_id, {
        ...rfqBase,
        target_seller_id: seller.agent_id,
        seller_name: seller.name,
        target_price_per_unit: targetPricePerUnit,
        narrative: `RazorSlice requested wholesale quote for ${rfqBase.quantity_kg} units of ${rfqBase.item} from ${seller.name} with target price ₹${targetPricePerUnit}/unit.`,
      });
    }

    // Collect Round 1 Quotes
    const rawOffers = await Promise.all(
      matchingSellers.map((seller) => sellerRespondToRfq(rfqBase, seller.agent_id))
    );

    let sellerOffers: OfferPayload[] = [];
    for (let i = 0; i < matchingSellers.length; i++) {
      const seller = matchingSellers[i];
      const offer = rawOffers[i];
      const state = InventoryStore.getSellerItemState(seller.agent_id, item);
      const currentStock = state ? state.stock : (scenario === "happy" || scenario === "failure" ? 500 : 0);

      // Hard code-level check: reject ONLY when current stock is strictly 0 or offer quantity is 0
      if (offer.quantity_kg <= 0 || currentStock <= 0) {
        logEnvelope(threadId, "REJECT", seller.agent_id, BUYER_ID, {
          item,
          requested_quantity: rfqBase.quantity_kg,
          offered_quantity: 0,
          current_stock: currentStock,
          reason: "out_of_stock",
          narrative: `${seller.name} rejected quote: ${item} is currently out of stock (0u available).`,
        });
        continue;
      }

      const isStockLimited = offer.quantity_kg < rfqBase.quantity_kg;
      const stockLimitText = isStockLimited
        ? ` (seller has only ${offer.quantity_kg}u in stock, partial fulfillment offered)`
        : "";

      logEnvelope(threadId, "OFFER", offer.seller_id || seller.agent_id, BUYER_ID, {
        ...offer,
        stock_limited: isStockLimited,
        stockLimited: isStockLimited,
        narrative: `Wholesale quote (Round 1): ${offer.quantity_kg} units at ₹${offer.final_price_per_kg}/unit (Total ₹${offer.total_price}) with ${offer.discount_pct}% discount (current stock: ${currentStock}u)${stockLimitText}.`,
      });
      sellerOffers.push(offer);
    }

    if (sellerOffers.length === 0) {
      logEnvelope(threadId, "REJECT", BUYER_ID, POLICY_ENGINE_ID, {
        reason: "SOURCING_FAIL",
        fail_reason: "no_valid_stock_offers",
        item,
        requested_quantity: deficitQuantity,
        narrative: `All matching sellers lack sufficient stock for ${item} (SOURCING_FAIL: 0u fulfillable of ${deficitQuantity}u requested). Procurement skipped for this item.`,
      });
      continue;
    }

    // =========================================================================
    // ROUND 2: Volume-for-Price Counter Negotiation Loop
    // =========================================================================
    if (scenario === "custom" && allowRenegotiation && sellerOffers.length > 0) {
      const revisedOffers: OfferPayload[] = [];
      let hadCounter = false;

      for (const initialOffer of sellerOffers) {
        const targetSellerId = initialOffer.seller_id || "agent:seller";
        const state = InventoryStore.getSellerItemState(targetSellerId, item);
        const currentStock = state ? state.stock : 0;

        const ceilingCheck = evaluateOfferAgainstCeiling(initialOffer.final_price_per_kg, negotiationCeiling);

        // If the seller's quote exceeds the buyer's ceiling, counter with more volume commitment
        if (!ceilingCheck.passed && !initialOffer.stockLimited && currentStock > initialOffer.quantity_kg) {
          const counterQty = computeCounterQuantity(
            initialOffer.quantity_kg,
            deficitQuantity,
            defaultBuyerNegotiationPolicy
          );
          const committedQty = Math.min(currentStock, counterQty);

          if (committedQty > initialOffer.quantity_kg) {
            hadCounter = true;
            logEnvelope(threadId, "COUNTER_OFFER", BUYER_ID, targetSellerId, {
              item,
              quantity_kg: committedQty,
              target_price_per_unit: targetPricePerUnit,
              narrative: `Volume Commitment Counter: "I'll commit to ${committedQty} units instead of ${initialOffer.quantity_kg} units if you do ₹${targetPricePerUnit.toFixed(2)}/unit."`,
            });

            const counterRfq: RfqPayload = {
              item,
              quantity_kg: committedQty,
              quality_min: "Grade A",
              needed_by: tomorrow,
              buyer_max_price_per_kg: ceilingMap[item] || ceilingMap[norm] || 35,
              target_price_per_unit: targetPricePerUnit,
            };

            const revisedOffer = await sellerRespondToRfq(counterRfq, targetSellerId);

            if (revisedOffer.quantity_kg <= 0) {
              revisedOffers.push(initialOffer);
              continue;
            }

            logEnvelope(threadId, "OFFER", targetSellerId, BUYER_ID, {
              ...revisedOffer,
              narrative: `Revised quote (Round 2): ${revisedOffer.quantity_kg} units at ₹${revisedOffer.final_price_per_kg}/unit (Total ₹${revisedOffer.total_price}) after volume concession (current stock: ${currentStock}u).`,
            });

            revisedOffers.push(revisedOffer);
          } else {
            revisedOffers.push(initialOffer);
          }
        } else {
          revisedOffers.push(initialOffer);
        }
      }

      if (hadCounter) {
        sellerOffers = revisedOffers;

        // Enforce Hard 2-Round Cap
        logEnvelope(threadId, "ROUND_CAP_REACHED", POLICY_ENGINE_ID, BUYER_ID, {
          round_count: 2,
          round_limit: 2,
          narrative: "round_cap_reached: buyer proceeding with best available offer",
        });
      }
    }

    // Evaluate final offers using Buyer Agent (Single lowest quote vs Multi-seller split deal)
    const buyerDecision: BuyerDecision = await buyerEvaluateOffer(
      sellerOffers[0],
      restaurantProfile,
      sellerOffers,
      deficitQuantity
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
        unmet_quantity_kg: split.unmet_quantity_kg || 0,
      });

      if (split.unmet_quantity_kg && split.unmet_quantity_kg > 0) {
        logEnvelope(threadId, "INVENTORY_EVENT", BUYER_ID, "system", {
          event: "SOURCING_SHORTFALL",
          item: split.item,
          requested_quantity: deficitQuantity,
          fulfilled_quantity: split.total_quantity_kg,
          unmet_quantity: split.unmet_quantity_kg,
          narrative: `Sourcing shortfall: ${split.unmet_quantity_kg}u of ${split.item} could not be fulfilled (requested ${deficitQuantity}u, aggregate seller stock is only ${split.total_quantity_kg}u).`,
        });
      }

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

      if (itemChosenOffer.quantity_kg < deficitQuantity) {
        const shortfall = deficitQuantity - itemChosenOffer.quantity_kg;
        logEnvelope(threadId, "INVENTORY_EVENT", BUYER_ID, "system", {
          event: "SOURCING_SHORTFALL",
          item: itemChosenOffer.item,
          requested_quantity: deficitQuantity,
          fulfilled_quantity: itemChosenOffer.quantity_kg,
          unmet_quantity: shortfall,
          narrative: `Sourcing shortfall: ${shortfall}u of ${itemChosenOffer.item} could not be fulfilled (requested ${deficitQuantity}u, single seller fulfilled ${itemChosenOffer.quantity_kg}u).`,
        });
      }

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
      const pendingOfferWithItems = {
        ...lastChosenOffer,
        total_price: totalDealAmount,
        items: allPurchasedItems,
      };
      return {
        thread_id: threadId,
        scenario,
        status: "AWAITING_CONFIRMATION",
        final_message_type: "ACCEPT",
        pending_offer: pendingOfferWithItems,
        policy_checks: allPolicyChecks,
        total_amount: totalDealAmount,
        purchased_items: [],
      };
    }

    const amountInPaise = Math.round(totalDealAmount * 100);
    const receipt = `rc_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    const order = await razorpayClient.createOrder(amountInPaise, "INR", receipt);

    logEnvelope(threadId, "ORDER_CREATE", BUYER_ID, RAZORPAY_SYSTEM_ID, {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      total_price: totalDealAmount,
      status: "created",
      is_mock: order.is_mock,
      narrative: `Razorpay Order ${order.id} created for ₹${totalDealAmount}. Status: created. Initiating automated delegated payment settlement via UPI Circle.`,
    });

    // Settle payment: authorize & capture transaction with cryptographic verification
    const settlement = await razorpayClient.settlePayment({
      order,
      simulatePaymentFail: Boolean(params.simulatePaymentFail),
      method: "upi_circle",
    });

    if (!settlement.success || settlement.status !== "captured") {
      logEnvelope(threadId, "ORDER_FAIL", RAZORPAY_SYSTEM_ID, BUYER_ID, {
        reason: settlement.error || "PAYMENT_CAPTURE_FAILED",
        orderId: order.id,
        paymentId: settlement.paymentId,
        message: settlement.message || "Payment settlement failed at gateway. Inventory remains unchanged.",
        requires_human_approval: true,
      });

      // CRITICAL: Inventory is NEVER decremented for an uncaptured payment!
      return {
        thread_id: threadId,
        scenario,
        status: "PAYMENT_FAILED",
        final_message_type: "ORDER_FAIL",
        order_id: order.id,
        payment_id: settlement.paymentId,
        message: settlement.message || "Payment settlement failed",
        policy_checks: allPolicyChecks,
      };
    }

    logEnvelope(threadId, "ORDER_CONFIRM", RAZORPAY_SYSTEM_ID, BUYER_ID, {
      status: "paid",
      orderId: order.id,
      paymentId: settlement.paymentId,
      signature: settlement.signature,
      signature_verified: settlement.signatureVerified,
      payment_method: settlement.method,
      amount_inr: totalDealAmount,
      amount_paise: amountInPaise,
      message: `Razorpay payment ${settlement.paymentId} CAPTURED and HMAC-SHA256 signature verified for Order ${order.id}. ₹${totalDealAmount} settled via UPI Circle.`,
    });

    // Update database & store for all purchased items ONLY AFTER confirmed payment settlement
    InventoryStore.updateStockAfterOrder(allPurchasedItems);

    return {
      thread_id: threadId,
      scenario,
      status: "CONFIRMED",
      final_message_type: "ORDER_CONFIRM",
      order_id: order.id,
      payment_id: settlement.paymentId,
      signature: settlement.signature,
      signature_verified: settlement.signatureVerified,
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
          buyer_max_price_per_kg:
            (policy.per_unit_price_ceiling && policy.per_unit_price_ceiling[lastChosenOffer!.item]) ||
            defaultBuyerPolicy.per_unit_price_ceiling[lastChosenOffer!.item] ||
            35,
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
          status: "created",
          is_mock: order.is_mock,
          narrative: `Razorpay Order ${order.id} created for ₹${counterOffer.total_price} following bounded renegotiation.`,
        });

        // Settle payment with cryptographic signature verification
        const settlement = await razorpayClient.settlePayment({
          order,
          simulatePaymentFail: Boolean(params.simulatePaymentFail),
          method: "upi_circle",
        });

        if (!settlement.success || settlement.status !== "captured") {
          logEnvelope(threadId, "ORDER_FAIL", RAZORPAY_SYSTEM_ID, BUYER_ID, {
            reason: settlement.error || "PAYMENT_CAPTURE_FAILED",
            orderId: order.id,
            paymentId: settlement.paymentId,
            message: settlement.message || "Renegotiated deal payment capture failed. Inventory unchanged.",
          });
          return {
            thread_id: threadId,
            scenario,
            status: "PAYMENT_FAILED",
            final_message_type: "ORDER_FAIL",
            order_id: order.id,
            payment_id: settlement.paymentId,
            message: settlement.message || "Payment settlement failed",
            policy_checks: rePolicyResult.checks,
          };
        }

        logEnvelope(threadId, "ORDER_CONFIRM", RAZORPAY_SYSTEM_ID, BUYER_ID, {
          status: "paid",
          orderId: order.id,
          paymentId: settlement.paymentId,
          signature: settlement.signature,
          signature_verified: settlement.signatureVerified,
          payment_method: settlement.method,
          amount_inr: counterOffer.total_price,
          item: counterOffer.item,
          quantity_kg: counterOffer.quantity_kg,
          message: `Negotiation succeeded: Razorpay payment ${settlement.paymentId} CAPTURED (Order ${order.id}) for ₹${counterOffer.total_price} after bounded renegotiation.`,
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
          payment_id: settlement.paymentId,
          signature: settlement.signature,
          signature_verified: settlement.signatureVerified,
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
  payment_id?: string;
  signature?: string;
  signature_verified?: boolean;
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

  const totalPrice = offer.total_price || 1440;
  const amountInPaise = Math.round(totalPrice * 100);
  const receipt = `rc_h_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
  const order = await razorpayClient.createOrder(amountInPaise, "INR", receipt);

  logEnvelope(threadId, "ORDER_CREATE", BUYER_ID, RAZORPAY_SYSTEM_ID, {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    receipt: order.receipt,
    total_price: totalPrice,
    status: "created",
    is_mock: order.is_mock,
    narrative: `Human-authorized Razorpay Order ${order.id} created for ₹${totalPrice}. Initiating payment capture.`,
  });

  const settlement = await razorpayClient.settlePayment({
    order,
    simulatePaymentFail: Boolean(simulatePaymentFail),
    method: "upi_circle",
  });

  if (!settlement.success || settlement.status !== "captured") {
    logEnvelope(threadId, "ORDER_FAIL", RAZORPAY_SYSTEM_ID, BUYER_ID, {
      reason: settlement.error || "PAYMENT_GATEWAY_ERROR",
      orderId: order.id,
      paymentId: settlement.paymentId,
      message: settlement.message || "Simulated payment processing error at gateway. Inventory unchanged.",
    });
    return { success: false, status: "PAYMENT_FAILED" };
  }

  logEnvelope(threadId, "ORDER_CONFIRM", RAZORPAY_SYSTEM_ID, BUYER_ID, {
    status: "paid",
    orderId: order.id,
    paymentId: settlement.paymentId,
    signature: settlement.signature,
    signature_verified: settlement.signatureVerified,
    payment_method: settlement.method,
    amount_inr: totalPrice,
    item: offer.item || "flour",
    quantity_kg: offer.quantity_kg || 50,
    message: `Human-authorized Razorpay payment ${settlement.paymentId} CAPTURED (Order ${order.id}) for ₹${totalPrice}.`,
  });

  const purchasedItems: PurchasedItem[] =
    (offer as any).items && Array.isArray((offer as any).items) && (offer as any).items.length > 0
      ? (offer as any).items
      : [
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
    payment_id: settlement.paymentId,
    signature: settlement.signature,
    signature_verified: settlement.signatureVerified,
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
