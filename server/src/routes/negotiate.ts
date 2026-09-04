import { Router } from "express";
import { runNegotiation, confirmPendingTransaction } from "../orchestrator/orchestrator.js";

const router = Router();

// POST /api/negotiate - Trigger multi-agent procurement cycle
router.post("/", async (req, res) => {
  try {
    const {
      scenario = "custom",
      customRfq,
      allowRenegotiation = true,
      buyerStockKg,
      sellerStockKg,
      buyerTargetStockKg,
      delegationMode,
      simulatePaymentFail = false,
      itemToProcure,
      quantityNeeded,
      itemsToProcure,
      sellerInventories,
    } = req.body;

    const threadId = `thread_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const result = await runNegotiation({
      threadId,
      scenario,
      customRfq,
      allowRenegotiation: Boolean(allowRenegotiation),
      buyerStockKg: buyerStockKg !== undefined ? Number(buyerStockKg) : undefined,
      sellerStockKg: sellerStockKg !== undefined ? Number(sellerStockKg) : undefined,
      buyerTargetStockKg: buyerTargetStockKg !== undefined ? Number(buyerTargetStockKg) : undefined,
      delegationMode,
      simulatePaymentFail: Boolean(simulatePaymentFail),
      itemToProcure,
      quantityNeeded: quantityNeeded ? Number(quantityNeeded) : undefined,
      itemsToProcure: Array.isArray(itemsToProcure) ? itemsToProcure : undefined,
      sellerInventories: sellerInventories && typeof sellerInventories === "object" ? sellerInventories : undefined,
    });

    res.status(200).json({
      success: true,
      thread_id: result.thread_id,
      scenario: result.scenario,
      status: result.status,
      final_message_type: result.final_message_type,
      order_id: result.order_id,
      payment_id: result.payment_id,
      signature: result.signature,
      signature_verified: result.signature_verified,
      total_amount: result.total_amount,
      pending_offer: result.pending_offer,
      policy_checks: result.policy_checks,
      message: result.message,
      buyer_stock: result.buyer_stock,
      seller_stock: result.seller_stock,
      purchased_items: result.purchased_items,
    });
  } catch (error: any) {
    console.error("Negotiation run failed:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Negotiation execution failed",
    });
  }
});

// POST /api/negotiate/confirm - Human confirmation in Partial Mode
router.post("/confirm", async (req, res) => {
  try {
    const { threadId, offer, action = "approve", simulatePaymentFail = false } = req.body;
    if (!threadId || !offer) {
      return res.status(400).json({ success: false, error: "Missing threadId or offer in request body" });
    }

    const result = await confirmPendingTransaction({
      threadId,
      offer,
      action,
      simulatePaymentFail: Boolean(simulatePaymentFail),
    });

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error("Transaction confirmation failed:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Transaction confirmation failed",
    });
  }
});

export default router;
