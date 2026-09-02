import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { razorpayClient } from "./razorpayClient.js";

describe("razorpayClient", () => {
  test("creates an order in paise and returns order id and status", async () => {
    // 1440 INR = 144000 paise
    const order = await razorpayClient.createOrder(144000, "INR", "test_rcpt_1");
    assert.ok(order.id);
    assert.equal(typeof order.id, "string");
    assert.equal(order.amount, 144000);
    assert.equal(order.currency, "INR");
    assert.equal(order.status, "created");
    assert.ok(order.created_at > 0);
  });
});
