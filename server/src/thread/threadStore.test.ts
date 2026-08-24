import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { appendMessage, getThread, clearThread } from "./threadStore.js";
import { Envelope } from "../types/messages.js";

describe("ThreadStore (Audit Trail)", () => {
  const testThreadId = "test_thread_" + Math.random().toString(36).substring(2);

  beforeEach(() => {
    clearThread(testThreadId);
  });

  test("1. Appends and retrieves messages in chronological order", () => {
    const msg1: Envelope = {
      message_id: `msg_1_${testThreadId}`,
      thread_id: testThreadId,
      timestamp: "2026-08-24T10:00:00.000Z",
      from: "agent:buyer:restaurant_42",
      to: "agent:seller:veggie_vendor_09",
      type: "RFQ",
      payload: { item: "tomato", quantity_kg: 50 },
    };

    const msg2: Envelope = {
      message_id: `msg_2_${testThreadId}`,
      thread_id: testThreadId,
      timestamp: "2026-08-24T10:00:01.000Z",
      from: "agent:seller:veggie_vendor_09",
      to: "agent:buyer:restaurant_42",
      type: "OFFER",
      payload: {
        item: "tomato",
        quantity_kg: 50,
        final_price_per_kg: 28.8,
        total_price: 1440,
        discount_pct: 10,
        discount_reason: "volume_tier",
      },
    };

    appendMessage(msg1);
    appendMessage(msg2);

    const thread = getThread(testThreadId);

    assert.equal(thread.length, 2);
    assert.equal(thread[0].message_id, `msg_1_${testThreadId}`);
    assert.equal(thread[0].type, "RFQ");
    assert.deepEqual(thread[0].payload, { item: "tomato", quantity_kg: 50 });

    assert.equal(thread[1].message_id, `msg_2_${testThreadId}`);
    assert.equal(thread[1].type, "OFFER");
    assert.equal((thread[1].payload as any).total_price, 1440);
  });

  test("2. Returns empty array for a non-existent thread", () => {
    const thread = getThread("non_existent_thread_xyz");
    assert.deepEqual(thread, []);
  });

  test("3. Isolates messages between different threads", () => {
    const otherThreadId = "other_thread_" + Math.random().toString(36).substring(2);

    const msgA: Envelope = {
      message_id: `msg_a_${testThreadId}`,
      thread_id: testThreadId,
      timestamp: "2026-08-24T10:00:00.000Z",
      from: "agent:buyer:restaurant_42",
      to: "agent:seller:veggie_vendor_09",
      type: "RFQ",
      payload: { item: "tomato" },
    };

    const msgB: Envelope = {
      message_id: `msg_b_${otherThreadId}`,
      thread_id: otherThreadId,
      timestamp: "2026-08-24T10:00:05.000Z",
      from: "agent:buyer:restaurant_42",
      to: "agent:seller:veggie_vendor_09",
      type: "RFQ",
      payload: { item: "potato" },
    };

    appendMessage(msgA);
    appendMessage(msgB);

    const threadA = getThread(testThreadId);
    const threadB = getThread(otherThreadId);

    assert.equal(threadA.length, 1);
    assert.equal((threadA[0].payload as any).item, "tomato");

    assert.equal(threadB.length, 1);
    assert.equal((threadB[0].payload as any).item, "potato");

    clearThread(otherThreadId);
  });
});
