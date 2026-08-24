import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { sellerRespondToRfq } from "./sellerAgent.js";
import { RfqPayload } from "../types/domain.js";
import { saveItem, defaultInventory } from "../inventory/inventoryStore.js";

describe("SellerAgent (Multi-Model & Fallback)", () => {
  beforeEach(() => {
    saveItem(defaultInventory);
  });

  test("1. Responds to 50kg tomato RFQ with volume discount", async () => {
    const rfq: RfqPayload = {
      item: "tomato",
      quantity_kg: 50,
      quality_min: "Grade A",
      needed_by: "2026-08-25T12:00:00Z",
      buyer_max_price_per_kg: 35,
    };

    const offer = await sellerRespondToRfq(rfq);

    assert.equal(offer.item, "tomato");
    assert.equal(offer.quantity_kg, 50);
    assert.equal(offer.base_price_per_kg, 32);
    assert.equal(offer.discount_pct, 10);
    assert.equal(offer.final_price_per_kg, 28.8);
    assert.equal(offer.total_price, 1440);
    assert.ok(offer.delivery_by);
    assert.ok(offer.offer_expires);
  });

  test("2. Responds to 75kg tomato RFQ with 18% bulk volume tier", async () => {
    const rfq: RfqPayload = {
      item: "tomato",
      quantity_kg: 75,
      quality_min: "Grade A",
      needed_by: "2026-08-25T12:00:00Z",
      buyer_max_price_per_kg: 35,
    };

    const offer = await sellerRespondToRfq(rfq);

    assert.equal(offer.item, "tomato");
    assert.equal(offer.quantity_kg, 75);
    assert.equal(offer.base_price_per_kg, 32);
    assert.equal(offer.discount_pct, 18);
    assert.equal(offer.final_price_per_kg, 26.24);
    assert.equal(offer.total_price, 1968);
  });

  test("3. Responds to small 10kg RFQ with standard pricing", async () => {
    const rfq: RfqPayload = {
      item: "tomato",
      quantity_kg: 10,
      quality_min: "Grade A",
      needed_by: "2026-08-25T12:00:00Z",
      buyer_max_price_per_kg: 35,
    };

    const offer = await sellerRespondToRfq(rfq);

    assert.equal(offer.quantity_kg, 10);
    assert.equal(offer.discount_pct, 0);
    assert.equal(offer.final_price_per_kg, 32);
    assert.equal(offer.total_price, 320);
  });
});
