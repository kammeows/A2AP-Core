import { Router } from "express";
import { razorpayClient } from "../payments/razorpayClient.js";
import { WebhookStore } from "../payments/webhookStore.js";
import { IdempotencyManager } from "../payments/idempotencyManager.js";
import { Orchestrator } from "../orchestrator/orchestrator.js";
import { extractCredentials } from "../payments/credentials.js";

const router = Router();

// GET /api/payments/config - Returns key configuration status (sanitized, zero secrets exposed)
router.get("/config", (_req, res) => {
  const { hasValidKeys, keyId } = razorpayClient.getRazorpayInstance();
  res.status(200).json({
    success: true,
    hasServerKeys: hasValidKeys,
    serverKeyPrefix: keyId ? `${keyId.substring(0, 8)}...` : null,
    sandboxMode: !hasValidKeys,
  });
});

// POST /api/payments/verify-keys - Authenticates BYOK keys against live Razorpay Orders API
router.post("/verify-keys", async (req, res) => {
  try {
    const creds = extractCredentials(req);
    const clientContext = razorpayClient.getRazorpayInstance(creds);

    if (!clientContext.hasValidKeys || !clientContext.instance) {
      return res.status(400).json({
        success: false,
        valid: false,
        error: "Both Razorpay Key ID (rzp_...) and Secret must be provided (length > 5 characters, not placeholder)",
      });
    }

    // Ping Razorpay Orders API with count: 1 to verify credentials
    await clientContext.instance.orders.all({ count: 1 });

    const isLive = clientContext.keyId?.startsWith("rzp_live");
    res.status(200).json({
      success: true,
      valid: true,
      isCustom: clientContext.isCustom,
      mode: isLive ? "live" : "test",
      keyIdPrefix: clientContext.keyId ? `${clientContext.keyId.substring(0, 8)}...` : "",
      message: `Authentication successful with Razorpay ${isLive ? "LIVE" : "TEST"} API!`,
    });
  } catch (err: any) {
    console.warn("BYOK Key verification failed:", err?.error?.description || err.message);
    const errorDescription =
      err?.error?.description ||
      err.message ||
      "Authentication failed. Please verify your Razorpay Key ID and Key Secret.";
    res.status(401).json({
      success: false,
      valid: false,
      error: errorDescription,
    });
  }
});

// POST /api/payments/verify - Verify Razorpay payment signature
router.post("/verify", (req, res) => {
  try {
    const { orderId, paymentId, signature } = req.body;
    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: orderId, paymentId, signature",
      });
    }

    const creds = extractCredentials(req);
    const clientContext = razorpayClient.getRazorpayInstance(creds);

    const isValid = razorpayClient.verifyPaymentSignature(
      {
        orderId,
        paymentId,
        signature,
      },
      clientContext.keySecret
    );

    res.status(200).json({
      success: true,
      signature_valid: isValid,
      order_id: orderId,
      payment_id: paymentId,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || "Signature verification failed",
    });
  }
});

// POST /api/payments/webhook - Razorpay Webhook Handler with HMAC signature verification & ingestion
router.post("/webhook", (req, res) => {
  try {
    const signature = (req.headers["x-razorpay-signature"] as string) || "";
    const creds = extractCredentials(req);
    const clientContext = razorpayClient.getRazorpayInstance(creds);
    const webhookSecret =
      creds.webhookSecret ||
      process.env.RAZORPAY_WEBHOOK_SECRET ||
      clientContext.keySecret ||
      "test_secret_razorpay_a2a_salt";

    const { record, verified } = WebhookStore.ingestWebhook(
      req.body,
      signature,
      webhookSecret
    );

    res.status(200).json({
      received: true,
      verified,
      event: record.event,
      order_id: record.orderId,
      payment_id: record.paymentId,
      webhook_id: record.id,
      error_code: record.errorCode,
      error_step: record.errorStep,
    });
  } catch (err: any) {
    console.error("Webhook processing error:", err);
    res.status(500).json({
      received: false,
      error: err.message || "Webhook processing failed",
    });
  }
});

// GET /api/payments/webhook/events - Get live stream/audit of incoming verified webhooks
router.get("/webhook/events", (_req, res) => {
  try {
    const events = WebhookStore.getRecentEvents(30);
    res.status(200).json({
      success: true,
      count: events.length,
      events,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || "Failed to fetch webhook events",
    });
  }
});

// GET /api/payments/idempotency - Get idempotency keys and state machine history
router.get("/idempotency", (_req, res) => {
  try {
    const records = IdempotencyManager.getAllRecords();
    res.status(200).json({
      success: true,
      count: records.length,
      records,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || "Failed to fetch idempotency records",
    });
  }
});

// POST /api/payments/retry - One-tap retry with fresh idempotency key & backup VPA
router.post("/retry", async (req, res) => {
  try {
    const { orderId, threadId, buyerVpa = "success@razorpay" } = req.body;
    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: "orderId is required for payment retry",
      });
    }

    const creds = extractCredentials(req);
    const result = await Orchestrator.retryFailedProcurement({
      orderId,
      threadId,
      buyerVpa,
      credentials: creds,
    });

    res.status(200).json({
      success: result.status === "CONFIRMED",
      ...result,
    });
  } catch (err: any) {
    console.error("Payment retry failed:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Payment retry failed",
    });
  }
});

// POST /api/payments/cancel - Safely cancel failed procurement and release inventory hold
router.post("/cancel", async (req, res) => {
  try {
    const { orderId, threadId, reason } = req.body;
    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: "orderId is required to cancel procurement",
      });
    }

    const result = await Orchestrator.cancelFailedProcurement({
      orderId,
      threadId,
      reason,
    });

    res.status(200).json(result);
  } catch (err: any) {
    console.error("Payment cancel failed:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Payment cancel failed",
    });
  }
});

export default router;
