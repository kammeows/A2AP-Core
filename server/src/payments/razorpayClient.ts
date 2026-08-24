import Razorpay from "razorpay";
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

const keyId = process.env.RAZORPAY_KEY_ID?.trim();
const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

const hasValidKeys = Boolean(
  keyId &&
  keySecret &&
  keyId.length > 5 &&
  keySecret.length > 5 &&
  !keyId.includes("YOUR_")
);

let razorpayInstance: Razorpay | null = null;
if (hasValidKeys) {
  try {
    razorpayInstance = new Razorpay({
      key_id: keyId!,
      key_secret: keySecret!,
    });
  } catch (err) {
    console.warn("Failed to initialize Razorpay instance:", err);
  }
}

export interface RazorpayOrderResult {
  id: string;
  entity: string;
  amount: number;
  currency: string;
  receipt?: string;
  status: "created" | "attempted" | "paid";
  created_at: number;
  is_mock?: boolean;
}

export async function createOrder(
  amountInPaise: number,
  currency: string = "INR",
  receipt: string = `rcpt_${Date.now()}`
): Promise<RazorpayOrderResult> {
  if (razorpayInstance && hasValidKeys) {
    try {
      const order = await razorpayInstance.orders.create({
        amount: Math.round(amountInPaise),
        currency,
        receipt,
        notes: {
          system: "A2A_Bounded_Procurement_Agent",
          agent: "agent:buyer:restaurant_42",
        },
      });

      return {
        id: order.id,
        entity: order.entity || "order",
        amount: Number(order.amount),
        currency: order.currency,
        receipt: (order.receipt as string) || receipt,
        status: (order.status as "created" | "attempted" | "paid") || "created",
        created_at: Number(order.created_at) || Math.floor(Date.now() / 1000),
        is_mock: false,
      };
    } catch (err: any) {
      console.warn("Razorpay API call error, falling back to test order simulator:", err.message);
    }
  }

  // Realistic mock simulator for offline / test runs
  const mockOrderId = `order_test_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
  return {
    id: mockOrderId,
    entity: "order",
    amount: Math.round(amountInPaise),
    currency,
    receipt,
    status: "created",
    created_at: Math.floor(Date.now() / 1000),
    is_mock: true,
  };
}

export const razorpayClient = {
  createOrder,
};

export default razorpayClient;
