import {
  Envelope,
  InventoryItem,
  BuyerInventory,
  PolicyConfig,
  NegotiationResult,
  OfferPayload,
  PurchasedItem,
  SimulationMode,
  WebhookEventRecord,
} from '../types';
import { getAuthHeaders, ClientApiKeys } from '../utils/keyStore';

const API_BASE = '/api';

/**
 * Standard fetch wrapper that automatically attaches BYOK authentication headers.
 */
async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const authHeaders = getAuthHeaders();
  const headers = {
    ...authHeaders,
    ...(options.headers || {}),
  };
  return fetch(url, {
    ...options,
    headers,
  });
}

export async function fetchInventory(): Promise<{
  item: InventoryItem;
  buyer_inventory: BuyerInventory;
}> {
  const res = await apiFetch(`${API_BASE}/inventory`);
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
  const res = await apiFetch(`${API_BASE}/inventory`, {
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
  const res = await apiFetch(`${API_BASE}/policy`);
  if (!res.ok) throw new Error(`Failed to fetch policy: ${res.statusText}`);
  return res.json();
}

export async function updatePolicy(config: Partial<PolicyConfig>): Promise<{ config: PolicyConfig }> {
  const res = await apiFetch(`${API_BASE}/policy`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error(`Failed to update policy: ${res.statusText}`);
  return res.json();
}

export async function triggerNegotiation(params: {
  scenario?: 'happy' | 'failure' | 'custom';
  simulationMode?: SimulationMode;
  buyerStockKg?: number;
  sellerStockKg?: number;
  buyerTargetStockKg?: number;
  delegationMode?: 'full' | 'partial';
  simulatePaymentFail?: boolean;
  itemToProcure?: string;
  quantityNeeded?: number;
  itemsToProcure?: Array<{ item: string; quantity: number }>;
  customRfq?: any;
  sellerInventories?: Record<string, Record<string, number>>;
  buyerVpa?: string;
}): Promise<NegotiationResult> {
  const res = await apiFetch(`${API_BASE}/negotiate`, {
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
  payment_id?: string;
  total_amount?: number;
  message?: string;
  buyer_stock?: number;
  seller_stock?: number;
  purchased_items?: PurchasedItem[];
}> {
  const res = await apiFetch(`${API_BASE}/negotiate/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Failed to confirm transaction: ${res.statusText}`);
  return res.json();
}

export async function retryPayment(params: {
  orderId: string;
  threadId?: string;
  buyerVpa?: string;
}): Promise<NegotiationResult> {
  const res = await apiFetch(`${API_BASE}/payments/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Failed to retry payment: ${res.statusText}`);
  return res.json();
}

export async function cancelOrder(params: {
  orderId: string;
  threadId?: string;
  reason?: string;
}): Promise<{ success: boolean; status: string; message: string }> {
  const res = await apiFetch(`${API_BASE}/payments/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Failed to cancel order: ${res.statusText}`);
  return res.json();
}

export async function fetchWebhookEvents(): Promise<{
  success: boolean;
  count: number;
  events: WebhookEventRecord[];
}> {
  const res = await apiFetch(`${API_BASE}/payments/webhook/events`);
  if (!res.ok) throw new Error(`Failed to fetch webhooks: ${res.statusText}`);
  return res.json();
}

export async function fetchThread(threadId: string): Promise<{
  thread_id: string;
  messages: Envelope[];
  count: number;
}> {
  const res = await apiFetch(`${API_BASE}/threads/${threadId}`);
  if (!res.ok) throw new Error(`Failed to fetch thread: ${res.statusText}`);
  return res.json();
}

export async function resetSystemState(): Promise<{ success: boolean; message: string }> {
  const res = await apiFetch(`${API_BASE}/reset`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to reset state: ${res.statusText}`);
  return res.json();
}

/**
 * Validates BYOK credentials against Razorpay's live Orders API.
 */
export async function verifyApiKeys(keys?: ClientApiKeys): Promise<{
  success: boolean;
  valid: boolean;
  isCustom?: boolean;
  mode?: string;
  keyIdPrefix?: string;
  message?: string;
  error?: string;
}> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(keys
      ? {
          'x-razorpay-key-id': keys.keyId,
          'x-razorpay-key-secret': keys.keySecret,
          ...(keys.webhookSecret ? { 'x-razorpay-webhook-secret': keys.webhookSecret } : {}),
          ...(keys.geminiApiKey ? { 'x-gemini-api-key': keys.geminiApiKey } : {}),
        }
      : getAuthHeaders()),
  };

  const res = await fetch(`${API_BASE}/payments/verify-keys`, {
    method: 'POST',
    headers,
  });
  return res.json();
}

/**
 * Fetches server key configuration status (sanitized).
 */
export async function fetchPaymentConfig(): Promise<{
  success: boolean;
  hasServerKeys: boolean;
  serverKeyPrefix: string | null;
  sandboxMode: boolean;
}> {
  const res = await fetch(`${API_BASE}/payments/config`);
  if (!res.ok) throw new Error(`Failed to fetch payment config: ${res.statusText}`);
  return res.json();
}
