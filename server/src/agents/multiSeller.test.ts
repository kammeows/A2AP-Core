import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { runNegotiation } from "../orchestrator/orchestrator.js";
import { InventoryStore } from "../inventory/inventoryStore.js";
import { buyerEvaluateOffer } from "./buyerAgent.js";
import { sellerRespondToRfq } from "./sellerAgent.js";
import { ThreadStore } from "../thread/threadStore.js";
import { seedDatabase } from "../db/seed.js";

describe("Multi-Seller Agent Network & Split-Order Optimization", () => {
  beforeEach(() => {
    ThreadStore.clearAll();
    seedDatabase();
  });

  test("1. Buyer discovers known sellers via Agent Cards", () => {
    const cards = InventoryStore.getAgentCards();
    assert.ok(cards.length >= 3);
    const pies = cards.find((c) => c.agent_id === "agent:seller:razor_pies");
    const cery1 = cards.find((c) => c.agent_id === "agent:seller:razorcery_1");
    const cery2 = cards.find((c) => c.agent_id === "agent:seller:razorcery_2");

    assert.ok(pies);
    assert.ok(cery1);
    assert.ok(cery2);

    assert.deepEqual(pies?.stocked_items, ["cheese", "flour", "milk"]);
    assert.deepEqual(cery1?.stocked_items, ["flour", "tomatoes", "onions"]);
    assert.deepEqual(cery2?.stocked_items, ["milk", "tomatoes", "onions"]);
  });

  test("2. Seller agents calculate real-time pricing, stock, and volume tiers via get_stock", async () => {
    // RazorPies cheese RFQ (>= 5 units -> 10% discount from base ₹4 -> ₹3.60)
    const offerPies = await sellerRespondToRfq(
      { item: "cheese", quantity_kg: 6 },
      "agent:seller:razor_pies"
    );
    assert.equal(offerPies.seller_id, "agent:seller:razor_pies");
    assert.equal(offerPies.item, "cheese");
    assert.equal(offerPies.base_price_per_kg, 4);
    assert.equal(offerPies.discount_pct, 10);
    assert.equal(offerPies.final_price_per_kg, 3.6);
    assert.equal(offerPies.total_price, 21.6);
    assert.ok(offerPies.rationale?.includes("RazorPies Wholesale"));

    // Razorcery-1 flour RFQ (>= 5 units -> 10% discount from base ₹6 -> ₹5.40)
    const offerCery1 = await sellerRespondToRfq(
      { item: "flour", quantity_kg: 5 },
      "agent:seller:razorcery_1"
    );
    assert.equal(offerCery1.seller_id, "agent:seller:razorcery_1");
    assert.equal(offerCery1.final_price_per_kg, 5.4);
  });

  test("3. Buyer evaluates multiple seller quotes and chooses lowest total cost", async () => {
    const profile = {
      restaurant_id: "agent:buyer:razorslice",
      weekly_budget_cap: 2000,
      per_transaction_cap: 1600,
      quality_min: "Grade A",
      max_price_per_kg: { flour: 35, cheese: 35 },
    };

    const offer1 = {
      seller_id: "agent:seller:razor_pies",
      item: "flour",
      quantity_kg: 2,
      quality: "Grade A",
      base_price_per_kg: 8,
      discount_pct: 0,
      discount_reason: "standard",
      final_price_per_kg: 8,
      total_price: 16,
      delivery_by: "2026-08-28T12:00:00Z",
      offer_expires: "2026-08-28T18:00:00Z",
    };

    const offer2 = {
      seller_id: "agent:seller:razorcery_1",
      item: "flour",
      quantity_kg: 2,
      quality: "Grade A",
      base_price_per_kg: 6,
      discount_pct: 0,
      discount_reason: "standard",
      final_price_per_kg: 6,
      total_price: 12,
      delivery_by: "2026-08-28T12:00:00Z",
      offer_expires: "2026-08-28T18:00:00Z",
    };

    const decision = await buyerEvaluateOffer(offer1, profile, [offer1, offer2]);
    assert.equal(decision.action, "propose_accept");
    assert.equal(decision.target_offer?.seller_id, "agent:seller:razorcery_1");
    assert.equal(decision.target_offer?.total_price, 12);
  });

  test("4. Buyer declines unsolicited upsells not on pizza recipes", async () => {
    const profile = {
      restaurant_id: "agent:buyer:razorslice",
      weekly_budget_cap: 2000,
      per_transaction_cap: 1600,
      quality_min: "Grade A",
      max_price_per_kg: { flour: 35 },
    };

    const offerWithJalapenos = {
      seller_id: "agent:seller:razorcery_1",
      item: "flour",
      quantity_kg: 2,
      quality: "Grade A",
      base_price_per_kg: 6,
      discount_pct: 0,
      discount_reason: "standard",
      final_price_per_kg: 6,
      total_price: 12,
      delivery_by: "2026-08-28T12:00:00Z",
      offer_expires: "2026-08-28T18:00:00Z",
      upsell_item: {
        item: "jalapenos",
        quantity_kg: 2,
        unit_price: 10,
      },
    };

    const decision = await buyerEvaluateOffer(offerWithJalapenos, profile, [offerWithJalapenos]);
    assert.ok(decision.declined_upsell_reason?.includes("not used in any RazorSlice pizza recipe"));
  });

  test("5. Full Orchestration sends concurrent RFQs to all matching sellers and logs explainable audit trail", async () => {
    const threadId = "test_multi_rfq_" + Date.now();
    const result = await runNegotiation({
      threadId,
      scenario: "custom",
      itemToProcure: "flour",
      quantityNeeded: 6,
    });

    assert.equal(result.status, "CONFIRMED");
    assert.ok(result.total_amount && result.total_amount > 0);

    const thread = ThreadStore.getThread(threadId);
    // Should have RFQs to both RazorPies and Razorcery-1 (since both sell flour)
    const rfqMsgs = thread.filter((m) => m.type === "RFQ");
    assert.ok(rfqMsgs.length >= 2);

    const offerMsgs = thread.filter((m) => m.type === "OFFER");
    assert.ok(offerMsgs.length >= 2);

    const policyMsg = thread.find((m) => m.type === "POLICY_CHECK");
    assert.ok(policyMsg);
    assert.equal(policyMsg.payload.approved, true);

    const orderConfirmMsg = thread.find((m) => m.type === "ORDER_CONFIRM");
    assert.ok(orderConfirmMsg);
  });
});
