import { Envelope } from "../types/messages.js";
import { db } from "../db/connection.js";

export { db };

export function appendMessage(envelope: Envelope): void {
  const stmt = db.prepare(`
    INSERT INTO messages (message_id, thread_id, timestamp, from_agent, to_agent, type, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    envelope.message_id,
    envelope.thread_id,
    envelope.timestamp,
    envelope.from,
    envelope.to,
    envelope.type,
    JSON.stringify(envelope.payload)
  );
}

export function getThread(threadId: string): Envelope[] {
  const stmt = db.prepare(`
    SELECT message_id, thread_id, timestamp, from_agent as "from", to_agent as "to", type, payload
    FROM messages
    WHERE thread_id = ?
    ORDER BY timestamp ASC, rowid ASC
  `);

  const rows = stmt.all(threadId) as Array<{
    message_id: string;
    thread_id: string;
    timestamp: string;
    from: string;
    to: string;
    type: Envelope["type"];
    payload: string;
  }>;

  return rows.map((row) => ({
    message_id: row.message_id,
    thread_id: row.thread_id,
    timestamp: row.timestamp,
    from: row.from,
    to: row.to,
    type: row.type,
    payload: JSON.parse(row.payload),
  }));
}

export function clearThread(threadId: string): void {
  const stmt = db.prepare(`DELETE FROM messages WHERE thread_id = ?`);
  stmt.run(threadId);
}

export function clearAll(): void {
  const stmt = db.prepare(`DELETE FROM messages`);
  stmt.run();
}

export function getAllThreads(): string[] {
  const stmt = db.prepare(`SELECT DISTINCT thread_id FROM messages ORDER BY timestamp DESC`);
  const rows = stmt.all() as Array<{ thread_id: string }>;
  return rows.map((r) => r.thread_id);
}

export class ThreadStore {
  static appendMessage = appendMessage;
  static getThread = getThread;
  static getAllThreads = getAllThreads;
  static clearThread = clearThread;
  static clearAll = clearAll;
  static getConfirmedSpendingForAgent(buyerId: string): number {
    try {
      const stmt = db.prepare(`
        SELECT payload FROM messages
        WHERE (to_agent = ? OR from_agent = ?) AND type = 'ORDER_CONFIRM'
      `);
      const rows = stmt.all(buyerId, buyerId) as Array<{ payload: string }>;
      let total = 0;
      for (const r of rows) {
        try {
          const p = JSON.parse(r.payload);
          if (typeof p.amount_inr === "number") {
            total += p.amount_inr;
          } else if (typeof p.total_price === "number") {
            total += p.total_price;
          } else if (typeof p.amount_paise === "number") {
            total += p.amount_paise / 100;
          } else if (typeof p.amount === "number") {
            total += p.amount / 100;
          }
        } catch {
          // ignore
        }
      }
      return total;
    } catch {
      return 0;
    }
  }
}

export default ThreadStore;
