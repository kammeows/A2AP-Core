import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Dual-mode database interface
export interface DatabaseInterface {
  prepare(sql: string): {
    all(...params: any[]): any[];
    get(...params: any[]): any;
    run(...params: any[]): { changes: number };
  };
  exec(sql: string): void;
  pragma(sql: string): void;
}

class InMemoryDatabase implements DatabaseInterface {
  private messages: Array<{
    message_id: string;
    thread_id: string;
    timestamp: string;
    from_agent: string;
    to_agent: string;
    type: string;
    payload: string;
  }> = [];
  private policyConfigs = new Map<string, string>();
  private inventory = new Map<string, string>();
  private agentCards = new Map<string, string>();
  private buyerInventory = new Map<string, string>();

  pragma(_cmd: string) {}
  exec(_sql: string) {}

  prepare(sql: string) {
    const s = sql.trim();

    // 1. messages
    if (s.includes("INSERT INTO messages")) {
      return {
        all: () => [],
        get: () => undefined,
        run: (
          message_id: string,
          thread_id: string,
          timestamp: string,
          from_agent: string,
          to_agent: string,
          type: string,
          payload: string
        ) => {
          this.messages.push({
            message_id,
            thread_id,
            timestamp,
            from_agent,
            to_agent,
            type,
            payload,
          });
          return { changes: 1 };
        },
      };
    }
    if (
      s.includes("SELECT message_id, thread_id") &&
      s.includes("WHERE thread_id = ?")
    ) {
      return {
        all: (threadId: string) => {
          return this.messages
            .filter((m) => m.thread_id === threadId)
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
            .map((m) => ({ ...m, from: m.from_agent, to: m.to_agent }));
        },
        get: () => undefined,
        run: () => ({ changes: 0 }),
      };
    }
    if (s.includes("DELETE FROM messages WHERE thread_id = ?")) {
      return {
        all: () => [],
        get: () => undefined,
        run: (threadId: string) => {
          this.messages = this.messages.filter((m) => m.thread_id !== threadId);
          return { changes: 1 };
        },
      };
    }
    if (s.includes("DELETE FROM messages")) {
      return {
        all: () => [],
        get: () => undefined,
        run: () => {
          this.messages = [];
          return { changes: 1 };
        },
      };
    }
    if (s.includes("SELECT DISTINCT thread_id FROM messages")) {
      return {
        all: () => {
          const threads = Array.from(
            new Set(this.messages.map((m) => m.thread_id))
          ).reverse();
          return threads.map((thread_id) => ({ thread_id }));
        },
        get: () => undefined,
        run: () => ({ changes: 0 }),
      };
    }
    if (s.includes("type = 'ORDER_CONFIRM'")) {
      return {
        all: (buyerId1: string, buyerId2: string) => {
          return this.messages
            .filter(
              (m) =>
                (m.to_agent === buyerId1 || m.from_agent === buyerId2) &&
                m.type === "ORDER_CONFIRM"
            )
            .map((m) => ({ payload: m.payload }));
        },
        get: () => undefined,
        run: () => ({ changes: 0 }),
      };
    }

    // 2. agent_cards
    if (s.includes("SELECT data FROM agent_cards")) {
      return {
        all: () =>
          Array.from(this.agentCards.values()).map((data) => ({ data })),
        get: () => undefined,
        run: () => ({ changes: 0 }),
      };
    }
    if (s.includes("INSERT INTO agent_cards")) {
      return {
        all: () => [],
        get: () => undefined,
        run: (agent_id: string, data: string) => {
          this.agentCards.set(agent_id, data);
          return { changes: 1 };
        },
      };
    }

    // 3. buyer_inventory
    if (s.includes("SELECT data FROM buyer_inventory")) {
      return {
        all: () => [],
        get: (agentId: string) => {
          const data = this.buyerInventory.get(agentId);
          return data ? { data } : undefined;
        },
        run: () => ({ changes: 0 }),
      };
    }
    if (s.includes("INSERT INTO buyer_inventory")) {
      return {
        all: () => [],
        get: () => undefined,
        run: (agent_id: string, data: string) => {
          this.buyerInventory.set(agent_id, data);
          return { changes: 1 };
        },
      };
    }

    // 4. inventory
    if (s.includes("SELECT data FROM inventory")) {
      return {
        all: () => [],
        get: (item: string) => {
          const data = this.inventory.get(item);
          return data ? { data } : undefined;
        },
        run: () => ({ changes: 0 }),
      };
    }
    if (s.includes("INSERT INTO inventory")) {
      return {
        all: () => [],
        get: () => undefined,
        run: (item: string, data: string) => {
          this.inventory.set(item, data);
          return { changes: 1 };
        },
      };
    }

    // 5. policy_configs
    if (s.includes("SELECT COUNT(*) as c FROM policy_configs")) {
      return {
        all: () => [],
        get: () => ({ c: this.policyConfigs.size }),
        run: () => ({ changes: 0 }),
      };
    }
    if (s.includes("SELECT config FROM policy_configs")) {
      return {
        all: () => [],
        get: (agentId: string) => {
          const config = this.policyConfigs.get(agentId);
          return config ? { config } : undefined;
        },
        run: () => ({ changes: 0 }),
      };
    }
    if (s.includes("INSERT INTO policy_configs")) {
      return {
        all: () => [],
        get: () => undefined,
        run: (agentId: string, config: string) => {
          this.policyConfigs.set(agentId, config);
          return { changes: 1 };
        },
      };
    }

    return {
      all: () => [],
      get: () => undefined,
      run: () => ({ changes: 0 }),
    };
  }
}

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let dbInstance: DatabaseInterface;
try {
  const isVercel = Boolean(process.env.VERCEL);
  let dbDir: string;
  if (isVercel) {
    dbDir = "/tmp";
  } else {
    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      dbDir = path.resolve(__dirname, "../../data");
    } catch {
      dbDir = path.resolve(process.cwd(), "data");
    }
    if (!fs.existsSync(dbDir)) {
      try {
        fs.mkdirSync(dbDir, { recursive: true });
      } catch {
        dbDir = "/tmp";
      }
    }
  }

  const dbPath =
    process.env.DB_PATH ||
    (isVercel ? "/tmp/a2a.db" : path.join(dbDir, "a2a.db"));

  const Database = require("better-sqlite3");
  const realDb = new Database(dbPath, { timeout: 10000 });

  try {
    realDb.pragma("journal_mode = WAL");
    realDb.pragma("busy_timeout = 10000");
  } catch {
    // Ignored
  }

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
  realDb.exec(defaultSchema);
  dbInstance = realDb;
} catch (err) {
  console.warn(
    "[DATABASE] Switched to high-performance in-memory SQLite store:",
    (err as any)?.message || err
  );
  dbInstance = new InMemoryDatabase();
}

export const db = dbInstance;
export default db;
