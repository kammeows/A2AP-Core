CREATE TABLE IF NOT EXISTS messages (
  message_id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL   -- JSON blob
);

CREATE TABLE IF NOT EXISTS policy_configs (
  agent_id TEXT PRIMARY KEY,
  config TEXT NOT NULL   -- JSON blob of PolicyConfig
);

CREATE TABLE IF NOT EXISTS inventory (
  item TEXT PRIMARY KEY,
  data TEXT NOT NULL     -- JSON blob of InventoryItem
);

CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);