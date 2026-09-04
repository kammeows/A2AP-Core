import crypto from "node:crypto";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
} catch {
  dotenv.config();
}
dotenv.config();

export const DEFAULT_WEBHOOK_SECRET =
  process.env.RAZORPAY_WEBHOOK_SECRET?.trim() ||
  process.env.RAZORPAY_KEY_SECRET?.trim() ||
  "test_secret_razorpay_a2a_salt";

export interface WebhookEventRecord {
  id: string;
  event: "payment.captured" | "payment.failed" | "order.paid" | string;
  orderId: string;
  paymentId: string;
  vpa?: string;
  amount: number;
  currency: string;
  status: string;
  method?: string;
  errorCode?: string;
  errorDescription?: string;
  errorSource?: string;
  errorStep?: string;
  errorReason?: string;
  signature: string;
  signatureVerified: boolean;
  receivedAt: string;
  rawPayload: any;
}

export class WebhookStore {
  private static events: WebhookEventRecord[] = [];

  /**
   * Generates a valid HMAC-SHA256 signature for a webhook payload string using the configured secret.
   */
  public static signPayload(payloadString: string, secret?: string): string {
    const effectiveSecret = secret || DEFAULT_WEBHOOK_SECRET;
    return crypto
      .createHmac("sha256", effectiveSecret)
      .update(payloadString)
      .digest("hex");
  }

  /**
   * Constructs an authentic Razorpay Webhook JSON payload for test simulation & webhook firing.
   */
  public static buildRazorpayWebhookPayload(params: {
    event: "payment.captured" | "payment.failed" | "order.paid";
    orderId: string;
    paymentId: string;
    amount: number; // in paise
    currency?: string;
    vpa?: string;
    method?: string;
    error?: {
      code?: string;
      description?: string;
      source?: string;
      step?: string;
      reason?: string;
    };
  }, secret?: string): { payload: any; rawBody: string; signature: string } {
    const {
      event,
      orderId,
      paymentId,
      amount,
      currency = "INR",
      vpa = "razorslice.buyer@razorpay",
      method = "upi",
      error,
    } = params;

    const timestamp = Math.floor(Date.now() / 1000);
    const webhookId = `wh_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    const paymentEntity: Record<string, any> = {
      id: paymentId,
      entity: "payment",
      amount,
      currency,
      status: event === "payment.captured" ? "captured" : "failed",
      order_id: orderId,
      invoice_id: null,
      international: false,
      method,
      amount_refunded: 0,
      refund_status: null,
      captured: event === "payment.captured",
      description: "A2A Automated Procurement UPI Settlement",
      card_id: null,
      bank: null,
      wallet: null,
      vpa,
      email: "procurement@razorslice.internal",
      contact: "+919876543210",
      notes: {
        agent: "agent:buyer:razorslice",
        protocol: "UPI_Circle_Delegated_Mandate",
        system: "A2A_Bounded_Procurement_Agent",
      },
      fee: Math.round(amount * 0.02),
      tax: Math.round(amount * 0.0036),
      error_code: error?.code || null,
      error_description: error?.description || null,
      error_source: error?.source || null,
      error_step: error?.step || null,
      error_reason: error?.reason || null,
      created_at: timestamp,
    };

    const webhookBody = {
      entity: "event",
      account_id: "acc_RazorSliceTest01",
      event,
      contains: ["payment"],
      payload: {
        payment: {
          entity: paymentEntity,
        },
      },
      created_at: timestamp,
    };

    const rawBody = JSON.stringify(webhookBody);
    const signature = this.signPayload(rawBody, secret);

    return {
      payload: webhookBody,
      rawBody,
      signature,
    };
  }

  /**
   * Ingests and verifies a webhook payload and appends to the store.
   */
  public static ingestWebhook(
    rawBody: string | Record<string, any>,
    signature: string,
    secret?: string
  ): { record: WebhookEventRecord; verified: boolean } {
    const rawString = typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody);
    const parsed = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;

    const expectedSignature = this.signPayload(rawString, secret);
    let verified = false;

    try {
      const sigBuf = Buffer.from(signature, "utf8");
      const expBuf = Buffer.from(expectedSignature, "utf8");
      if (sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)) {
        verified = true;
      }
    } catch {
      verified = false;
    }

    const event = parsed.event || "unknown";
    const payment = parsed?.payload?.payment?.entity || {};
    const orderId = payment.order_id || parsed.order_id || "unknown";
    const paymentId = payment.id || parsed.payment_id || "unknown";

    const record: WebhookEventRecord = {
      id: `wh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      event,
      orderId,
      paymentId,
      vpa: payment.vpa,
      amount: payment.amount || 0,
      currency: payment.currency || "INR",
      status: payment.status || (event === "payment.captured" ? "captured" : "failed"),
      method: payment.method,
      errorCode: payment.error_code || undefined,
      errorDescription: payment.error_description || undefined,
      errorSource: payment.error_source || undefined,
      errorStep: payment.error_step || undefined,
      errorReason: payment.error_reason || undefined,
      signature,
      signatureVerified: verified,
      receivedAt: new Date().toISOString(),
      rawPayload: parsed,
    };

    // Prepend to list (latest first), cap at 100 entries
    this.events.unshift(record);
    if (this.events.length > 100) {
      this.events = this.events.slice(0, 100);
    }

    return { record, verified };
  }

  /**
   * Helper to dispatch an authentic Razorpay event directly through the webhook pipeline.
   */
  public static dispatchAndRecord(params: {
    event: "payment.captured" | "payment.failed" | "order.paid";
    orderId: string;
    paymentId: string;
    amount: number;
    currency?: string;
    vpa?: string;
    method?: string;
    error?: {
      code?: string;
      description?: string;
      source?: string;
      step?: string;
      reason?: string;
    };
  }, secret?: string): WebhookEventRecord {
    const { rawBody, signature } = this.buildRazorpayWebhookPayload(params, secret);
    const { record } = this.ingestWebhook(rawBody, signature, secret);
    return record;
  }

  /**
   * Returns stored webhook events with optional filtering.
   */
  public static getEvents(filter?: { event?: string; orderId?: string }): WebhookEventRecord[] {
    let result = [...this.events];
    if (filter?.event) {
      result = result.filter((e) => e.event === filter.event);
    }
    if (filter?.orderId) {
      result = result.filter((e) => e.orderId === filter.orderId);
    }
    return result;
  }

  /**
   * Returns recent webhook events.
   */
  public static getRecentEvents(limit: number = 20): WebhookEventRecord[] {
    return this.events.slice(0, limit);
  }

  /**
   * Returns all webhook events for a specific order.
   */
  public static getEventsForOrder(orderId: string): WebhookEventRecord[] {
    return this.events.filter((e) => e.orderId === orderId);
  }

  /**
   * Clears stored webhook events (useful for test resets).
   */
  public static clear(): void {
    this.events = [];
  }
}

export default WebhookStore;
