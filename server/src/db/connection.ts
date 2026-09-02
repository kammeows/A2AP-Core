import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbDir = path.resolve(__dirname, "../../data");

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dbDir, "a2a.db");
export const db = new Database(dbPath, { timeout: 10000 });

// Enable WAL mode for high concurrency
try {
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 10000");
} catch {
  // Pragma may fail if memory db or in restricted mode
}

// Initialize tables
const defaultSchema = `
CREATE TABLE IF NOT EXISTS messages (
  message_id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS policy_configs (
  agent_id TEXT PRIMARY KEY,
  config TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory (
  item TEXT PRIMARY KEY,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_cards (
  agent_id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS buyer_inventory (
  agent_id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
`;

try {
  const candidate1 = path.join(__dirname, "schema.sql");
  const candidate2 = path.resolve(__dirname, "../../src/db/schema.sql");
  let schemaSql = defaultSchema;
  if (fs.existsSync(candidate1)) {
    schemaSql = fs.readFileSync(candidate1, "utf-8");
  } else if (fs.existsSync(candidate2)) {
    schemaSql = fs.readFileSync(candidate2, "utf-8");
  }
  db.exec(schemaSql);
} catch (err) {
  db.exec(defaultSchema);
}

export default db;
