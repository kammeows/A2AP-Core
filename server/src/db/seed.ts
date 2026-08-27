import { db, saveDefaultAgentCards, saveBuyerInventory, defaultBuyerInventory } from "../inventory/inventoryStore.js";
import { defaultBuyerPolicy } from "../orchestrator/orchestrator.js";

export { defaultBuyerPolicy, defaultBuyerInventory };
export const defaultInventory = {
  item: "tomato",
  stock_kg: 500,
  base_price_per_kg: 32,
  discount_tiers: [
    { min_quantity_kg: 30, discount_pct: 10 },
    { min_quantity_kg: 75, discount_pct: 18 },
  ],
};

export function seedDatabase() {
  saveDefaultAgentCards();
  saveBuyerInventory(defaultBuyerInventory);

  const insertPolicy = db.prepare(`
    INSERT INTO policy_configs (agent_id, config)
    VALUES (?, ?)
    ON CONFLICT(agent_id) DO UPDATE SET config = excluded.config
  `);
  insertPolicy.run(defaultBuyerPolicy.agent_id, JSON.stringify(defaultBuyerPolicy));

  console.log("Database seeded successfully with Agent Cards, Buyer Inventory & Policy Configs.");
}

seedDatabase();
