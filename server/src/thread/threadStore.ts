import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Envelope } from "../types/messages.js";

// Determine directory and database file path
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

// Enable WAL mode for high concurrency and resilience
try {
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 10000");
} catch {
  // Pragma may fail in restricted/memory modes
}

// Ensure the messages table exists
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

/**
 * Appends a new message envelope to the audit trail.
 */
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

/**
 * Retrieves all messages for a specific thread, ordered chronologically.
 */
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

/**
 * Clears all messages belonging to a given thread (useful for testing and resets).
 */
export function clearThread(threadId: string): void {
  const stmt = db.prepare(`DELETE FROM messages WHERE thread_id = ?`);
  stmt.run(threadId);
}

/**
 * Clears all messages from the entire table.
 */
export function clearAll(): void {
  const stmt = db.prepare(`DELETE FROM messages`);
  stmt.run();
}

/**
 * ThreadStore class wrapper for convenience.
 */
export class ThreadStore {
  static appendMessage = appendMessage;
  static getThread = getThread;
  static clearThread = clearThread;
  static clearAll = clearAll;
}

export default ThreadStore;
