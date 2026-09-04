export interface ClientApiKeys {
  keyId: string;
  keySecret: string;
  webhookSecret?: string;
  geminiApiKey?: string;
}

const STORAGE_KEYS = {
  KEY_ID: 'a2a_razorpay_key_id',
  KEY_SECRET: 'a2a_razorpay_key_secret',
  WEBHOOK_SECRET: 'a2a_razorpay_webhook_secret',
  GEMINI_API_KEY: 'a2a_gemini_api_key',
};

/**
 * Retrieves BYOK keys stored in the user's browser localStorage.
 */
export function getStoredKeys(): ClientApiKeys {
  if (typeof window === 'undefined') {
    return { keyId: '', keySecret: '', webhookSecret: '', geminiApiKey: '' };
  }

  return {
    keyId: localStorage.getItem(STORAGE_KEYS.KEY_ID) || '',
    keySecret: localStorage.getItem(STORAGE_KEYS.KEY_SECRET) || '',
    webhookSecret: localStorage.getItem(STORAGE_KEYS.WEBHOOK_SECRET) || '',
    geminiApiKey: localStorage.getItem(STORAGE_KEYS.GEMINI_API_KEY) || '',
  };
}

/**
 * Persists BYOK keys in browser localStorage.
 */
export function saveStoredKeys(keys: ClientApiKeys): void {
  if (typeof window === 'undefined') return;

  if (keys.keyId.trim()) {
    localStorage.setItem(STORAGE_KEYS.KEY_ID, keys.keyId.trim());
  } else {
    localStorage.removeItem(STORAGE_KEYS.KEY_ID);
  }

  if (keys.keySecret.trim()) {
    localStorage.setItem(STORAGE_KEYS.KEY_SECRET, keys.keySecret.trim());
  } else {
    localStorage.removeItem(STORAGE_KEYS.KEY_SECRET);
  }

  if (keys.webhookSecret?.trim()) {
    localStorage.setItem(STORAGE_KEYS.WEBHOOK_SECRET, keys.webhookSecret.trim());
  } else {
    localStorage.removeItem(STORAGE_KEYS.WEBHOOK_SECRET);
  }

  if (keys.geminiApiKey?.trim()) {
    localStorage.setItem(STORAGE_KEYS.GEMINI_API_KEY, keys.geminiApiKey.trim());
  } else {
    localStorage.removeItem(STORAGE_KEYS.GEMINI_API_KEY);
  }

  // Trigger custom event so header / UI reactive components update instantly
  window.dispatchEvent(new Event('a2a_keys_updated'));
}

/**
 * Clears all custom BYOK keys, reverting back to the built-in Sandbox Simulator mode.
 */
export function clearStoredKeys(): void {
  if (typeof window === 'undefined') return;

  localStorage.removeItem(STORAGE_KEYS.KEY_ID);
  localStorage.removeItem(STORAGE_KEYS.KEY_SECRET);
  localStorage.removeItem(STORAGE_KEYS.WEBHOOK_SECRET);
  localStorage.removeItem(STORAGE_KEYS.GEMINI_API_KEY);

  window.dispatchEvent(new Event('a2a_keys_updated'));
}

/**
 * Returns true if valid custom Razorpay Key ID and Secret are configured in localStorage.
 */
export function hasCustomRazorpayKeys(): boolean {
  const keys = getStoredKeys();
  return Boolean(
    keys.keyId &&
    keys.keySecret &&
    keys.keyId.length > 5 &&
    keys.keySecret.length > 5 &&
    !keys.keyId.includes('YOUR_')
  );
}

/**
 * Returns HTTP headers containing the active BYOK credentials for outgoing API requests.
 */
export function getAuthHeaders(): Record<string, string> {
  const keys = getStoredKeys();
  const headers: Record<string, string> = {};

  if (keys.keyId && keys.keySecret) {
    headers['x-razorpay-key-id'] = keys.keyId.trim();
    headers['x-razorpay-key-secret'] = keys.keySecret.trim();
  }

  if (keys.webhookSecret) {
    headers['x-razorpay-webhook-secret'] = keys.webhookSecret.trim();
  }

  if (keys.geminiApiKey) {
    headers['x-gemini-api-key'] = keys.geminiApiKey.trim();
  }

  return headers;
}
