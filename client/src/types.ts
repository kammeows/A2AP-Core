export type MessageType =
  | "RFQ"
  | "OFFER"
  | "COUNTER_OFFER"
  | "ACCEPT"
  | "REJECT"
  | "POLICY_CHECK"
  | "ORDER_CREATE"
  | "ORDER_CONFIRM"
  | "ORDER_FAIL";

export interface Envelope {
  message_id: string;
  thread_id: string;
  timestamp: string;
  from: string;
  to: string;
  type: MessageType;
  payload: Record<string, any>;
}

export interface PolicyCheck {
  rule: string;
  passed: boolean;
  value?: number;
  limit?: number;
  detail?: string;
}

export interface PolicyConfig {
  agent_id: string;
  delegation_mode: "full" | "partial";
  weekly_budget_cap: number;
  per_transaction_cap: number;
  per_unit_price_ceiling: Record<string, number>;
  seller_allowlist: string[];
}

export interface DiscountTier {
  min_quantity_kg: number;
  discount_pct: number;
}

export interface InventoryItem {
  item: string;
  stock_kg: number;
  base_price_per_kg: number;
  discount_tiers: DiscountTier[];
}

export interface BuyerInventory {
  item: string;
  current_stock_kg: number;
  target_stock_kg: number;
  reorder_threshold_kg: number;
}

export interface OfferPayload {
  item: string;
  quantity_kg: number;
  quality: string;
  base_price_per_kg: number;
  discount_pct: number;
  discount_reason: string;
  final_price_per_kg: number;
  total_price: number;
  delivery_by: string;
  offer_expires: string;
  rationale?: string;
}

export interface RfqPayload {
  item: string;
  quantity_kg: number;
  quality_min: string;
  needed_by: string;
  buyer_max_price_per_kg: number;
}

export interface NegotiationResult {
  success: boolean;
  thread_id: string;
  scenario: "happy" | "failure" | "custom";
  status:
    | "CONFIRMED"
    | "AWAITING_CONFIRMATION"
    | "RENEGOTIATED_AND_CONFIRMED"
    | "ESCALATED_POLICY_VIOLATION"
    | "NO_SELLER_FOUND"
    | "NO_PURCHASE_NEEDED"
    | "PAYMENT_FAILED"
    | "REJECTED";
  final_message_type: MessageType;
  order_id?: string;
  total_amount?: number;
  pending_offer?: OfferPayload;
  policy_checks?: PolicyCheck[];
  message?: string;
  buyer_stock?: number;
  seller_stock?: number;
}
