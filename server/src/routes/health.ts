import { Router } from "express";
import { getPolicyConfig } from "../orchestrator/orchestrator.js";
import { InventoryStore } from "../inventory/inventoryStore.js";
import { defaultBuyerPolicy, seedDatabase } from "../db/seed.js";
import { ThreadStore, db } from "../thread/threadStore.js";

const router = Router();
const BUYER_ID = "agent:buyer:razorslice";

// Health check
router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "RazorSlice A2A Bounded Procurement Agent",
    buyer: BUYER_ID,
    known_sellers: InventoryStore.getAgentCards().map((s) => s.agent_id),
    policy_engine: "system:policy_engine",
  });
});

// Policy config GET / PUT
router.get("/policy", (_req, res) => {
  try {
    const config = getPolicyConfig(BUYER_ID) || defaultBuyerPolicy;
    const weekSpent = ThreadStore.getConfirmedSpendingForAgent(BUYER_ID);
    res.json({
      success: true,
      config,
      week_spent_so_far: weekSpent,
      remaining_weekly_budget: Math.max(0, config.weekly_budget_cap - weekSpent),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put("/policy", (req, res) => {
  try {
    const updated = req.body || {};
    const agentId = updated.agent_id || BUYER_ID;
    const current = getPolicyConfig(agentId) || defaultBuyerPolicy;
    const merged = {
      ...defaultBuyerPolicy,
      ...current,
      ...updated,
      agent_id: agentId,
      per_unit_price_ceiling: {
        ...(defaultBuyerPolicy.per_unit_price_ceiling || {}),
        ...(current.per_unit_price_ceiling || {}),
        ...(updated.per_unit_price_ceiling || {}),
      },
      seller_allowlist: Array.isArray(updated.seller_allowlist)
        ? updated.seller_allowlist
        : (current.seller_allowlist || defaultBuyerPolicy.seller_allowlist),
    };
    const stmt = db.prepare(`
      INSERT INTO policy_configs (agent_id, config)
      VALUES (?, ?)
      ON CONFLICT(agent_id) DO UPDATE SET config = excluded.config
    `);
    stmt.run(agentId, JSON.stringify(merged));
    res.json({ success: true, config: merged });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Agent Cards GET
router.get("/sellers", (_req, res) => {
  try {
    const sellers = InventoryStore.getAgentCards();
    res.json({ success: true, sellers });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Inventory GET / PUT
router.get("/inventory", (_req, res) => {
  try {
    const sellers = InventoryStore.getAgentCards();
    const buyerInventory = InventoryStore.getBuyerInventory();
    res.json({
      success: true,
      sellers,
      buyer_inventory: buyerInventory,
      item: {
        item: "tomato",
        stock_kg: 500,
        base_price_per_kg: 32,
        discount_tiers: [
          { min_quantity_kg: 30, discount_pct: 10 },
          { min_quantity_kg: 75, discount_pct: 18 },
        ],
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reset database to initial seed
router.post("/reset", (_req, res) => {
  try {
    ThreadStore.clearAll();
    seedDatabase();
    res.json({ success: true, message: "System state reset to initial seed values." });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
