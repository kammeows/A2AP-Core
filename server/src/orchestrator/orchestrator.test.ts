import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { runNegotiation } from "./orchestrator.js";
import { getThread, clearAll } from "../thread/threadStore.js";
import { saveItem, defaultInventory } from "../inventory/inventoryStore.js";

describe("Orchestrator End-to-End A2A Flow", () => {
  beforeEach(() => {
    clearAll();
    saveItem(defaultInventory);
  });

  test("1. Happy path: 50kg RFQ -> 10% discount -> Policy Engine Approval -> Razorpay Order Confirmed", async () => {
    const threadId = "test_happy_" + Date.now();
    const result = await runNegotiation(threadId, "happy");

    assert.equal(result.scenario, "happy");
    assert.equal(result.status, "CONFIRMED");
    assert.equal(result.final_message_type, "ORDER_CONFIRM");
    assert.equal(result.total_amount, 1440);
    assert.ok(result.order_id);

    const thread = getThread(threadId);
    assert.ok(thread.length >= 5);

    // Sequence check: RFQ -> OFFER -> ACCEPT (proposal) -> POLICY_CHECK -> ORDER_CREATE -> ORDER_CONFIRM
    assert.equal(thread[0].type, "RFQ");
    assert.equal(thread[1].type, "OFFER");
    assert.equal(thread[2].type, "ACCEPT");
    assert.equal(thread[3].type, "POLICY_CHECK");
    assert.equal(thread[3].payload.approved, true);
    assert.equal(thread[4].type, "ORDER_CREATE");
    assert.equal(thread[5].type, "ORDER_CONFIRM");
  });

  test("2. Failure path with renegotiation: 75kg RFQ -> ₹1,968 (breaches cap) -> Policy Reject -> Counter 50kg -> Approved", async () => {
    const threadId = "test_failure_reneg_" + Date.now();
    const result = await runNegotiation(threadId, "failure", undefined, true);

    assert.equal(result.scenario, "failure");
    assert.equal(result.status, "RENEGOTIATED_AND_CONFIRMED");
    assert.equal(result.final_message_type, "ORDER_CONFIRM");
    assert.equal(result.total_amount, 1440);

    const thread = getThread(threadId);
    assert.ok(thread.length >= 8);

    // Sequence check:
    // RFQ (75kg) -> OFFER (1968) -> ACCEPT -> POLICY_CHECK (Fail) -> COUNTER_OFFER (50kg) -> OFFER (1440) -> ACCEPT -> POLICY_CHECK (Pass) -> ORDER_CREATE -> ORDER_CONFIRM
    assert.equal(thread[0].type, "RFQ");
    assert.equal(thread[1].type, "OFFER");
    assert.equal(thread[2].type, "ACCEPT");
    assert.equal(thread[3].type, "POLICY_CHECK");
    assert.equal(thread[3].payload.approved, false);
    assert.equal(thread[4].type, "COUNTER_OFFER");
    assert.equal(thread[5].type, "OFFER");
    assert.equal(thread[6].type, "ACCEPT");
    assert.equal(thread[7].type, "POLICY_CHECK");
    assert.equal(thread[7].payload.approved, true);
  });

  test("3. Failure path with escalation: When renegotiation is disabled, results in ORDER_FAIL without Razorpay order", async () => {
    const threadId = "test_failure_escalate_" + Date.now();
    const result = await runNegotiation(threadId, "failure", undefined, false);

    assert.equal(result.scenario, "failure");
    assert.equal(result.status, "ESCALATED_POLICY_VIOLATION");
    assert.equal(result.final_message_type, "ORDER_FAIL");

    const thread = getThread(threadId);
    assert.equal(thread[thread.length - 1].type, "ORDER_FAIL");
    assert.equal(thread[thread.length - 1].payload.requires_human_approval, true);

    // Confirm no ORDER_CREATE or ORDER_CONFIRM exists
    const orderMsgs = thread.filter((m) => m.type === "ORDER_CREATE" || m.type === "ORDER_CONFIRM");
    assert.equal(orderMsgs.length, 0);
  });
});
