export type MessageType =
  | "RFQ" // request for quotation -> buyer asks the seller agent for a price quote
  | "OFFER" // seller agent replies with pricing, discounts, delivery dates, upsell
  | "COUNTER_OFFER" // buyer requests an adjusted quantity or price
  | "ACCEPT" // buyer agent proposes to accept a single offer
  | "SPLIT_ACCEPT" // buyer agent proposes to accept a split multi-seller deal
  | "UPSELL_DECLINE" // buyer agent declines unsolicited upsell item (e.g. not on menu)
  | "UPSELL_ACCEPT" // buyer agent accepts valuable upsell item within budget
  | "REJECT" // an outright rejection of the offer
  | "POLICY_CHECK" // system-generated, deterministic policy engine evaluates the proposed deal
  | "ORDER_CREATE" // system event where razorpay orders api is called to make an order
  | "ORDER_CONFIRM"
  | "ORDER_FAIL";

export interface Envelope {
  message_id: string; // e.g. "msg_0007"
  thread_id: string;
  timestamp: string; // ISO 8601
  from: string; // "agent:buyer:razorslice" | "agent:seller:razor_pies" | "system:policy_engine"
  to: string;
  type: MessageType;
  payload: Record<string, unknown>;
}
