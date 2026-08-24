import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getItem, saveItem, computeDiscount, defaultInventory } from "./inventoryStore.js";
import { InventoryItem } from "../types/domain.js";

describe("InventoryStore (Dynamic Pricing)", () => {
  beforeEach(() => {
    saveItem(defaultInventory);
  });

  test("1. Retrieves default inventory item from database", () => {
    const item = getItem("tomato");
    assert.ok(item);
    assert.equal(item.item, "tomato");
    assert.equal(item.stock_kg, 500);
    assert.equal(item.base_price_per_kg, 32);
    assert.equal(item.discount_tiers.length, 2);
  });

  test("2. Computes 10% volume discount for 50kg tomatoes (Happy Path)", () => {
    // 50kg qualifies for the >=30kg tier (10%)
    // Base: 32 -> Final: 28.8/kg -> Total: 50 * 28.8 = 1440
    const result = computeDiscount("tomato", 50);

    assert.equal(result.discountPct, 10);
    assert.equal(result.reason, "volume_tier");
    assert.equal(result.basePricePerKg, 32);
    assert.equal(result.finalPricePerKg, 28.8);
    assert.equal(result.totalPrice, 1440);
  });

  test("3. Computes 18% bulk volume discount for 75kg tomatoes (Failure/Overcap Path)", () => {
    // 75kg qualifies for the >=75kg tier (18%)
    // Base: 32 -> Final: 26.24/kg -> Total: 75 * 26.24 = 1968
    const result = computeDiscount("tomato", 75);

    assert.equal(result.discountPct, 18);
    assert.equal(result.reason, "bulk_volume_tier");
    assert.equal(result.basePricePerKg, 32);
    assert.equal(result.finalPricePerKg, 26.24);
    assert.equal(result.totalPrice, 1968);
  });

  test("4. Computes standard pricing for small quantities (<30kg and <15% of stock)", () => {
    // 10kg does not qualify for volume tier and is only 2% of 500kg stock
    // Base: 32 -> Final: 32/kg -> Total: 10 * 32 = 320
    const result = computeDiscount("tomato", 10);

    assert.equal(result.discountPct, 0);
    assert.equal(result.reason, "standard_pricing");
    assert.equal(result.finalPricePerKg, 32);
    assert.equal(result.totalPrice, 320);
  });

  test("5. Dynamically calculates excess stock clearance for a small vendor with lower stock", () => {
    // Custom vendor with small stock of 100kg and no volume tiers configured
    const smallVendorItem: InventoryItem = {
      item: "organic_spinach",
      stock_kg: 100,
      base_price_per_kg: 50,
      discount_tiers: [],
    };
    saveItem(smallVendorItem);

    // Order of 20kg clears 20% of the 100kg stock (>= 15% relative threshold)
    // Applies 5% excess_stock_clearance
    const result = computeDiscount("organic_spinach", 20);

    assert.equal(result.discountPct, 5);
    assert.equal(result.reason, "excess_stock_clearance");
    assert.equal(result.basePricePerKg, 50);
    assert.equal(result.finalPricePerKg, 47.5);
    assert.equal(result.totalPrice, 950);
  });
});
