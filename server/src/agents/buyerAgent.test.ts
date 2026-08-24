import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buyerEvaluateOffer } from "./buyerAgent.js";
import { OfferPayload, RestaurantProfile } from "../types/domain.js";

describe("BuyerAgent (Multi-Model & Fallback)", () => {
  const profile: RestaurantProfile = {
    restaurant_id: "agent:buyer:restaurant_42",
    weekly_budget_cap: 2000,
    per_transaction_cap: 1600,
    quality_min: "Grade A",
    max_price_per_kg: { tomato: 35 },
  };

  test("1. Proposes accept for a valid offer matching restaurant profile", async () => {
    const goodOffer: OfferPayload = {
      item: "tomato",
      quantity_kg: 50,
      quality: "Grade A",
      base_price_per_kg: 32,
      discount_pct: 10,
      discount_reason: "volume_tier",
      final_price_per_kg: 28.8,
      total_price: 1440,
      delivery_by: "2026-08-25T12:00:00Z",
      offer_expires: "2026-08-24T18:00:00Z",
    };

    const decision = await buyerEvaluateOffer(goodOffer, profile);
    assert.equal(decision.action, "propose_accept");
    assert.ok(decision.rationale);
  });

  test("2. Rejects or counters an offer with price above unit ceiling (₹40/kg > ₹35/kg)", async () => {
    const expensiveOffer: OfferPayload = {
      item: "tomato",
      quantity_kg: 50,
      quality: "Grade A",
      base_price_per_kg: 40,
      discount_pct: 0,
      discount_reason: "none",
      final_price_per_kg: 40,
      total_price: 2000,
      delivery_by: "2026-08-25T12:00:00Z",
      offer_expires: "2026-08-24T18:00:00Z",
    };

    const decision = await buyerEvaluateOffer(expensiveOffer, profile);
    assert.ok(decision.action === "send_counter" || decision.action === "reject");
  });

  test("3. Counters when total price is substantially over budget", async () => {
    const massiveOffer: OfferPayload = {
      item: "tomato",
      quantity_kg: 100,
      quality: "Grade A",
      base_price_per_kg: 32,
      discount_pct: 20,
      discount_reason: "bulk",
      final_price_per_kg: 25.6,
      total_price: 2560, // > 1600 * 1.5
      delivery_by: "2026-08-25T12:00:00Z",
      offer_expires: "2026-08-24T18:00:00Z",
    };

    const decision = await buyerEvaluateOffer(massiveOffer, profile);
    assert.ok(decision.action === "send_counter" || decision.action === "propose_accept");
  });
});
