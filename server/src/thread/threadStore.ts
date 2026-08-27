import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Envelope } from "../types/messages.js";

let dbDir: string;
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  dbDir = path.resolve(__dirname, "../../data");
} catch {
  dbDir = path.resolve(process.cwd(), "data");
}

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dbDir, "a2a.db");
export const db = new Database(dbPath, { timeout: 10000 });

try {
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 10000");
} catch {
  // Pragma fallback
}

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    message_id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    from_agent TEXT NOT NULL,
    to_agent TEXT NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
`);

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

export class ThreadStore {
  static appendMessage = appendMessage;
  static getThread = getThread;
  static clearThread = clearThread;
  static clearAll = clearAll;
  static getConfirmedSpendingForAgent(buyerId: string): number {
    const stmt = db.prepare(`
      SELECT payload FROM messages
      WHERE from_agent = ? AND type = 'ORDER_CREATE'
    `);
    const rows = stmt.all(buyerId) as Array<{ payload: string }>;
    let total = 0;
    for (const r of rows) {
      try {
        const p = JSON.parse(r.payload);
        if (typeof p.total_price === "number") {
          total += p.total_price;
        } else if (typeof p.amount === "number") {
          total += p.amount / 100;
        }
      } catch {
        // ignore
      }
    }
    return total;
  }
}

export default ThreadStore;
