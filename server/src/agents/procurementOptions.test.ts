import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  computeConsumptionRate,
  projectStock,
  costLookup,
  computeProcurementOptions,
  validateReasoningNumbers,
  LivePantryState,
} from "./procurementOptions.js";
import {
  DeferredDecisionStore,
  checkDeferredDecisions,
} from "../procurement/deferredDecisions.js";
import { BuyerAgent, chooseProcurementOptionDeterministically } from "./buyerAgent.js";
import { seedDatabase } from "../db/seed.js";
import { ThreadStore } from "../thread/threadStore.js";

describe("Procurement Options, Look-Ahead & Fact Verification (options-tools.md)", () => {
  beforeEach(() => {
    ThreadStore.clearAll();
    seedDatabase();
    DeferredDecisionStore.clearAll();
    BuyerAgent.clearCache();
  });

  test("1. computeConsumptionRate calculates exact rate over recent event window", () => {
    const events = [
      { item: "flour", tick: 1, quantityUsed: 5 },
      { item: "flour", tick: 2, quantityUsed: 5 },
      { item: "cheese", tick: 2, quantityUsed: 2 },
      { item: "flour", tick: 4, quantityUsed: 5 },
    ];

    // Tick 5, lookback 5 ticks -> 15 flour used / 5 ticks = 3.00/tick
    const rateFlour = computeConsumptionRate("flour", events, 5, 5);
    assert.equal(rateFlour, 3);

    // Cheese: 2 cheese used / 5 ticks = 0.40/tick
    const rateCheese = computeConsumptionRate("cheese", events, 5, 5);
    assert.equal(rateCheese, 0.4);
  });

  test("2. projectStock calculates linear stock projection bounded at zero", () => {
    const projected = projectStock(20, 3, 3); // 20 - 3*3 = 11
    assert.equal(projected, 11);

    const projectedFloor = projectStock(5, 3, 3); // 5 - 9 = 0 (bounded)
    assert.equal(projectedFloor, 0);
  });

  test("3. computeProcurementOptions generates buy_minimal, buy_to_tier, and wait with exact reasoning_facts", () => {
    const live: LivePantryState = {
      currentTick: 5,
      stock: { flour: 12, cheese: 4, tomatoes: 5, onions: 5, milk: 5 },
      target: { flour: 30, cheese: 10, tomatoes: 10, onions: 10, milk: 10 },
      safetyFloor: { flour: 8, cheese: 3, tomatoes: 3, onions: 3, milk: 3 },
      recentEvents: [
        { item: "flour", tick: 1, quantityUsed: 5 },
        { item: "flour", tick: 3, quantityUsed: 5 },
      ],
    };

    const options = computeProcurementOptions("flour", live);
    assert.ok(options.length >= 2, "Must produce at least minimal and tier/wait options");

    // Option A: buy_minimal
    const buyMinimal = options.find((o) => o.option_id === "buy_minimal");
    assert.ok(buyMinimal);
    assert.equal(buyMinimal.action_type, "buy");
    assert.equal(buyMinimal.quantity, 18); // 30 target - 12 current = 18
    assert.equal(buyMinimal.reasoning_facts.current_stock, 12);
    assert.equal(buyMinimal.reasoning_facts.target_stock, 30);
    assert.equal(buyMinimal.reasoning_facts.minimal_quantity, 18);

    // Option B: buy_to_tier_20 (RazorPies flour tier 20 @ 27.5% off)
    const buyTier20 = options.find((o) => o.option_id === "buy_to_tier_20");
    assert.ok(buyTier20);
    assert.equal(buyTier20.quantity, 20);
    assert.equal(buyTier20.reasoning_facts.tier_threshold, 20);
    assert.ok(Number(buyTier20.reasoning_facts.tier_discount_pct) >= 20);

    // Option C: wait (projected 12 - 2*3 = 6 <= safety floor 8, so wait should be omitted for flour)
    const waitOption = options.find((o) => o.option_id === "wait");
    // With rate = 2 and safeWaitTicks = 3: projected = 12 - 6 = 6 <= floor 8 -> wait is omitted!
    assert.equal(waitOption, undefined, "Wait must be omitted when projected stock <= safetyFloor");
  });

  test("4. computeProcurementOptions includes wait when projected stock is above safety floor", () => {
    const live: LivePantryState = {
      currentTick: 5,
      stock: { cheese: 6 },
      target: { cheese: 10 },
      safetyFloor: { cheese: 3 },
      recentEvents: [
        { item: "cheese", tick: 4, quantityUsed: 0.5 }, // low consumption: 0.1/tick
      ],
    };

    const options = computeProcurementOptions("cheese", live);
    const waitOption = options.find((o) => o.option_id === "wait");
    assert.ok(waitOption, "Wait must be included when projected stock > safety floor");
    assert.equal(waitOption.action_type, "wait");
    assert.equal(waitOption.recheck_after_ticks, 3);
    assert.ok(Number(waitOption.reasoning_facts.projected_stock_in_n_ticks) > 3);
  });

  test("5. validateReasoningNumbers detects hallucinated and ungrounded numbers", () => {
    const facts = {
      current_stock: 12,
      target_stock: 30,
      minimal_quantity: 18,
      estimated_unit_price: 5.8,
      tier_discount_pct: 27.5,
    };

    // Valid reasoning citing exact facts
    const validText = "Current stock is 12 and target is 30, requiring 18 units with 27.5% discount at 5.8 per unit.";
    const validCheck = validateReasoningNumbers(validText, facts);
    assert.equal(validCheck.isValid, true);
    assert.equal(validCheck.unexplained.length, 0);

    // Hallucinated reasoning citing numbers not in facts (e.g. 42, 99.9)
    const invalidText = "I suggest ordering 42 units because market rate is 99.9 per kg.";
    const invalidCheck = validateReasoningNumbers(invalidText, facts);
    assert.equal(invalidCheck.isValid, false);
    assert.ok(invalidCheck.unexplained.includes(42));
    assert.ok(invalidCheck.unexplained.includes(99.9));
  });

  test("6. DeferredDecisionStore and checkDeferredDecisions enforce safety floor overrides", () => {
    // 1. Register a deferred decision at tick 1 to recheck at tick 4
    DeferredDecisionStore.setDeferred({
      item: "flour",
      chosen_at_tick: 1,
      recheck_after_tick: 4,
      facts_at_decision_time: { stock: 15, floor: 8 },
      reasoning: "Waiting for next batch to arrive",
    });

    const activeDecision = DeferredDecisionStore.getDeferred("flour");
    assert.ok(activeDecision);
    assert.equal(activeDecision.recheck_after_tick, 4);

    // 2. Check at tick 2 with stock 14 (safe, not due)
    const check1 = checkDeferredDecisions({
      currentTick: 2,
      stock: { flour: 14 },
      target: { flour: 30 },
      safetyFloor: { flour: 8 },
      recentEvents: [],
    });
    assert.equal(check1.forcedOverrides.length, 0);
    assert.equal(check1.dueRechecks.length, 0);
    assert.ok(DeferredDecisionStore.getDeferred("flour"), "Still deferred");

    // 3. Check at tick 3 with sudden stock drop to 7 (breaches floor 8) -> FORCES OVERRIDE
    let forcedTriggered = false;
    const check2 = checkDeferredDecisions(
      {
        currentTick: 3,
        stock: { flour: 7 },
        target: { flour: 30 },
        safetyFloor: { flour: 8 },
        recentEvents: [],
      },
      {
        onForceProcurement: (item) => {
          if (item === "flour") forcedTriggered = true;
        },
      }
    );
    assert.equal(check2.forcedOverrides.length, 1);
    assert.equal(check2.forcedOverrides[0].item, "flour");
    assert.equal(forcedTriggered, true);
    assert.equal(DeferredDecisionStore.getDeferred("flour"), null, "Deferred deleted after force");

    // 4. Register new deferred decision due at tick 6
    DeferredDecisionStore.setDeferred({
      item: "cheese",
      chosen_at_tick: 3,
      recheck_after_tick: 6,
      facts_at_decision_time: { stock: 5 },
      reasoning: "Waiting 3 ticks",
    });

    // Check at tick 6 -> triggers due recheck
    let recheckTriggered = false;
    const check3 = checkDeferredDecisions(
      {
        currentTick: 6,
        stock: { cheese: 5 },
        target: { cheese: 10 },
        safetyFloor: { cheese: 2 },
        recentEvents: [],
      },
      {
        onRecheckBuyerAgent: (item) => {
          if (item === "cheese") recheckTriggered = true;
        },
      }
    );
    assert.equal(check3.dueRechecks.length, 1);
    assert.equal(recheckTriggered, true);
    assert.equal(DeferredDecisionStore.getDeferred("cheese"), null);
  });

  test("7. chooseProcurementOptionDeterministically selects volume tier when discount is unlocked", () => {
    const live: LivePantryState = {
      currentTick: 5,
      stock: { flour: 20 },
      target: { flour: 30 },
      safetyFloor: { flour: 5 },
      recentEvents: [{ item: "flour", tick: 3, quantityUsed: 5 }],
    };

    const options = computeProcurementOptions("flour", live);
    const result = chooseProcurementOptionDeterministically(options);

    assert.ok(result.chosen_option);
    // Minimal is 10u (10% off), Tier 20 is 20u (27.5% off) -> chooses buy_to_tier_20
    assert.equal(result.chosen_option.option_id, "buy_to_tier_20");
    assert.equal(result.chosen_option.quantity, 20);
    assert.ok(result.reasoning.includes("buy_to_tier_20"));
  });
});
