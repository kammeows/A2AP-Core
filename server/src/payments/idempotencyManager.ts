/**
 * Idempotency Engine for Autonomous A2A Payment Rails
 * 
 * Guarantees at-most-once execution for financial transactions:
 * • Rule 1 (Same Key = Zero New Charges): Network timeouts / retries reuse the exact same key.
 * • Rule 2 (Intentional Recovery = Fresh Key): Bank declines require a fresh key on retry.
 */

export interface IdempotencyRecord {
  key: string;              // e.g. "idemp_order_TX123_attempt_1"
  order_id: string;         // Razorpay Order ID
  amount_paise: number;
  status: "INITIATED" | "SETTLED" | "FAILED" | "RECONCILING";
  created_at: number;
  updated_at: number;
  attempt_number: number;
  vpa?: string;
  response_payload?: any;   // Cached settlement receipt if already executed
  error?: any;              // Stored error diagnostic if failed
}

export class IdempotencyManager {
  private static records = new Map<string, IdempotencyRecord>();

  /**
   * Generates a deterministic idempotency key following the scheme:
   * idemp_{orderId}_attempt_{attemptNumber}
   */
  public static generateKey(orderId: string, attemptNumber: number = 1): string {
    const cleanOrderId = orderId.replace(/^order_/, "");
    return `idemp_${cleanOrderId}_attempt_${attemptNumber}`;
  }

  /**
   * Records a new payment attempt in INITIATED state or returns existing record.
   */
  public static recordAttempt(
    key: string,
    orderId: string,
    amountPaise: number,
    attemptNumber: number = 1,
    vpa?: string
  ): IdempotencyRecord {
    const existing = this.records.get(key);
    if (existing) {
      existing.updated_at = Date.now();
      return existing;
    }

    const record: IdempotencyRecord = {
      key,
      order_id: orderId,
      amount_paise: amountPaise,
      status: "INITIATED",
      created_at: Date.now(),
      updated_at: Date.now(),
      attempt_number: attemptNumber,
      vpa,
    };

    this.records.set(key, record);
    return record;
  }

  /**
   * Resolves an attempt to either SETTLED (with cached response payload) or FAILED (with error diagnostics).
   */
  public static resolveAttempt(
    key: string,
    status: "SETTLED" | "FAILED",
    responsePayload?: any,
    error?: any
  ): IdempotencyRecord {
    let record = this.records.get(key);
    if (!record) {
      record = {
        key,
        order_id: responsePayload?.orderId || "unknown",
        amount_paise: responsePayload?.amount || 0,
        status,
        created_at: Date.now(),
        updated_at: Date.now(),
        attempt_number: 1,
        response_payload: responsePayload,
        error,
      };
      this.records.set(key, record);
      return record;
    }

    record.status = status;
    record.updated_at = Date.now();
    if (responsePayload) {
      record.response_payload = responsePayload;
    }
    if (error) {
      record.error = error;
    }

    return record;
  }

  /**
   * Marks a transaction in RECONCILING state (e.g. while verifying socket drop or polling status).
   */
  public static markReconciling(key: string): IdempotencyRecord | undefined {
    const record = this.records.get(key);
    if (record) {
      record.status = "RECONCILING";
      record.updated_at = Date.now();
    }
    return record;
  }

  /**
   * Retrieves a record by key.
   */
  public static getRecord(key: string): IdempotencyRecord | undefined {
    return this.records.get(key);
  }

  /**
   * Checks whether an attempt is already settled or in-flight.
   */
  public static hasActiveAttempt(key: string): boolean {
    const record = this.records.get(key);
    return Boolean(record && (record.status === "INITIATED" || record.status === "RECONCILING"));
  }

  /**
   * Returns all attempt records for a specific Razorpay order ID.
   */
  public static getRecordsForOrder(orderId: string): IdempotencyRecord[] {
    const results: IdempotencyRecord[] = [];
    for (const record of this.records.values()) {
      if (record.order_id === orderId) {
        results.push(record);
      }
    }
    return results.sort((a, b) => a.attempt_number - b.attempt_number);
  }

  /**
   * Returns all tracked idempotency records.
   */
  public static getAllRecords(): IdempotencyRecord[] {
    return Array.from(this.records.values()).sort((a, b) => b.created_at - a.created_at);
  }

  /**
   * Clears in-memory records (useful for test isolation or reset).
   */
  public static clear(): void {
    this.records.clear();
  }
}

export default IdempotencyManager;
