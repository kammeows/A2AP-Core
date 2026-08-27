// buyer's request
export interface RfqPayload {
  item: string;
  quantity_kg: number;
  quality_min: string;
  needed_by: string;
  buyer_max_price_per_kg: number;
}

// sellers quote
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

export interface InventoryItem {
  item: string;
  stock_kg: number;
  base_price_per_kg: number;
  discount_tiers: { min_quantity_kg: number; discount_pct: number }[];
}
