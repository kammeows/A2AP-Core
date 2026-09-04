import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { IdempotencyManager } from "./idempotencyManager.js";
import { WebhookStore } from "./webhookStore.js";
import { createOrder, settlePayment, verifyWebhookSignature } from "./razorpayClient.js";
import { runNegotiation, retryFailedProcurement, cancelFailedProcurement, getPendingProcurement } from "../orchestrator/orchestrator.js";
import { clearAll, getThread } from "../thread/threadStore.js";
import { saveItem, getBuyerInventory, saveBuyerInventory, defaultInventory, defaultBuyerInventory } from "../inventory/inventoryStore.js";

describe("Production Failure Handling, Idempotency & Webhooks", () => {
  beforeEach(() => {
    clearAll();
    IdempotencyManager.clear();
    WebhookStore.clear();
    saveItem(defaultInventory);
    saveBuyerInventory(JSON.parse(JSON.stringify(defaultBuyerInventory)));
  });

  describe("Pillar A: Idempotency State Machine", () => {
    test("1. IdempotencyManager enforces key formatting convention", () => {
      const key = IdempotencyManager.generateKey("order_ABC123", 1);
      assert.equal(key, "idemp_ABC123_attempt_1");

      const key2 = IdempotencyManager.generateKey("order_ABC123", 2);
      assert.equal(key2, "idemp_ABC123_attempt_2");
    });

    test("2. IdempotencyManager records and resolves attempts through states", () => {
      const key = "idemp_test_ord_1";
      IdempotencyManager.recordAttempt(key, "ord_1", 10000, 1, "test@razorpay");

      const initial = IdempotencyManager.getRecord(key);
      assert.ok(initial);
      assert.equal(initial.status, "INITIATED");
      assert.equal(initial.amount_paise, 10000);
      assert.equal(initial.attempt_number, 1);

      IdempotencyManager.resolveAttempt(key, "SETTLED", { paymentId: "pay_test_123" });
      const settled = IdempotencyManager.getRecord(key);
      assert.equal(settled?.status, "SETTLED");
      assert.equal(settled?.response_payload?.paymentId, "pay_test_123");
    });

    test("3. Rule 1: settlePayment replaying SAME idempotency key returns cached receipt without double charge", async () => {
      const order = await createOrder(144000, "INR", "rcpt_idemp_replay");
      const idempKey = IdempotencyManager.generateKey(order.id, 1);

      // Attempt 1: First settlement
      const firstRun = await settlePayment({
        order,
        buyerVpa: "success@razorpay",
        simulationMode: "happy",
        idempotencyKey: idempKey,
        attemptNumber: 1,
      });

      assert.equal(firstRun.success, true);
      assert.equal(firstRun.status, "captured");
      const firstPaymentId = firstRun.paymentId;

      // Attempt 1 Retry: Same Idempotency Key (e.g. after network glitch)
      const secondRun = await settlePayment({
        order,
        buyerVpa: "success@razorpay",
        simulationMode: "happy",
        idempotencyKey: idempKey,
        attemptNumber: 1,
      });

      // Must return identical cached settlement
      assert.equal(secondRun.success, true);
      assert.equal(secondRun.cached, true);
      assert.equal(secondRun.paymentId, firstPaymentId);
      assert.ok(secondRun.message?.includes("zero duplicate charges"));
    });
  });

  describe("Pillar B: Webhook Ingestion & Cryptographic Verification", () => {
    test("1. WebhookStore creates, signs with HMAC-SHA256, and verifies authentic webhook payloads", () => {
      const secret = "whsec_test_secret_key_abc";
      const built = WebhookStore.buildRazorpayWebhookPayload(
        {
          event: "payment.captured",
          orderId: "order_hook_1",
          paymentId: "pay_hook_1",
          amount: 50000,
          currency: "INR",
          vpa: "buyer@razorpay",
          method: "upi_circle",
        },
        secret
      );

      const isValid = verifyWebhookSignature(built.rawBody, built.signature, secret);
      assert.equal(isValid, true);

      const record = WebhookStore.dispatchAndRecord(
        {
          event: "payment.captured",
          orderId: "order_hook_1",
          paymentId: "pay_hook_1",
          amount: 50000,
          currency: "INR",
          vpa: "buyer@razorpay",
          method: "upi_circle",
        },
        secret
      );

      assert.ok(record.id.startsWith("wh_"));
      assert.equal(record.event, "payment.captured");
      assert.equal(record.signatureVerified, true);
      assert.ok(record.signature.length > 20);
    });

    test("2. WebhookStore stores and filters incoming webhook events", () => {
      WebhookStore.dispatchAndRecord({
        event: "payment.captured",
        orderId: "order_alpha",
        paymentId: "pay_alpha",
        amount: 25000,
      });

      WebhookStore.dispatchAndRecord({
        event: "payment.failed",
        orderId: "order_beta",
        paymentId: "pay_beta",
        amount: 30000,
      });

      const allEvents = WebhookStore.getEvents();
      assert.equal(allEvents.length, 2);

      const failedEvents = WebhookStore.getEvents({ event: "payment.failed" });
      assert.equal(failedEvents.length, 1);
      assert.equal(failedEvents[0].orderId, "order_beta");
    });
  });

  describe("Pillar C: Resilience Scenarios & Human-in-the-Loop Recovery", () => {
    test("1. Scenario 1 (Bank Decline): Captures failure@razorpay, emits verified payment.failed webhook & diagnostics", async () => {
      const threadId = "test_decline_" + Date.now();
      const result = await runNegotiation({
        threadId,
        scenario: "happy",
        simulationMode: "bank_decline",
      });

      assert.equal(result.status, "PAYMENT_FAILED");
      assert.equal(result.final_message_type, "ORDER_FAIL");
      assert.equal(result.error_code, "BAD_REQUEST_ERROR");
      assert.equal(result.error_step, "payment_authorization");
      assert.equal(result.error_source, "gateway");
      assert.ok(result.order_id);

      const thread = getThread(threadId);
      const hookMsg = thread.find((m) => m.type === "WEBHOOK_RECEIVED");
      assert.ok(hookMsg, "Webhook envelope must be recorded");
      assert.equal(hookMsg.payload.event, "payment.failed");

      const failMsg = thread.find((m) => m.type === "ORDER_FAIL");
      assert.ok(failMsg, "ORDER_FAIL envelope must be recorded");
      assert.equal(failMsg.payload.requires_human_approval, true);
      assert.equal(failMsg.payload.can_retry, true);
    });

    test("2. Scenario 2 (Network Drop): Recovers automatically via same-key idempotent retry", async () => {
      const threadId = "test_net_drop_" + Date.now();
      const result = await runNegotiation({
        threadId,
        scenario: "happy",
        simulationMode: "network_drop",
      });

      assert.equal(result.status, "CONFIRMED");
      assert.equal(result.final_message_type, "ORDER_CONFIRM");
      assert.ok(result.payment_id);

      const thread = getThread(threadId);
      const timeoutMsg = thread.find((m) => m.type === "NETWORK_TIMEOUT");
      assert.ok(timeoutMsg, "NETWORK_TIMEOUT envelope must be recorded for ECONNRESET");
      assert.equal(timeoutMsg.payload.event, "ECONNRESET");

      const retryMsg = thread.find((m) => m.type === "IDEMPOTENT_RETRY");
      assert.ok(retryMsg, "IDEMPOTENT_RETRY envelope must be logged");
      assert.equal(retryMsg.payload.reuse_key, true, "Network drop must reuse same idempotency key");
    });

    test("3. Scenario 3 (Gateway 502 Downtime): Escalates after bounded backoff", async () => {
      const threadId = "test_downtime_" + Date.now();
      const result = await runNegotiation({
        threadId,
        scenario: "happy",
        simulationMode: "gateway_downtime",
      });

      assert.equal(result.status, "PAYMENT_FAILED");
      assert.equal(result.error_code, "GATEWAY_ERROR");

      const thread = getThread(threadId);
      const retries = thread.filter((m) => m.type === "IDEMPOTENT_RETRY");
      assert.ok(retries.length >= 2, "Must log initial attempt and bounded backoff attempt");

      const failMsg = thread.find((m) => m.type === "ORDER_FAIL");
      assert.ok(failMsg);
      assert.equal(failMsg.payload.error_code, "GATEWAY_ERROR");
    });

    test("4. Rule 2 Recovery: retryFailedProcurement settles with fresh key attempt_2 and restocks kitchen", async () => {
      const threadId = "test_retry_flow_" + Date.now();
      // Step 1: Initial failure via bank_decline
      const failResult = await runNegotiation({
        threadId,
        scenario: "happy",
        simulationMode: "bank_decline",
      });

      assert.equal(failResult.status, "PAYMENT_FAILED");
      const orderId = failResult.order_id!;
      const initialStock = getBuyerInventory().inventory.tomatoes || 6;

      // Verify pending procurement is registered
      const pending = getPendingProcurement(orderId);
      assert.ok(pending, "Order must be tracked in pending procurements");

      // Step 2: One-tap recovery with backup UPI and fresh idempotency key
      const recovery = await retryFailedProcurement({
        orderId,
        threadId,
        buyerVpa: "success@razorpay",
      });

      assert.equal(recovery.status, "CONFIRMED");
      assert.equal(recovery.attempt_number, 2);
      assert.equal(recovery.idempotency_key, IdempotencyManager.generateKey(orderId, 2));
      assert.ok(recovery.payment_id);
      assert.equal(recovery.signature_verified, true);

      // Verify kitchen pantry stock was restocked upon recovery
      const updatedStock = getBuyerInventory().inventory.tomatoes;
      assert.ok((updatedStock || 0) > initialStock, "Inventory must increase after successful recovery");

      // Verify thread contains IDEMPOTENT_RETRY with reuse_key: false
      const thread = getThread(threadId);
      const recoveryRetryMsg = thread.find(
        (m) => m.type === "IDEMPOTENT_RETRY" && m.payload.attempt_number === 2
      );
      assert.ok(recoveryRetryMsg);
      assert.equal(recoveryRetryMsg.payload.reuse_key, false);
    });

    test("5. Order Cancellation: cancelFailedProcurement releases pantry holds and records audit event", async () => {
      const threadId = "test_cancel_flow_" + Date.now();
      const failResult = await runNegotiation({
        threadId,
        scenario: "happy",
        simulationMode: "bank_decline",
      });

      const orderId = failResult.order_id!;
      const cancelResult = await cancelFailedProcurement({
        orderId,
        threadId,
        reason: "USER_DECLINED_RETRY",
      });

      assert.equal(cancelResult.success, true);
      assert.equal(cancelResult.status, "CANCELLED");

      // Pending procurement should be cleaned up
      const pending = getPendingProcurement(orderId);
      assert.equal(pending, undefined);

      const thread = getThread(threadId);
      const cancelMsg = thread[thread.length - 1];
      assert.equal(cancelMsg.type, "ORDER_FAIL");
      assert.equal(cancelMsg.payload.reason, "USER_DECLINED_RETRY");
    });
  });
});
