import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  razorpayClient,
  createOrder,
  settlePayment,
  generatePaymentSignature,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from "./razorpayClient.js";

describe("razorpayClient (Payment Settlement & Cryptographic Verification)", () => {
  test("1. creates an order in paise and returns order id and status 'created'", async () => {
    // 1440 INR = 144000 paise
    const order = await razorpayClient.createOrder(144000, "INR", "test_rcpt_1");
    assert.ok(order.id);
    assert.equal(typeof order.id, "string");
    assert.equal(order.amount, 144000);
    assert.equal(order.currency, "INR");
    assert.equal(order.status, "created");
    assert.ok(order.created_at > 0);
  });

  test("2. settlePayment captures payment, issues payment_id (pay_...) and verifies HMAC signature", async () => {
    const order = await createOrder(144000, "INR", "test_rcpt_settle_1");
    assert.equal(order.status, "created");

    const settlement = await settlePayment({
      order,
      buyerVpa: "razorslice@upi",
      method: "upi_circle",
    });

    assert.equal(settlement.success, true);
    assert.equal(settlement.status, "captured");
    assert.ok(settlement.paymentId.startsWith("pay_"));
    assert.equal(settlement.orderId, order.id);
    assert.equal(settlement.amount, 144000);
    assert.equal(settlement.signatureVerified, true);
    assert.ok(settlement.signature.length > 20);
    assert.equal(order.status, "paid");
  });

  test("3. verifyPaymentSignature validates authentic HMAC-SHA256 signature and rejects forged signature", () => {
    const orderId = "order_test_12345";
    const paymentId = "pay_test_67890";
    const secret = "test_webhook_secret_key";

    const genuineSig = generatePaymentSignature(orderId, paymentId, secret);
    const isValid = verifyPaymentSignature(
      { orderId, paymentId, signature: genuineSig },
      secret
    );
    assert.equal(isValid, true);

    // Tampered payment ID
    const isForgedValid = verifyPaymentSignature(
      { orderId, paymentId: "pay_tampered_00000", signature: genuineSig },
      secret
    );
    assert.equal(isForgedValid, false);

    // Tampered signature
    const isTamperedSigValid = verifyPaymentSignature(
      { orderId, paymentId, signature: genuineSig + "corrupt" },
      secret
    );
    assert.equal(isTamperedSigValid, false);
  });

  test("4. verifyWebhookSignature validates authentic webhook body and rejects invalid secret", () => {
    const rawBody = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_999", amount: 50000 } } },
    });
    const webhookSecret = "whsec_live_test_secret_key_123";

    const signature = razorpayClient.generatePaymentSignature("hook", "sig", webhookSecret);
    const validHmac = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    const isValid = verifyWebhookSignature(rawBody, validHmac, webhookSecret);
    assert.equal(isValid, true);

    const isWrongSecretValid = verifyWebhookSignature(rawBody, validHmac, "wrong_secret");
    assert.equal(isWrongSecretValid, false);
  });

  test("5. settlePayment with simulatePaymentFail rejects transaction with PAYMENT_GATEWAY_DECLINED", async () => {
    const order = await createOrder(50000, "INR", "test_rcpt_fail_1");
    const settlement = await settlePayment({
      order,
      simulatePaymentFail: true,
      method: "upi_circle",
    });

    assert.equal(settlement.success, false);
    assert.equal(settlement.status, "failed");
    assert.equal(settlement.error, "PAYMENT_GATEWAY_DECLINED");
    assert.equal(settlement.signatureVerified, false);
    assert.notEqual(order.status, "paid");
  });
});
