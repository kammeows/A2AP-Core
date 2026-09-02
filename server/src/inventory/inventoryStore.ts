import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AgentCard, InventoryItem } from "../types/domain.js";
import { SellerItemState, DiscountTier, computeSellerOffer } from "../agents/pricingEngine.js";
import { normalizeIngredientKey } from "../agents/negotiationPolicy.js";

// Hard Floor Prices for Seller Agents (Never breached under any negotiation concession)
export const sellerFloorPrices: Record<string, Record<string, number>> = {
  "agent:seller:razor_pies": {
    cheese: 3.2,
    flour: 5.8,
    milk: 7.2,
  },
  "agent:seller:razorcery_1": {
    flour: 4.8,
    tomatoes: 3.0,
    onions: 3.2,
  },
  "agent:seller:razorcery_2": {
    milk: 7.5,
    tomatoes: 2.4,
    onions: 4.0,
  },
  "agent:seller:veggie_vendor_09": {
    tomato: 24.0,
    tomatoes: 24.0,
  },
};

// Default Known Sellers (Agent Cards) in the A2A network
export const defaultAgentCards: AgentCard[] = [
  {
    agent_id: "agent:seller:razor_pies",
    name: "RazorPies Wholesale",
    stocked_items: ["cheese", "flour", "milk"],
    catalog: {
      cheese: { base_price: 4, stock: 15, unit: "units" },
      flour: { base_price: 8, stock: 25, unit: "units" },
      milk: { base_price: 9, stock: 10, unit: "units" },
    },
    discount_tiers: {
      cheese: [
        { min_quantity: 5, discount_pct: 10 },
        { min_quantity: 10, discount_pct: 20 },
      ],
      flour: [
        { min_quantity: 10, discount_pct: 10 },
        { min_quantity: 20, discount_pct: 27.5 },
      ],
      milk: [
        { min_quantity: 3, discount_pct: 10 },
        { min_quantity: 6, discount_pct: 20 },
      ],
    },
    negotiable: true,
    description: "Specializes in artisan dairy, cheese wheels, and specialty pizza flours.",
  },
  {
    agent_id: "agent:seller:razorcery_1",
    name: "Razorcery Fresh #1",
    stocked_items: ["flour", "tomatoes", "onions"],
    catalog: {
      flour: { base_price: 6, stock: 35, unit: "units" },
      tomatoes: { base_price: 4, stock: 15, unit: "units" },
      onions: { base_price: 4, stock: 15, unit: "units" },
    },
    discount_tiers: {
      flour: [
        { min_quantity: 5, discount_pct: 10 },
        { min_quantity: 12, discount_pct: 20 },
      ],
      tomatoes: [
        { min_quantity: 4, discount_pct: 10 },
        { min_quantity: 8, discount_pct: 20 },
      ],
      onions: [
        { min_quantity: 3, discount_pct: 10 },
        { min_quantity: 6, discount_pct: 20 },
      ],
    },
    negotiable: true,
    description: "Wholesale grain and farm-fresh vine vegetables vendor.",
  },
  {
    agent_id: "agent:seller:razorcery_2",
    name: "Razorcery Dairy & Veg #2",
    stocked_items: ["milk", "tomatoes", "onions"],
    catalog: {
      milk: { base_price: 10, stock: 15, unit: "units" },
      tomatoes: { base_price: 3, stock: 15, unit: "units" },
      onions: { base_price: 5, stock: 15, unit: "units" },
    },
    discount_tiers: {
      milk: [
        { min_quantity: 5, discount_pct: 15 },
        { min_quantity: 10, discount_pct: 25 },
      ],
      tomatoes: [
        { min_quantity: 4, discount_pct: 10 },
        { min_quantity: 8, discount_pct: 20 },
      ],
      onions: [
        { min_quantity: 3, discount_pct: 10 },
        { min_quantity: 6, discount_pct: 20 },
      ],
    },
    negotiable: true,
    description: "Direct-to-kitchen organic dairy distributor and produce vendor.",
  },
  {
    agent_id: "agent:seller:veggie_vendor_09",
    name: "Veggie Vendor 09",
    stocked_items: ["tomato", "tomatoes"],
    catalog: {
      tomato: { base_price: 32, stock: 500, unit: "kg" },
      tomatoes: { base_price: 32, stock: 500, unit: "kg" },
    },
    discount_tiers: {
      tomato: [
        { min_quantity: 30, discount_pct: 10 },
        { min_quantity: 75, discount_pct: 18 },
      ],
      tomatoes: [
        { min_quantity: 30, discount_pct: 10 },
        { min_quantity: 75, discount_pct: 18 },
      ],
    },
    negotiable: true,
    description: "Wholesale bulk produce vendor.",
  },
];

// Default Buyer Inventory for RazorSlice (Par stock: Flour: 30, others: 5)
export const defaultBuyerInventory = {
  restaurant_id: "agent:buyer:razorslice",
  inventory: {
    cheese: 5,
    flour: 30,
    tomatoes: 6,
    onions: 5,
    milk: 7,
  },
  par_stock: {
    cheese: 5,
    flour: 30,
    tomatoes: 5,
    onions: 5,
    milk: 5,
  },
  target_stock: 30,
};

export const defaultInventory = {
  item: "tomato",
  stock_kg: 500,
  base_price_per_kg: 32,
  discount_tiers: [
    { min_quantity_kg: 30, discount_pct: 10 },
    { min_quantity_kg: 75, discount_pct: 18 },
  ],
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
 * Save a single agent card
 */
export function saveAgentCard(card: AgentCard): void {
  const stmt = db.prepare(`
    INSERT INTO agent_cards (agent_id, data)
    VALUES (?, ?)
    ON CONFLICT(agent_id) DO UPDATE SET data = excluded.data
  `);
  stmt.run(card.agent_id, JSON.stringify(card));
}

/**
 * Normalizes any seller ID, name, or channel key to canonical agent_id.
 */
export function normalizeSellerId(sellerId: string): string {
  const s = (sellerId || "").toLowerCase().trim();
  if (s.includes("pies") || s.includes("razor_pies")) return "agent:seller:razor_pies";
  if (
    s.includes("razorcery_1") ||
    s.includes("razorcery-1") ||
    s.includes("razorcery 1") ||
    s.includes("fresh") ||
    s.includes("razorcery1")
  ) {
    return "agent:seller:razorcery_1";
  }
  if (
    s.includes("razorcery_2") ||
    s.includes("razorcery-2") ||
    s.includes("razorcery 2") ||
    s.includes("dairy") ||
    s.includes("razorcery2")
  ) {
    return "agent:seller:razorcery_2";
  }
  if (s.includes("veggie") || s.includes("vendor_09") || s.includes("vendor")) {
    return "agent:seller:veggie_vendor_09";
  }
  return s;
}

/**
 * Get a specific seller's Agent Card
 */
export function getSellerCard(sellerId: string): AgentCard | null {
  const cards = getAgentCards();
  const normalizedId = normalizeSellerId(sellerId);
  const cleanId = sellerId.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    cards.find((c) => {
      const cNorm = normalizeSellerId(c.agent_id);
      const cClean = c.agent_id.toLowerCase().replace(/[^a-z0-9]/g, "");
      return (
        cNorm === normalizedId ||
        cClean === cleanId ||
        c.agent_id.toLowerCase() === sellerId.toLowerCase() ||
        c.name.toLowerCase() === sellerId.toLowerCase()
      );
    }) || null
  );
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
 * Synchronizes in-memory / UI seller inventories to SQLite agent_cards table.
 */
export function syncSellerInventories(
  inventories: Record<string, Record<string, number>>
): void {
  const cards = getAgentCards();
  for (const [sellerId, items] of Object.entries(inventories)) {
    const normId = normalizeSellerId(sellerId);
    const cleanId = sellerId.toLowerCase().replace(/[^a-z0-9]/g, "");
    const card = cards.find((c) => {
      const cNorm = normalizeSellerId(c.agent_id);
      const cClean = c.agent_id.toLowerCase().replace(/[^a-z0-9]/g, "");
      return (
        cNorm === normId ||
        cClean === cleanId ||
        c.agent_id.toLowerCase() === sellerId.toLowerCase() ||
        c.name.toLowerCase() === sellerId.toLowerCase()
      );
    });
    if (card) {
      for (const [itemName, stock] of Object.entries(items)) {
        const norm = normalizeIngredientKey(itemName);
        const catKey = Object.keys(card.catalog).find(
          (k) => k.toLowerCase() === itemName.toLowerCase() || normalizeIngredientKey(k) === norm
        );
        if (catKey && card.catalog[catKey]) {
          card.catalog[catKey].stock = Math.max(0, Number(stock));
        }
      }
      saveAgentCard(card);
    }
  }
}

/**
 * Updates stock levels upon successful order confirmation:
 * Increases Buyer's stock, decreases Seller's stock.
 */
export function updateStockAfterOrder(
  purchasedItems: Array<{ seller_id: string; item: string; quantity: number }>
): {
  buyerInventory: typeof defaultBuyerInventory;
  updatedAgentCards: AgentCard[];
} {
  const buyerInv = getBuyerInventory();
  const allCards = getAgentCards();

  for (const p of purchasedItems) {
    const normItem = normalizeIngredientKey(p.item);
    // 1. Increase Buyer Stock
    const buyerKey = (Object.keys(buyerInv.inventory).find(
      (k) => k.toLowerCase() === p.item.toLowerCase() || normalizeIngredientKey(k) === normItem
    ) || "flour") as keyof typeof buyerInv.inventory;

    if (buyerKey && buyerInv.inventory[buyerKey] !== undefined) {
      buyerInv.inventory[buyerKey] += p.quantity;
    }

    // 2. Decrease Seller Stock
    const normSeller = normalizeSellerId(p.seller_id);
    const cleanSeller = p.seller_id.toLowerCase().replace(/[^a-z0-9]/g, "");
    const seller = allCards.find((c) => {
      const cNorm = normalizeSellerId(c.agent_id);
      const cClean = c.agent_id.toLowerCase().replace(/[^a-z0-9]/g, "");
      return (
        cNorm === normSeller ||
        cClean === cleanSeller ||
        c.agent_id.toLowerCase() === p.seller_id.toLowerCase() ||
        c.name.toLowerCase() === p.seller_id.toLowerCase()
      );
    });
    if (seller) {
      const catKey = Object.keys(seller.catalog).find(
        (k) => k.toLowerCase() === p.item.toLowerCase() || normalizeIngredientKey(k) === normItem
      );
      if (catKey && seller.catalog[catKey]) {
        seller.catalog[catKey].stock = Math.max(0, seller.catalog[catKey].stock - p.quantity);
        saveAgentCard(seller);
      }
    }
  }

  saveBuyerInventory(buyerInv);
  return { buyerInventory: buyerInv, updatedAgentCards: allCards };
}

/**
 * Builds a deterministic SellerItemState for pricing calculations.
 */
export function getSellerItemState(sellerId: string, itemName: string): SellerItemState | null {
  let seller = getSellerCard(sellerId);
  const normalizedItem = normalizeIngredientKey(itemName);

  if (normalizedItem === "tomato" && (!seller || !seller.catalog["tomato"])) {
    const veggieSeller = getSellerCard("agent:seller:veggie_vendor_09");
    if (veggieSeller) seller = veggieSeller;
  }

  if (!seller) return null;

  const catalogKey =
    Object.keys(seller.catalog).find(
      (k) => k.toLowerCase() === itemName.toLowerCase() || normalizeIngredientKey(k) === normalizedItem
    ) || itemName;

  const catalogEntry = seller.catalog[catalogKey] || { base_price: 5, stock: 0 };
  const tierKey = seller.discount_tiers
    ? Object.keys(seller.discount_tiers).find(
        (k) => normalizeIngredientKey(k) === normalizedItem || k.toLowerCase() === itemName.toLowerCase()
      )
    : undefined;
  const rawTiers = (tierKey && seller.discount_tiers?.[tierKey]) ? seller.discount_tiers[tierKey] : [];
  const tiers: DiscountTier[] = rawTiers.map((t) => ({
    minQty: t.min_quantity,
    discountPct: t.discount_pct,
  }));

  const parLevel = (catalogEntry as any).par_level ?? Math.max(10, Math.round(catalogEntry.stock * 0.8));
  const overstockThresholdPct = 0.7;
  const pairedItem = (catalogEntry as any).paired_item ?? (seller.agent_id === "agent:seller:razor_pies" && normalizedItem === "cheese" ? "milk" : undefined);

  return {
    item: catalogKey,
    stock: catalogEntry.stock,
    basePrice: catalogEntry.base_price,
    tiers,
    parLevel,
    overstockThresholdPct,
    pairedItem,
  };
}

/**
 * Computes dynamic wholesale pricing & volume discounts for a specific seller and item.
 * Uses deterministic computeSellerOffer with strict stock clamping.
 */
export function computeSellerDiscount(
  sellerId: string,
  itemName: string,
  quantityUnits: number,
  targetPricePerUnit?: number
): {
  sellerId: string;
  item: string;
  discountPct: number;
  reason: string;
  basePricePerUnit: number;
  finalPricePerUnit: number;
  totalPrice: number;
  availableStockUnits: number;
  floorPrice: number;
  stockLimited: boolean;
  offeredQty: number;
} {
  const state = getSellerItemState(sellerId, itemName);

  if (!state) {
    return {
      sellerId,
      item: itemName,
      discountPct: 0,
      reason: "seller_not_found",
      basePricePerUnit: 10,
      finalPricePerUnit: 10,
      totalPrice: 10 * quantityUnits,
      availableStockUnits: 0,
      floorPrice: 7.5,
      stockLimited: true,
      offeredQty: 0,
    };
  }

  const offer = computeSellerOffer(state, quantityUnits);
  const sellerFloors = sellerFloorPrices[sellerId] || {};
  const floorKey = Object.keys(sellerFloors).find(
    (k) => k.toLowerCase() === offer.item.toLowerCase() || k.toLowerCase().replace(/s$/, "") === offer.item.toLowerCase().replace(/s$/, "")
  );
  const floorPrice = floorKey ? sellerFloors[floorKey] : Number((state.basePrice * 0.7).toFixed(2));

  return {
    sellerId,
    item: offer.item,
    discountPct: offer.discountPct,
    reason: offer.reason,
    basePricePerUnit: state.basePrice,
    finalPricePerUnit: offer.unitPrice,
    totalPrice: offer.totalPrice,
    availableStockUnits: state.stock,
    floorPrice,
    stockLimited: offer.stockLimited,
    offeredQty: offer.offeredQty,
  };
}

/**
 * Saves a single inventory item to SQLite database
 */
export function saveItem(item: InventoryItem | typeof defaultInventory): void {
  const stmt = db.prepare(`
    INSERT INTO inventory (item, data)
    VALUES (?, ?)
    ON CONFLICT(item) DO UPDATE SET data = excluded.data
  `);
  stmt.run(item.item, JSON.stringify(item));
}

/**
 * Retrieves inventory item from SQLite database (with default fallback)
 */
export function getItem(item: string): InventoryItem | null {
  try {
    const row = db.prepare(`SELECT data FROM inventory WHERE item = ?`).get(item) as { data: string } | undefined;
    if (row) {
      return JSON.parse(row.data);
    }
  } catch {
    // fallback
  }
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

/**
 * Computes discount for legacy single-item test suite
 */
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
  const item = getItem(itemName) || {
    item: itemName,
    stock_kg: 500,
    base_price_per_kg: 32,
    discount_tiers: [
      { min_quantity_kg: 30, discount_pct: 10 },
      { min_quantity_kg: 75, discount_pct: 18 },
    ],
  };

  const basePrice = item.base_price_per_kg;
  let discountPct = 0;
  let reason = "standard_pricing";

  const sortedTiers = [...item.discount_tiers].sort((a, b) => b.min_quantity_kg - a.min_quantity_kg);
  for (const tier of sortedTiers) {
    if (quantityKg >= tier.min_quantity_kg) {
      discountPct = tier.discount_pct;
      reason = tier.min_quantity_kg >= 75 ? "bulk_volume_tier" : "volume_tier";
      break;
    }
  }

  // Dynamic clearance discount: if order takes >= 15% of available stock and no tiers
  if (discountPct === 0 && item.stock_kg > 0 && quantityKg >= item.stock_kg * 0.15) {
    discountPct = 5;
    reason = "excess_stock_clearance";
  }

  const finalPricePerKg = Number((basePrice * (1 - discountPct / 100)).toFixed(2));
  const totalPrice = Number((finalPricePerKg * quantityKg).toFixed(2));

  return {
    discountPct,
    reason,
    basePricePerKg: basePrice,
    finalPricePerKg,
    totalPrice,
    availableStockKg: item.stock_kg,
  };
}

export class InventoryStore {
  static normalizeSellerId = normalizeSellerId;
  static getAgentCards = getAgentCards;
  static getSellerCard = getSellerCard;
  static saveAgentCard = saveAgentCard;
  static saveDefaultAgentCards = saveDefaultAgentCards;
  static syncSellerInventories = syncSellerInventories;
  static getBuyerInventory = getBuyerInventory;
  static saveBuyerInventory = saveBuyerInventory;
  static updateStockAfterOrder = updateStockAfterOrder;
  static getSellerItemState = getSellerItemState;
  static computeSellerDiscount = computeSellerDiscount;
  static saveItem = saveItem;
  static getItem = getItem;
  static computeDiscount = computeDiscount;
  static sellerFloorPrices = sellerFloorPrices;
}

export default InventoryStore;
