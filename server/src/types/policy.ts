// governance and safety layer
// how to give ai agents delegation without risking runaway spending?
export interface PolicyConfig {
  agent_id: string;
  delegation_mode: "full" | "partial"; // full -> policy engine automatically executes order, partial -> requires human confirmation even if rules pass
  weekly_budget_cap: number;
  per_transaction_cap: number; // max amount allowed for a single purchase
  per_unit_price_ceiling: Record<string, number>; // item -> max price/unit
  seller_allowlist: string[];
}

export interface PolicyCheck {
  rule: string;
  passed: boolean;
  value?: number;
  limit?: number;
}

export interface PolicyResult {
  approved: boolean;
  checks: PolicyCheck[];
  action: "AUTO_ACCEPT" | "RENEGOTIATE_OR_ESCALATE";
}
