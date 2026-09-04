import { Router } from "express";
import { razorpayClient } from "../payments/razorpayClient.js";

const router = Router();

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

    const isValid = razorpayClient.verifyPaymentSignature({
      orderId,
      paymentId,
      signature,
    });

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

// POST /api/payments/webhook - Razorpay Webhook Handler with HMAC signature check
router.post("/webhook", (req, res) => {
  try {
    const signature = (req.headers["x-razorpay-signature"] as string) || "";
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET || "test_secret_razorpay_a2a_salt";

    const isValid = razorpayClient.verifyWebhookSignature(
      JSON.stringify(req.body),
      signature,
      webhookSecret
    );

    const event = req.body?.event || "unknown";
    const paymentId = req.body?.payload?.payment?.entity?.id;
    const orderId = req.body?.payload?.payment?.entity?.order_id;

    res.status(200).json({
      received: true,
      verified: isValid,
      event,
      order_id: orderId,
      payment_id: paymentId,
    });
  } catch (err: any) {
    res.status(500).json({
      received: false,
      error: err.message || "Webhook processing failed",
    });
  }
});

export default router;
