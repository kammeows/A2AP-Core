import { OfferPayload } from "../types/domain.js";
import { PolicyConfig, PolicyResult, PolicyCheck } from "../types/policy.js";

/**
 * Pure function: Deterministically evaluates a proposed seller offer against a buyer's policy rules.
 * 
 * Rules checked:
 * 1. seller_allowlisted: Seller agent ID must be present in policy.seller_allowlist.
 * 2. unit_price_within_ceiling: final_price_per_kg must not exceed policy.per_unit_price_ceiling for that item.
 * 3. within_per_transaction_cap: total_price must not exceed policy.per_transaction_cap.
 * 4. within_weekly_budget: total_price must not exceed (policy.weekly_budget_cap - weekSpentSoFar).
 * 
 * @param offer The OfferPayload proposed by the seller agent.
 * @param sellerId The agent identifier of the seller (e.g. "agent:seller:veggie_vendor_09").
 * @param policy The PolicyConfig for the buyer agent.
 * @param weekSpentSoFar Total amount already confirmed/spent in the current weekly cycle.
 * @returns PolicyResult containing approved boolean, individual checks, and recommended action.
 */
export function evaluateDeal(
  offer: OfferPayload,
  sellerId: string,
  policy: PolicyConfig,
  weekSpentSoFar: number = 0
): PolicyResult {
  const checks: PolicyCheck[] = [];

  // Check 1: Seller Allowlist
  checks.push({
    rule: "seller_allowlisted",
    passed: policy.seller_allowlist.includes(sellerId),
  });

  // Check 2: Unit Price Ceiling
  const ceiling = policy.per_unit_price_ceiling[offer.item];
  checks.push({
    rule: "unit_price_within_ceiling",
    passed: ceiling === undefined || offer.final_price_per_kg <= ceiling,
    value: offer.final_price_per_kg,
    limit: ceiling,
  });

  // Check 3: Per-Transaction Cap
  checks.push({
    rule: "within_per_transaction_cap",
    passed: offer.total_price <= policy.per_transaction_cap,
    value: offer.total_price,
    limit: policy.per_transaction_cap,
  });

  // Check 4: Weekly Budget Balance
  const remaining = policy.weekly_budget_cap - weekSpentSoFar;
  checks.push({
    rule: "within_weekly_budget",
    passed: offer.total_price <= remaining,
    value: offer.total_price,
    limit: remaining,
  });

  // All checks must pass for approval
  const approved = checks.every((c) => c.passed);

  return {
    approved,
    checks,
    action:
      approved && policy.delegation_mode === "full"
        ? "AUTO_ACCEPT"
        : "RENEGOTIATE_OR_ESCALATE",
  };
}

export class PolicyEngine {
  static evaluateDeal = evaluateDeal;
}

export default PolicyEngine;
