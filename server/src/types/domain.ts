export interface AgentCard {
  agent_id: string; // e.g. "agent:seller:razor_pies"
  name: string; // e.g. "RazorPies Wholesale"
  stocked_items: string[]; // ["cheese", "flour", "milk"]
  catalog: Record<string, { base_price: number; stock: number; unit?: string }>;
  discount_tiers?: Record<string, { min_quantity: number; discount_pct: number }[]>;
  negotiable: boolean;
  description: string;
}

export interface MenuItem {
  name: string;
  ingredients: Record<string, number>; // e.g. { flour: 2, cheese: 2, tomato: 1 }
}

export interface UpsellItem {
  item: string;
  quantity_kg: number;
  unit_price: number;
  discount_pct?: number;
  reason?: string;
}

export interface RfqPayload {
  item: string;
  quantity_kg: number;
  quality_min?: string;
  needed_by?: string;
  buyer_max_price_per_kg?: number;
  target_seller_id?: string;
  narrative?: string;
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
  seller_id?: string;
  offer_id?: string;
  rationale?: string;
  narrative?: string;
  upsell_item?: UpsellItem;
}

export interface SplitAcceptItem {
  seller_id: string;
  item: string;
  quantity_kg: number;
  unit_price: number;
  total_price: number;
  offer_ref?: string;
}

export interface SplitAcceptPayload {
  item: string;
  total_quantity_kg: number;
  total_cost: number;
  splits: SplitAcceptItem[];
  rationale: string;
}

export interface PurchasedItem {
  seller_id: string;
  item: string;
  quantity: number;
  price: number;
}

export interface InventoryItem {
  item: string;
  stock_kg: number;
  base_price_per_kg: number;
  discount_tiers: { min_quantity_kg: number; discount_pct: number }[];
}

export interface RestaurantProfile {
  restaurant_id: string;
  weekly_budget_cap: number;
  per_transaction_cap: number;
  quality_min: string;
  max_price_per_kg: Record<string, number>;
  menu?: Record<string, Record<string, number>>;
}

export type BuyerDecisionAction =
  | "propose_accept"
  | "propose_split_accept"
  | "send_counter"
  | "decline_upsell"
  | "reject";

export interface BuyerDecision {
  action: BuyerDecisionAction;
  counter?: Partial<RfqPayload>;
  split_payload?: SplitAcceptPayload;
  target_offer?: OfferPayload;
  accepted_upsell?: UpsellItem;
  declined_upsell_reason?: string;
  reason?: string;
  rationale?: string;
}
