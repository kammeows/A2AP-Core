import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AgentCard, InventoryItem } from "../types/domain.js";

// Default Known Sellers (Agent Cards) in the A2A network
export const defaultAgentCards: AgentCard[] = [
  {
    agent_id: "agent:seller:razor_pies",
    name: "RazorPies Wholesale",
    stocked_items: ["cheese", "flour", "milk"],
    catalog: {
      cheese: { base_price: 4, stock: 10, unit: "units" },
      flour: { base_price: 8, stock: 6, unit: "units" },
      milk: { base_price: 9, stock: 4, unit: "units" },
    },
    discount_tiers: {
      cheese: [{ min_quantity: 5, discount_pct: 10 }],
      flour: [{ min_quantity: 4, discount_pct: 10 }],
      milk: [{ min_quantity: 3, discount_pct: 10 }],
    },
    negotiable: true,
    description: "Specializes in artisan dairy, cheese wheels, and specialty pizza flours.",
  },
  {
    agent_id: "agent:seller:razorcery_1",
    name: "Razorcery Fresh #1",
    stocked_items: ["flour", "tomatoes", "onions"],
    catalog: {
      flour: { base_price: 6, stock: 10, unit: "units" },
      tomatoes: { base_price: 4, stock: 6, unit: "units" },
      onions: { base_price: 4, stock: 4, unit: "units" },
    },
    discount_tiers: {
      flour: [{ min_quantity: 5, discount_pct: 10 }],
      tomatoes: [{ min_quantity: 4, discount_pct: 10 }],
      onions: [{ min_quantity: 3, discount_pct: 10 }],
    },
    negotiable: true,
    description: "Wholesale grain and farm-fresh vine vegetables vendor.",
  },
  {
    agent_id: "agent:seller:razorcery_2",
    name: "Razorcery Dairy & Veg #2",
    stocked_items: ["milk", "tomatoes", "onions"],
    catalog: {
      milk: { base_price: 10, stock: 10, unit: "units" },
      tomatoes: { base_price: 3, stock: 6, unit: "units" },
      onions: { base_price: 5, stock: 4, unit: "units" },
    },
    discount_tiers: {
      milk: [{ min_quantity: 5, discount_pct: 15 }],
      tomatoes: [{ min_quantity: 4, discount_pct: 10 }],
      onions: [{ min_quantity: 3, discount_pct: 10 }],
    },
    negotiable: true,
    description: "Direct-to-kitchen organic dairy distributor and produce vendor.",
  },
];

// Default Buyer Inventory for RazorSlice
export const defaultBuyerInventory = {
  restaurant_id: "agent:buyer:razorslice",
  inventory: {
    cheese: 3,
    flour: 5,
    tomatoes: 6,
    onions: 5,
    milk: 7,
  },
  target_stock: 15,
};

// Database Connection
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

// Schema setup
db.exec(`
  CREATE TABLE IF NOT EXISTS agent_cards (
    agent_id TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS buyer_inventory (
    agent_id TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS inventory (
    item TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );
`);

/**
 * Retrieves all known seller Agent Cards.
 */
export function getAgentCards(): AgentCard[] {
  try {
    const rows = db.prepare(`SELECT data FROM agent_cards`).all() as Array<{ data: string }>;
    if (rows && rows.length > 0) {
      return rows.map((r) => JSON.parse(r.data) as AgentCard);
    }
    // Seed default cards if table empty
    saveDefaultAgentCards();
    return defaultAgentCards;
  } catch {
    return defaultAgentCards;
  }
}

/**
 * Save default agent cards
 */
export function saveDefaultAgentCards(): void {
  const stmt = db.prepare(`
    INSERT INTO agent_cards (agent_id, data)
    VALUES (?, ?)
    ON CONFLICT(agent_id) DO UPDATE SET data = excluded.data
  `);
  for (const card of defaultAgentCards) {
    stmt.run(card.agent_id, JSON.stringify(card));
  }
}

/**
 * Get a specific seller's Agent Card
 */
export function getSellerCard(sellerId: string): AgentCard | null {
  const cards = getAgentCards();
  const normalizedId = sellerId.toLowerCase().replace(/[^a-z0-9_:]/g, "");
  return cards.find((c) => c.agent_id.toLowerCase().replace(/[^a-z0-9_:]/g, "") === normalizedId) || null;
}

/**
 * Get Buyer Inventory
 */
export function getBuyerInventory(): typeof defaultBuyerInventory {
  try {
    const row = db.prepare(`SELECT data FROM buyer_inventory WHERE agent_id = ?`).get("agent:buyer:razorslice") as
      | { data: string }
      | undefined;
    if (row) {
      return JSON.parse(row.data);
    }
    saveBuyerInventory(defaultBuyerInventory);
    return defaultBuyerInventory;
  } catch {
    return defaultBuyerInventory;
  }
}

/**
 * Save Buyer Inventory
 */
export function saveBuyerInventory(data: typeof defaultBuyerInventory): void {
  const stmt = db.prepare(`
    INSERT INTO buyer_inventory (agent_id, data)
    VALUES (?, ?)
    ON CONFLICT(agent_id) DO UPDATE SET data = excluded.data
  `);
  stmt.run(data.restaurant_id, JSON.stringify(data));
}

/**
 * Computes dynamic wholesale pricing & volume discounts for a specific seller and item.
 */
export function computeSellerDiscount(
  sellerId: string,
  itemName: string,
  quantityUnits: number
): {
  sellerId: string;
  item: string;
  discountPct: number;
  reason: string;
  basePricePerUnit: number;
  finalPricePerUnit: number;
  totalPrice: number;
  availableStockUnits: number;
} {
  const normalizedItem = itemName.toLowerCase().trim().replace(/s$/, ""); // e.g. "tomatoes" -> "tomato"
  const seller = getSellerCard(sellerId);

  if (!seller) {
    return {
      sellerId,
      item: itemName,
      discountPct: 0,
      reason: "seller_not_found",
      basePricePerUnit: 10,
      finalPricePerUnit: 10,
      totalPrice: 10 * quantityUnits,
      availableStockUnits: 0,
    };
  }

  // Find item in catalog (exact or singular/plural)
  const catalogKey =
    Object.keys(seller.catalog).find(
      (k) => k.toLowerCase() === itemName.toLowerCase() || k.toLowerCase().replace(/s$/, "") === normalizedItem
    ) || itemName;

  const catalogEntry = seller.catalog[catalogKey] || { base_price: 5, stock: 0 };
  const basePrice = catalogEntry.base_price;
  const availableStock = catalogEntry.stock;

  let discountPct = 0;
  let reason = "standard_catalog_rate";

  // Check volume discount tiers
  const itemTiers = seller.discount_tiers?.[catalogKey] || [];
  if (itemTiers.length > 0) {
    const sortedTiers = [...itemTiers].sort((a, b) => b.min_quantity - a.min_quantity);
    for (const tier of sortedTiers) {
      if (quantityUnits >= tier.min_quantity) {
        discountPct = tier.discount_pct;
        reason = `volume_tier_gte_${tier.min_quantity}_units`;
        break;
      }
    }
  }

  // Dynamic clearance discount: if order takes >= 50% of available stock
  if (discountPct === 0 && availableStock > 0 && quantityUnits >= availableStock * 0.5) {
    discountPct = 5;
    reason = "excess_stock_clearance";
  }

  const finalPricePerUnit = Number((basePrice * (1 - discountPct / 100)).toFixed(2));
  const totalPrice = Number((finalPricePerUnit * quantityUnits).toFixed(2));

  return {
    sellerId: seller.agent_id,
    item: catalogKey,
    discountPct,
    reason,
    basePricePerUnit: basePrice,
    finalPricePerUnit,
    totalPrice,
    availableStockUnits: availableStock,
  };
}

/**
 * Backward compatibility for legacy single-item getItem / computeDiscount
 */
export function getItem(item: string): InventoryItem | null {
  return {
    item,
    stock_kg: 500,
    base_price_per_kg: 32,
    discount_tiers: [
      { min_quantity_kg: 30, discount_pct: 10 },
      { min_quantity_kg: 75, discount_pct: 18 },
    ],
  };
}

export function computeDiscount(
  itemName: string,
  quantityKg: number
): {
  discountPct: number;
  reason: string;
  basePricePerKg: number;
  finalPricePerKg: number;
  totalPrice: number;
  availableStockKg: number;
} {
  const basePrice = 32;
  let discountPct = 0;
  let reason = "standard_pricing";

  if (quantityKg >= 75) {
    discountPct = 18;
    reason = "bulk_volume_tier";
  } else if (quantityKg >= 30) {
    discountPct = 10;
    reason = "volume_tier";
  }

  const finalPricePerKg = Number((basePrice * (1 - discountPct / 100)).toFixed(2));
  const totalPrice = Number((finalPricePerKg * quantityKg).toFixed(2));

  return {
    discountPct,
    reason,
    basePricePerKg: basePrice,
    finalPricePerKg,
    totalPrice,
    availableStockKg: 500,
  };
}

export class InventoryStore {
  static getAgentCards = getAgentCards;
  static getSellerCard = getSellerCard;
  static getBuyerInventory = getBuyerInventory;
  static saveBuyerInventory = saveBuyerInventory;
  static computeSellerDiscount = computeSellerDiscount;
  static getItem = getItem;
  static computeDiscount = computeDiscount;
}

export default InventoryStore;
