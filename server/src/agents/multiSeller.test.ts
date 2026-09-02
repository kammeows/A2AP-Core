import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { runNegotiation } from "../orchestrator/orchestrator.js";
import { InventoryStore } from "../inventory/inventoryStore.js";
import { buyerEvaluateOffer, BuyerCatalogService } from "./buyerAgent.js";
import { sellerRespondToRfq } from "./sellerAgent.js";
import { computeSellerOffer } from "./pricingEngine.js";
import { ThreadStore } from "../thread/threadStore.js";
import { seedDatabase } from "../db/seed.js";

describe("Multi-Seller Agent Network & Volume Negotiation", () => {
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

  test("2. Seller agents calculate real-time pricing, stock, and volume tiers deterministically", async () => {
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

  test("6. Multi-Item Concurrent Procurement procures multiple missing ingredients in a single A2A cycle", async () => {
    const threadId = "test_multi_item_" + Date.now();
    const result = await runNegotiation({
      threadId,
      scenario: "custom",
      itemsToProcure: [
        { item: "flour", quantity: 4 },
        { item: "cheese", quantity: 3 },
      ],
    });

    assert.equal(result.status, "CONFIRMED");
    assert.ok(result.purchased_items && result.purchased_items.length >= 2);
    assert.ok(result.total_amount && result.total_amount > 0);

    const thread = ThreadStore.getThread(threadId);
    const flourRfqs = thread.filter((m) => m.type === "RFQ" && m.payload.item === "flour");
    const cheeseRfqs = thread.filter((m) => m.type === "RFQ" && m.payload.item === "cheese");

    assert.ok(flourRfqs.length > 0);
    assert.ok(cheeseRfqs.length > 0);
  });

  test("7. Volume-for-price dynamic: Buyer counter crosses volume tier and genuinely moves unit price", async () => {
    // Flour at RazorPies has tiers: >=10u -> 10% (₹7.20), >=20u -> 27.5% (₹5.80)
    const offer15 = await sellerRespondToRfq(
      { item: "flour", quantity_kg: 15 },
      "agent:seller:razor_pies"
    );
    assert.equal(offer15.final_price_per_kg, 7.2);
    assert.equal(offer15.discount_pct, 10);

    // When buyer increases volume to 21 units, price genuinely moves down to ₹5.80
    const offer21 = await sellerRespondToRfq(
      { item: "flour", quantity_kg: 21 },
      "agent:seller:razor_pies"
    );
    assert.equal(offer21.final_price_per_kg, 5.8);
    assert.equal(offer21.discount_pct, 27.5);
  });

  test("8. Orchestrator enforces max 2-round negotiation limit and logs ROUND_CAP_REACHED", async () => {
    const threadId = "test_round_cap_" + Date.now();
    const result = await runNegotiation({
      threadId,
      scenario: "custom",
      itemToProcure: "flour",
      quantityNeeded: 15,
    });

    assert.equal(result.status, "CONFIRMED");
    const thread = ThreadStore.getThread(threadId);
    const roundCapMsg = thread.find((m) => m.type === "ROUND_CAP_REACHED");
    assert.ok(roundCapMsg);
    assert.equal(roundCapMsg.payload.narrative, "round_cap_reached: buyer proceeding with best available offer");
  });

  test("9. Seller never offers stock it does not have and strictly clamps to available stock (Bug 1 Fix)", async () => {
    const sellerCard = InventoryStore.getSellerCard("agent:seller:razor_pies");
    const cheeseStock = sellerCard?.catalog["cheese"]?.stock ?? 15;

    // Request 50 units when seller only has 15 units
    const offer = await sellerRespondToRfq(
      { item: "cheese", quantity_kg: 50 },
      "agent:seller:razor_pies"
    );

    assert.ok(offer.quantity_kg <= cheeseStock, `Offered quantity (${offer.quantity_kg}) must not exceed stock (${cheeseStock})`);
    assert.equal(offer.total_price, Number((offer.final_price_per_kg * offer.quantity_kg).toFixed(2)));
  });

  test("10. Hard code check in Orchestrator logs REJECT and never logs OFFER when seller is out of stock", async () => {
    const threadId = "test_stock_reject_" + Date.now();
    
    // Set RazorPies milk stock to 0 in database
    const card = InventoryStore.getSellerCard("agent:seller:razor_pies");
    if (card && card.catalog["milk"]) {
      card.catalog["milk"].stock = 0;
      InventoryStore.saveAgentCard(card);
    }

    const result = await runNegotiation({
      threadId,
      scenario: "custom",
      itemToProcure: "milk",
      quantityNeeded: 5,
    });

    const thread = ThreadStore.getThread(threadId);
    const razorPiesOffers = thread.filter(
      (m) => m.type === "OFFER" && (m.from.includes("razor_pies") || (m.payload as any)?.seller_id?.includes("razor_pies"))
    );
    // RazorPies had 0 milk stock, so it must NEVER have an OFFER logged!
    assert.equal(razorPiesOffers.length, 0);

    const rejects = thread.filter(
      (m) => m.type === "REJECT" && m.from.includes("razor_pies")
    );
    assert.ok(rejects.length > 0, "Out-of-stock seller must have REJECT logged");
  });

  test("11. Seller offers available partial stock (4 units) when buyer demands 5 units and buyer accepts", async () => {
    const threadId = "test_partial_stock_" + Date.now();

    // RazorPies has 4 cheese units, buyer needs 5 units
    const result = await runNegotiation({
      threadId,
      scenario: "custom",
      itemToProcure: "cheese",
      quantityNeeded: 5,
      sellerInventories: {
        "agent:seller:razor_pies": { cheese: 4 },
      },
    });

    assert.equal(result.status, "CONFIRMED");
    const thread = ThreadStore.getThread(threadId);

    // Must have an OFFER for 4 units (NOT a reject!)
    const offerMsg = thread.find(
      (m) => m.type === "OFFER" && (m.from.includes("razor_pies") || (m.payload as any)?.seller_id?.includes("razor_pies"))
    );
    assert.ok(offerMsg, "Seller with 4 units must produce an OFFER for 4 units, not reject");
    assert.equal((offerMsg.payload as any).quantity_kg, 4);
    assert.equal((offerMsg.payload as any).stock_limited, true);

    // Final order confirmed for 4 units
    const confirmMsg = thread.find((m) => m.type === "ORDER_CONFIRM");
    assert.ok(confirmMsg);
  });

  test("12. Buyer discovers seller catalogs and caches published volume discount tiers & base prices at session start", () => {
    BuyerCatalogService.clearCache();
    const cached = BuyerCatalogService.discoverAndCacheCatalogs();
    assert.ok(cached.length >= 3);

    // RazorPies wholesale price sheet & discount tiers
    const pies = cached.find((c) => c.seller_id === "agent:seller:razor_pies");
    assert.ok(pies);
    assert.equal(pies.base_prices["flour"].base_price, 8);
    assert.deepEqual(pies.discount_tiers["flour"], [
      { min_quantity: 10, discount_pct: 10 },
      { min_quantity: 20, discount_pct: 27.5 },
    ]);
    assert.deepEqual(pies.discount_tiers["cheese"], [
      { min_quantity: 5, discount_pct: 10 },
      { min_quantity: 10, discount_pct: 20 },
    ]);

    // Razorcery-1 wholesale price sheet & discount tiers
    const cery1 = cached.find((c) => c.seller_id === "agent:seller:razorcery_1");
    assert.ok(cery1);
    assert.equal(cery1.base_prices["flour"].base_price, 6);
    assert.deepEqual(cery1.discount_tiers["flour"], [
      { min_quantity: 5, discount_pct: 10 },
      { min_quantity: 12, discount_pct: 20 },
    ]);

    // Querying matching sellers for flour returns RazorPies and Razorcery-1
    const flourSellers = BuyerCatalogService.getCachedSellersForItem("flour");
    assert.ok(flourSellers.some((s) => s.seller_id === "agent:seller:razor_pies"));
    assert.ok(flourSellers.some((s) => s.seller_id === "agent:seller:razorcery_1"));
  });

  test("13. Cached catalog excludes decision-grade stock levels, and live stock is dynamically queried per RFQ", async () => {
    // 1. Initial cached catalog has base prices and tiers, but buyer never treats stock as static
    const cached = BuyerCatalogService.getCachedCatalogs();
    const pies = cached.find((c) => c.seller_id === "agent:seller:razor_pies");
    assert.ok(pies);
    // Cached catalog does not contain authoritative live stock properties
    assert.equal((pies as any).stock, undefined);

    // 2. Change live seller stock in inventory
    const cards = InventoryStore.getAgentCards();
    const piesCard = cards.find((c) => c.agent_id === "agent:seller:razor_pies");
    if (piesCard) {
      piesCard.catalog.cheese.stock = 2; // Only 2 units left live
      InventoryStore.saveAgentCard(piesCard);
    }

    // 3. When RFQ happens, orchestrator queries live stock at RFQ moment
    const threadId = "test_live_stock_query_" + Date.now();
    const result = await runNegotiation({
      threadId,
      scenario: "custom",
      itemToProcure: "cheese",
      quantityNeeded: 5,
    });

    const thread = ThreadStore.getThread(threadId);
    const offerMsg = thread.find(
      (m) => m.type === "OFFER" && (m.from.includes("razor_pies") || (m.payload as any)?.seller_id?.includes("razor_pies"))
    );
    // Live stock (2 units) was queried dynamically, capping offer to 2 units
    assert.ok(offerMsg);
    assert.equal((offerMsg.payload as any).quantity_kg, 2);
    assert.equal((offerMsg.payload as any).stock_limited, true);
  });

  test("14. Buyer target price for tomatoes is anchored below wholesale catalog rate (never exceeding ₹3.00/u)", async () => {
    const threadId = "test_tomato_target_price_" + Date.now();
    const result = await runNegotiation({
      threadId,
      scenario: "custom",
      itemToProcure: "tomatoes",
      quantityNeeded: 1,
    });

    const thread = ThreadStore.getThread(threadId);
    const rfqMsgs = thread.filter((m) => m.type === "RFQ");
    assert.ok(rfqMsgs.length > 0);

    for (const rfq of rfqMsgs) {
      const targetPrice = (rfq.payload as any).target_price_per_unit;
      // Catalog rate for tomatoes is ₹3.00/unit, target price must be below ₹3.00 (e.g. ₹2.70), never ₹3.50
      assert.ok(targetPrice < 3.0, `Target price ₹${targetPrice} must be below catalog base price ₹3.00`);
      assert.equal(targetPrice, 2.7);
    }
  });
});
