import type { Request } from "express";

export interface RazorpayCredentials {
  keyId?: string;
  keySecret?: string;
  webhookSecret?: string;
}

export interface ClientCredentials extends RazorpayCredentials {
  geminiApiKey?: string;
}

/**
 * Extracts BYOK (Bring Your Own Keys) credentials from incoming HTTP request headers or body.
 * Headers take precedence, followed by JSON body parameters.
 */
export function extractCredentials(req: Request): ClientCredentials {
  const headers = req.headers || {};
  const body = req.body || {};
  const bodyCreds = body.credentials || {};

  const keyId = (
    (headers["x-razorpay-key-id"] as string) ||
    bodyCreds.keyId ||
    body.razorpayKeyId ||
    ""
  ).trim();

  const keySecret = (
    (headers["x-razorpay-key-secret"] as string) ||
    bodyCreds.keySecret ||
    body.razorpayKeySecret ||
    ""
  ).trim();

  const webhookSecret = (
    (headers["x-razorpay-webhook-secret"] as string) ||
    bodyCreds.webhookSecret ||
    body.razorpayWebhookSecret ||
    ""
  ).trim();

  const geminiApiKey = (
    (headers["x-gemini-api-key"] as string) ||
    bodyCreds.geminiApiKey ||
    body.geminiApiKey ||
    ""
  ).trim();

  return {
    keyId: keyId || undefined,
    keySecret: keySecret || undefined,
    webhookSecret: webhookSecret || undefined,
    geminiApiKey: geminiApiKey || undefined,
  };
}
