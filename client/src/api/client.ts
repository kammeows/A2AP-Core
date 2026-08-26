import { Envelope, InventoryItem, BuyerInventory, PolicyConfig, NegotiationResult, OfferPayload } from '../types';

const API_BASE = '/api';

export async function fetchInventory(): Promise<{
  item: InventoryItem;
  buyer_inventory: BuyerInventory;
}> {
  const res = await fetch(`${API_BASE}/inventory`);
  if (!res.ok) throw new Error(`Failed to fetch inventory: ${res.statusText}`);
  const data = await res.json();
  return {
    item: data.item,
    buyer_inventory: data.buyer_inventory,
  };
}

export async function updateInventory(params: {
  sellerStockKg?: number;
  buyerStockKg?: number;
  buyerTargetStockKg?: number;
}): Promise<{
  item: InventoryItem;
  buyer_inventory: BuyerInventory;
}> {
  const res = await fetch(`${API_BASE}/inventory`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Failed to update inventory: ${res.statusText}`);
  const data = await res.json();
  return {
    item: data.item,
    buyer_inventory: data.buyer_inventory,
  };
}

export async function fetchPolicy(): Promise<{
  config: PolicyConfig;
  week_spent_so_far: number;
  remaining_weekly_budget: number;
}> {
  const res = await fetch(`${API_BASE}/policy`);
  if (!res.ok) throw new Error(`Failed to fetch policy: ${res.statusText}`);
  return res.json();
}

export async function updatePolicy(config: Partial<PolicyConfig>): Promise<{ config: PolicyConfig }> {
  const res = await fetch(`${API_BASE}/policy`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error(`Failed to update policy: ${res.statusText}`);
  return res.json();
}

export async function triggerNegotiation(params: {
  scenario?: 'happy' | 'failure' | 'custom';
  buyerStockKg?: number;
  sellerStockKg?: number;
  buyerTargetStockKg?: number;
  delegationMode?: 'full' | 'partial';
  simulatePaymentFail?: boolean;
}): Promise<NegotiationResult> {
  const res = await fetch(`${API_BASE}/negotiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Failed to run negotiation: ${res.statusText}`);
  return res.json();
}

export async function confirmTransaction(params: {
  threadId: string;
  offer: Partial<OfferPayload>;
  action?: 'approve' | 'decline';
  simulatePaymentFail?: boolean;
}): Promise<{
  success: boolean;
  status: string;
  order_id?: string;
  total_amount?: number;
  message?: string;
  buyer_stock?: number;
  seller_stock?: number;
}> {
  const res = await fetch(`${API_BASE}/negotiate/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Failed to confirm transaction: ${res.statusText}`);
  return res.json();
}

export async function fetchThread(threadId: string): Promise<{
  thread_id: string;
  messages: Envelope[];
  count: number;
}> {
  const res = await fetch(`${API_BASE}/threads/${threadId}`);
  if (!res.ok) throw new Error(`Failed to fetch thread: ${res.statusText}`);
  return res.json();
}

export async function resetSystemState(): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/reset`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to reset state: ${res.statusText}`);
  return res.json();
}
