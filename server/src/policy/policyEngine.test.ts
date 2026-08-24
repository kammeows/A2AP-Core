import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { evaluateDeal } from "./policyEngine.js";
import { OfferPayload } from "../types/domain.js";
import { PolicyConfig } from "../types/policy.js";

describe("PolicyEngine (evaluateDeal)", () => {
  const basePolicy: PolicyConfig = {
    agent_id: "agent:buyer:restaurant_42",
    delegation_mode: "full",
    weekly_budget_cap: 2000,
    per_transaction_cap: 1600,
    per_unit_price_ceiling: { tomato: 35 },
    seller_allowlist: ["agent:seller:veggie_vendor_09"],
  };

  const validOffer: OfferPayload = {
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

  test("1. Approves an offer that passes every check (Happy Path)", () => {
    const result = evaluateDeal(
      validOffer,
      "agent:seller:veggie_vendor_09",
      basePolicy,
      0,
    );

    assert.equal(result.approved, true);
    assert.equal(result.action, "AUTO_ACCEPT");
    assert.equal(result.checks.length, 4);
    assert.ok(result.checks.every((c) => c.passed));
  });

  test("2. Rejects an offer that breaches per_transaction_cap (₹1,968 > ₹1,600)", () => {
    const overCapOffer: OfferPayload = {
      ...validOffer,
      quantity_kg: 75,
      discount_pct: 18,
      discount_reason: "bulk_volume_tier",
      final_price_per_kg: 26.24,
      total_price: 1968, // breaches 1600 cap
    };

    const result = evaluateDeal(
      overCapOffer,
      "agent:seller:veggie_vendor_09",
      basePolicy,
      0,
    );

    assert.equal(result.approved, false);
    assert.equal(result.action, "RENEGOTIATE_OR_ESCALATE");

    const capCheck = result.checks.find(
      (c) => c.rule === "within_per_transaction_cap",
    );
    assert.ok(capCheck);
    assert.equal(capCheck!.passed, false);
    assert.equal(capCheck!.value, 1968);
    assert.equal(capCheck!.limit, 1600);
  });

  test("3. Rejects an offer from a seller not on the allowlist", () => {
    const result = evaluateDeal(
      validOffer,
      "agent:seller:unknown_untrusted_vendor_99",
      basePolicy,
      0,
    );

    assert.equal(result.approved, false);
    assert.equal(result.action, "RENEGOTIATE_OR_ESCALATE");

    const allowlistCheck = result.checks.find(
      (c) => c.rule === "seller_allowlisted",
    );
    assert.ok(allowlistCheck);
    assert.equal(allowlistCheck!.passed, false);
  });

  test("4. Rejects an offer that breaches weekly_budget_cap given non-zero weekSpentSoFar", () => {
    // Total is 1440, but already spent 800 this week (remaining budget = 2000 - 800 = 1200 < 1440)
    const result = evaluateDeal(
      validOffer,
      "agent:seller:veggie_vendor_09",
      basePolicy,
      800,
    );

    assert.equal(result.approved, false);
    assert.equal(result.action, "RENEGOTIATE_OR_ESCALATE");

    const weeklyCheck = result.checks.find(
      (c) => c.rule === "within_weekly_budget",
    );
    assert.ok(weeklyCheck);
    assert.equal(weeklyCheck!.passed, false);
    assert.equal(weeklyCheck!.value, 1440);
    assert.equal(weeklyCheck!.limit, 1200);
  });

  test("5. Rejects an offer exceeding per_unit_price_ceiling (₹38/kg > ₹35/kg)", () => {
    const expensiveUnitOffer: OfferPayload = {
      ...validOffer,
      quantity_kg: 10,
      final_price_per_kg: 38, // ceiling is 35
      total_price: 380,
    };

    const result = evaluateDeal(
      expensiveUnitOffer,
      "agent:seller:veggie_vendor_09",
      basePolicy,
      0,
    );

    assert.equal(result.approved, false);
    const unitPriceCheck = result.checks.find(
      (c) => c.rule === "unit_price_within_ceiling",
    );
    assert.ok(unitPriceCheck);
    assert.equal(unitPriceCheck!.passed, false);
    assert.equal(unitPriceCheck!.value, 38);
    assert.equal(unitPriceCheck!.limit, 35);
  });

  test("6. Returns RENEGOTIATE_OR_ESCALATE when delegation_mode is 'partial' even if all checks pass", () => {
    const partialPolicy: PolicyConfig = {
      ...basePolicy,
      delegation_mode: "partial",
    };

    const result = evaluateDeal(
      validOffer,
      "agent:seller:veggie_vendor_09",
      partialPolicy,
      0,
    );

    assert.equal(result.approved, true);
    assert.equal(result.action, "RENEGOTIATE_OR_ESCALATE");
  });
});
