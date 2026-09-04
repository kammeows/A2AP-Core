import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Play,
  Pause,
  Plus,
  Minus,
  CheckCircle2,
  TrendingDown,
  ChefHat,
  ShoppingBag,
  RotateCcw,
  ArrowRight,
  Clock,
  AlertCircle,
  PackageCheck,
  Send,
  CreditCard,
  Utensils,
  Layers,
  ArrowLeftRight,
  ExternalLink,
  Award,
} from "lucide-react";
import { Envelope, NegotiationResult, SimulationMode } from "../types";

export interface RazorSliceArchitectureProps {
  onRunAi: (
    scenario?: "happy" | "failure" | "custom",
    customOptions?: any,
  ) => Promise<NegotiationResult | null> | void;
  isRunning: boolean;
  delegationMode: "full" | "partial";
  latestResult: NegotiationResult | null;
  messages?: Envelope[];
  onSelectMessage?: (messageId: string) => void;
  simulatePaymentFail?: boolean;
  simulationMode?: SimulationMode;
  setSimulationMode?: (mode: SimulationMode) => void;
}

export interface BuyerPantry {
  cheese: number;
  flour: number;
  tomatoes: number;
  onions: number;
  milk: number;
  targetStock: number;
}

export interface SellerInventory {
  [item: string]: { stock: number; price: number };
}

export interface CustomerOrder {
  id: number;
  name: string;
  recipe: Partial<BuyerPantry>;
  price: string;
  status: "queued" | "checking" | "procuring" | "baking" | "served";
}

export interface KitchenLogEntry {
  id: string;
  time: string;
  orderId?: number;
  type:
    | "inventory_event"
    | "order_taken"
    | "par_trigger"
    | "a2a_procure"
    | "restocked"
    | "order_served"
    | "error"
    | "info";
  title: string;
  detail: string;
}

// Par stock bare minimums (reorder points)
export const PAR_STOCK_LEVELS: Record<
  keyof Omit<BuyerPantry, "targetStock">,
  number
> = {
  flour: 30,
  cheese: 5,
  tomatoes: 5,
  onions: 5,
  milk: 5,
};

// Target stock sized to absorb several typical order cycles (reorder_point + consumption * buffer_cycles)
export const TARGET_STOCK_LEVELS: Record<
  keyof Omit<BuyerPantry, "targetStock">,
  number
> = {
  flour: 40, // 30 + (5 × 2) = 40u
  cheese: 8, // 5 + (1.5 × 2) = 8u
  tomatoes: 8, // 5 + (1.5 × 2) = 8u
  onions: 8, // 5 + (1.5 × 2) = 8u
  milk: 9, // 5 + (2 × 2) = 9u
};

// Safety floor levels below which waiting is prohibited and immediate restock is enforced
export const SAFETY_FLOOR_LEVELS: Record<
  keyof Omit<BuyerPantry, "targetStock">,
  number
> = {
  flour: 10,
  cheese: 2,
  tomatoes: 2,
  onions: 2,
  milk: 2,
};

// Customer Orders with updated 5-Flour pizza recipes (simulation-2.md requirement 1)
const DEFAULT_ORDERS: CustomerOrder[] = [
  {
    id: 1,
    name: "Margherita Pizza",
    recipe: { flour: 5, cheese: 2, tomatoes: 1 },
    price: "₹299",
    status: "queued",
  },
  {
    id: 2,
    name: "Farm Fresh Pizza",
    recipe: { flour: 5, cheese: 1, tomatoes: 1, onions: 2 },
    price: "₹349",
    status: "queued",
  },
  {
    id: 3,
    name: "Margherita Pizza + Milk Shake",
    recipe: { flour: 5, cheese: 2, tomatoes: 1, milk: 2 },
    price: "₹399",
    status: "queued",
  },
  {
    id: 4,
    name: "Milk Shake",
    recipe: { milk: 2 },
    price: "₹120",
    status: "queued",
  },
];

export const RazorSliceArchitecture: React.FC<RazorSliceArchitectureProps> = ({
  onRunAi,
  isRunning,
  delegationMode,
  latestResult,
  messages = [],
  onSelectMessage,
  simulatePaymentFail = false,
  simulationMode = "happy",
  setSimulationMode,
}) => {
  // 1. RazorSlice Buyer Stock State (Target stock absorbs multiple order cycles)
  const [buyerStock, setBuyerStock] = useState<BuyerPantry>({
    cheese: 6,
    flour: 30,
    tomatoes: 6,
    onions: 6,
    milk: 7,
    targetStock: 40,
  });

  // 2. Seller 1: RazorPies (sells cheese, milk, flour)
  const [razorPies, setRazorPies] = useState<SellerInventory>({
    cheese: { stock: 15, price: 4 },
    flour: { stock: 25, price: 8 },
    milk: { stock: 10, price: 9 },
  });

  // 3. Seller 2: Razorcery-1 (sells flour, tomatoes, onions)
  const [razorcery1, setRazorcery1] = useState<SellerInventory>({
    flour: { stock: 35, price: 6 },
    tomatoes: { stock: 15, price: 4 },
    onions: { stock: 15, price: 4 },
  });

  // 4. Seller 3: Razorcery-2 (sells tomatoes, onions, milk)
  const [razorcery2, setRazorcery2] = useState<SellerInventory>({
    milk: { stock: 15, price: 10 },
    tomatoes: { stock: 15, price: 3 },
    onions: { stock: 15, price: 5 },
  });

  // Dynamic Customer Order Queue & Fulfillment States
  const [orderQueue, setOrderQueue] = useState<CustomerOrder[]>(DEFAULT_ORDERS);
  const [completedOrders, setCompletedOrders] = useState<CustomerOrder[]>([]);
  const [activeProcessingOrder, setActiveProcessingOrder] =
    useState<CustomerOrder | null>(null);
  const [isAutoSimulating, setIsAutoSimulating] = useState<boolean>(false);
  const nextOrderIdRef = useRef<number>(5);

  // Kitchen Order Agent Activity & Audit Log
  const [kitchenLogs, setKitchenLogs] = useState<KitchenLogEntry[]>([
    {
      id: "log_discovery",
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      type: "info",
      title: "Wholesale Price Sheets & Tiers Cached",
      detail:
        "Discovered 3 suppliers (RazorPies, Razorcery-1, Razorcery-2). Cached published volume tiers & base rates; live stock is verified dynamically per RFQ.",
    },
    {
      id: "log_init",
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      type: "info",
      title: "Kitchen Order Agent Ready",
      detail:
        "Deterministic min-max inventory runner active. Par levels: Flour=30, Cheese=5, Tomatoes=5, Onions=5, Milk=5.",
    },
  ]);

  const addLog = (
    type: KitchenLogEntry["type"],
    title: string,
    detail: string,
    orderId?: number,
  ) => {
    const newEntry: KitchenLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      type,
      title,
      detail,
      orderId,
    };
    setKitchenLogs((prev) => [newEntry, ...prev.slice(0, 49)]);
  };

  // Restock notification toast banner
  const [restockNotification, setRestockNotification] = useState<{
    text: string;
    items: Array<{ item: string; quantity: number; seller: string }>;
  } | null>(null);

  // Payment failure toast banner
  const [paymentErrorNotification, setPaymentErrorNotification] = useState<{
    text: string;
    detail?: string;
  } | null>(null);

  // When payment failure simulation is active, immediately clear any lingering "Payment Confirmed!" restock notification
  useEffect(() => {
    if (simulatePaymentFail) {
      setRestockNotification(null);
    }
  }, [simulatePaymentFail]);

  const lastProcessedThreadRef = useRef<string | null>(null);
  const processedTxKeysRef = useRef<Set<string>>(new Set<string>());
  const procurementInFlightRef = useRef<Set<string>>(new Set<string>());
  const simulationTickRef = useRef<number>(0);
  const inventoryEventsRef = useRef<
    Array<{ item: string; tick: number; quantityUsed: number }>
  >([]);
  const sellerInventoriesRef = useRef<Record<string, Record<string, number>>>({
    "agent:seller:razor_pies": { cheese: 15, flour: 25, milk: 10 },
    "agent:seller:razorcery_1": { flour: 35, tomatoes: 15, onions: 15 },
    "agent:seller:razorcery_2": { milk: 15, tomatoes: 15, onions: 15 },
  });

  const buyerStockRef = useRef<BuyerPantry>(buyerStock);
  const orderQueueRef = useRef<CustomerOrder[]>(orderQueue);
  const waitingForProcurementOrderRef = useRef<CustomerOrder | null>(null);
  const wasAutoSimulatingRef = useRef<boolean>(false);
  const isFulfillingOrderRef = useRef<boolean>(false);
  const [isFulfillingOrder, setIsFulfillingOrder] = useState<boolean>(false);

  useEffect(() => {
    buyerStockRef.current = buyerStock;
  }, [buyerStock]);

  useEffect(() => {
    orderQueueRef.current = orderQueue;
  }, [orderQueue]);

  const normalizeKey = (name: string): keyof BuyerPantry => {
    const s = (name || "").toLowerCase().trim();
    if (s.startsWith("flour")) return "flour";
    if (s.startsWith("cheese")) return "cheese";
    if (s.startsWith("milk")) return "milk";
    if (s.startsWith("tomat")) return "tomatoes";
    if (s.startsWith("onion")) return "onions";
    return s as keyof BuyerPantry;
  };

  // Helper to build real-time synced seller inventories object
  const getLiveSellerInventories = (): Record<
    string,
    Record<string, number>
  > => ({
    "agent:seller:razor_pies": {
      cheese: razorPies.cheese.stock,
      flour: razorPies.flour.stock,
      milk: razorPies.milk.stock,
    },
    "agent:seller:razorcery_1": {
      flour: razorcery1.flour.stock,
      tomatoes: razorcery1.tomatoes.stock,
      onions: razorcery1.onions.stock,
    },
    "agent:seller:razorcery_2": {
      milk: razorcery2.milk.stock,
      tomatoes: razorcery2.tomatoes.stock,
      onions: razorcery2.onions.stock,
    },
  });

  // Keep sellerInventoriesRef continuously synchronized with React state
  useEffect(() => {
    sellerInventoriesRef.current = getLiveSellerInventories();
  }, [razorPies, razorcery1, razorcery2]);

  // Helper to apply confirmed purchases to Buyer Pantry and decrement Seller Inventories in real-time
  const applyPurchasedItems = (
    purchasedList: Array<{ seller_id: string; item: string; quantity: number }>,
    txKey?: string,
  ) => {
    if (!purchasedList || purchasedList.length === 0) return;

    if (txKey) {
      if (processedTxKeysRef.current.has(txKey)) {
        return; // Idempotent guard: already processed this exact transaction
      }
      processedTxKeysRef.current.add(txKey);
      lastProcessedThreadRef.current = txKey;
    }

    const itemSummaryList: Array<{
      item: string;
      quantity: number;
      seller: string;
    }> = [];

    // 1. Increment Buyer Pantry Stock synchronously in ref and React state
    const nextBuyerStock = { ...buyerStockRef.current };
    for (const p of purchasedList) {
      const pantryKey = normalizeKey(p.item);
      if (pantryKey in nextBuyerStock && typeof nextBuyerStock[pantryKey] === "number") {
        nextBuyerStock[pantryKey] = (nextBuyerStock[pantryKey] as number) + p.quantity;
      }
    }
    buyerStockRef.current = nextBuyerStock;
    setBuyerStock(nextBuyerStock);

    // 2. Decrement Seller Stock in real-time (synchronously in ref and asynchronously in React state)
    for (const p of purchasedList) {
      const norm = normalizeKey(p.item);
      const sid = (p.seller_id || "").toLowerCase();

      let matchedSellerName = "Wholesale Grocery";
      const isPies = sid.includes("pies") || sid.includes("razor_pies");
      const isCery1 =
        sid.includes("razorcery_1") ||
        sid.includes("razorcery-1") ||
        sid.includes("razorcery 1") ||
        sid.includes("razorcery fresh") ||
        sid.includes("razorcery1");
      const isCery2 =
        sid.includes("razorcery_2") ||
        sid.includes("razorcery-2") ||
        sid.includes("razorcery 2") ||
        sid.includes("razorcery dairy") ||
        sid.includes("razorcery2");

      let sellerKey = "agent:seller:razor_pies";
      if (isCery1) {
        sellerKey = "agent:seller:razorcery_1";
        matchedSellerName = "Razorcery-1";
      } else if (isCery2) {
        sellerKey = "agent:seller:razorcery_2";
        matchedSellerName = "Razorcery-2";
      } else if (isPies) {
        sellerKey = "agent:seller:razor_pies";
        matchedSellerName = "RazorPies";
      }

      // Synchronously update ref
      if (sellerInventoriesRef.current[sellerKey]) {
        const itemKey = Object.keys(
          sellerInventoriesRef.current[sellerKey],
        ).find((k) => normalizeKey(k) === norm);
        if (itemKey) {
          sellerInventoriesRef.current[sellerKey][itemKey] = Math.max(
            0,
            sellerInventoriesRef.current[sellerKey][itemKey] - p.quantity,
          );
        }
      }

      if (isPies) {
        setRazorPies((prev) => {
          const k = Object.keys(prev).find((key) => normalizeKey(key) === norm);
          if (k && prev[k]) {
            return {
              ...prev,
              [k]: {
                ...prev[k],
                stock: Math.max(0, prev[k].stock - p.quantity),
              },
            };
          }
          return prev;
        });
      } else if (isCery1) {
        setRazorcery1((prev) => {
          const k = Object.keys(prev).find((key) => normalizeKey(key) === norm);
          if (k && prev[k]) {
            return {
              ...prev,
              [k]: {
                ...prev[k],
                stock: Math.max(0, prev[k].stock - p.quantity),
              },
            };
          }
          return prev;
        });
      } else if (isCery2) {
        setRazorcery2((prev) => {
          const k = Object.keys(prev).find((key) => normalizeKey(key) === norm);
          if (k && prev[k]) {
            return {
              ...prev,
              [k]: {
                ...prev[k],
                stock: Math.max(0, prev[k].stock - p.quantity),
              },
            };
          }
          return prev;
        });
      }

      itemSummaryList.push({
        item: p.item,
        quantity: p.quantity,
        seller: matchedSellerName,
      });
    }

    setPaymentErrorNotification(null);
    const bannerText = `Payment Confirmed! Restocked ${purchasedList.map((p) => `+${p.quantity} ${p.item}`).join(", ")}`;
    setRestockNotification({
      text: bannerText,
      items: itemSummaryList,
    });

    addLog(
      "restocked",
      `🚚 Kitchen Restocked Successfully`,
      `Received from sellers: ${purchasedList.map((p) => `+${p.quantity}u ${p.item}`).join(", ")}`,
    );
  };

  // Sync confirmed transactions from A2A Multi-Seller network
  useEffect(() => {
    if (
      latestResult &&
      (latestResult.status === "CONFIRMED" ||
        latestResult.status === "RENEGOTIATED_AND_CONFIRMED")
    ) {
      const eventKey = `${latestResult.thread_id || "direct"}_${latestResult.status}_${latestResult.order_id || ""}`;
      if (
        processedTxKeysRef.current.has(eventKey) ||
        lastProcessedThreadRef.current === eventKey
      ) {
        return;
      }
      lastProcessedThreadRef.current = eventKey;

      const purchasedList: Array<{
        seller_id: string;
        item: string;
        quantity: number;
      }> = [];

      if (
        latestResult.purchased_items &&
        latestResult.purchased_items.length > 0
      ) {
        for (const p of latestResult.purchased_items) {
          purchasedList.push({
            seller_id: p.seller_id,
            item: p.item,
            quantity: Number(p.quantity) || 1,
          });
        }
      } else if (latestResult.pending_offer) {
        purchasedList.push({
          seller_id:
            latestResult.pending_offer.seller_id || "agent:seller:razorcery_1",
          item: latestResult.pending_offer.item,
          quantity: Number(latestResult.pending_offer.quantity_kg) || 1,
        });
      }

      if (purchasedList.length > 0) {
        applyPurchasedItems(purchasedList, eventKey);

        // Only resume if this exact customer order was blocked and waiting for these ingredients!
        if (waitingForProcurementOrderRef.current) {
          const waitingOrder = waitingForProcurementOrderRef.current;
          waitingForProcurementOrderRef.current = null;

          addLog(
            "order_taken",
            `⚡ Resuming Order #${waitingOrder.id} (${waitingOrder.name})`,
            `Restocked ingredients delivered to kitchen! Completing preparation of this order...`,
            waitingOrder.id
          );

          setTimeout(() => {
            processNextOrder();
            if (wasAutoSimulatingRef.current) {
              setIsAutoSimulating(true);
              wasAutoSimulatingRef.current = false;
            }
          }, 800);
        } else if (wasAutoSimulatingRef.current) {
          // If auto-simulate was paused solely for background par replenishment
          setIsAutoSimulating(true);
          wasAutoSimulatingRef.current = false;
        }
      }
    } else if (latestResult && latestResult.status === "PAYMENT_FAILED") {
      // 1. Immediately clear any restock notification so it NEVER says "Payment Confirmed!"
      setRestockNotification(null);

      // 2. Display payment failure alert banner in kitchen simulation
      setPaymentErrorNotification({
        text: "❌ Razorpay Payment Failed: Transaction Declined by Gateway",
        detail:
          latestResult.message ||
          "Simulated payment processing error at gateway. Sourcing halted; kitchen inventory unchanged.",
      });

      // 3. Log the payment failure in the Kitchen Agent audit trail
      addLog(
        "error",
        "❌ Payment Settlement Failed (Razorpay Gateway Error)",
        latestResult.message ||
          "Transaction declined at Razorpay gateway. Kitchen inventory remains unchanged; order cannot be fulfilled.",
        waitingForProcurementOrderRef.current?.id,
      );

      // 4. If an order was blocked waiting for ingredients, abort and hold it
      if (waitingForProcurementOrderRef.current) {
        const waitingOrder = waitingForProcurementOrderRef.current;
        waitingForProcurementOrderRef.current = null;
        addLog(
          "par_trigger",
          `⛔ Order #${waitingOrder.id} (${waitingOrder.name}) Held: Payment Failed`,
          `Cannot prepare Order #${waitingOrder.id} because ingredient replenishment payment failed at Razorpay gateway. Kitchen inventory unchanged.`,
          waitingOrder.id,
        );
      }

      // 5. Ensure auto-simulation and active processing order are stopped
      setIsAutoSimulating(false);
      wasAutoSimulatingRef.current = false;
      setActiveProcessingOrder(null);
    }
  }, [latestResult]);

  // Total Session / Menu Requirements
  const allSessionOrders = [...completedOrders, ...orderQueue];
  const totalMenuRequirements = {
    flour: Math.max(
      15,
      allSessionOrders.reduce((sum, o) => sum + (o.recipe.flour || 0), 0),
    ),
    cheese: Math.max(
      5,
      allSessionOrders.reduce((sum, o) => sum + (o.recipe.cheese || 0), 0),
    ),
    tomatoes: Math.max(
      3,
      allSessionOrders.reduce((sum, o) => sum + (o.recipe.tomatoes || 0), 0),
    ),
    onions: Math.max(
      2,
      allSessionOrders.reduce((sum, o) => sum + (o.recipe.onions || 0), 0),
    ),
    milk: Math.max(
      4,
      allSessionOrders.reduce((sum, o) => sum + (o.recipe.milk || 0), 0),
    ),
  };

  // Helper to compute recent consumption rate over the event log (never guessed)
  const computeRecentConsumptionRate = (
    itemKey: string,
    lookbackTicks = 10,
  ): number => {
    const minTick = Math.max(0, simulationTickRef.current - lookbackTicks);
    const events = inventoryEventsRef.current.filter(
      (e) =>
        normalizeKey(e.item) === normalizeKey(itemKey) && e.tick >= minTick,
    );
    const totalUsed = events.reduce((sum, e) => sum + e.quantityUsed, 0);
    const activeTicks = Math.max(
      1,
      Math.min(
        lookbackTicks,
        simulationTickRef.current > 0 ? simulationTickRef.current : 1,
      ),
    );
    return (
      Number((totalUsed / activeTicks).toFixed(2)) ||
      (itemKey === "flour" ? 5.0 : 1.5)
    );
  };

  // Look-Ahead Decision Engine: Evaluates buy_minimal vs buy_to_tier vs wait deterministically
  const evaluateProcurementDecision = (
    itemKey: keyof Omit<BuyerPantry, "targetStock">,
    currentPantry: BuyerPantry,
  ): {
    action: "wait" | "buy_minimal" | "buy_to_tier";
    quantity: number;
    rationale: string;
  } => {
    const current = currentPantry[itemKey] ?? 0;
    const reorderPoint = PAR_STOCK_LEVELS[itemKey];
    const target = TARGET_STOCK_LEVELS[itemKey] ?? reorderPoint;
    const safetyFloor = SAFETY_FLOOR_LEVELS[itemKey] ?? 2;
    const rate = computeRecentConsumptionRate(itemKey);

    const safeWaitTicks = 3;
    const projectedStock = Math.max(
      0,
      Number((current - rate * safeWaitTicks).toFixed(1)),
    );

    // 1. Check if WAIT is viable (projected stock after safeWaitTicks remains safely above safety floor, and on-hand stock > safetyFloor)
    if (current > safetyFloor && projectedStock >= safetyFloor) {
      return {
        action: "wait",
        quantity: 0,
        rationale: `Stock of ${current}u is below ${reorderPoint}u par, but projected (${projectedStock}u in ${safeWaitTicks} ticks) stays safely above ${safetyFloor}u safety floor (burn rate ${rate}u/order). Deferring purchase to batch with future orders.`,
      };
    }

    // 2. Need to purchase: Calculate minimal deficit to target stock (absorbing multiple order cycles)
    const minimalQty = Math.max(1, target - current);

    // 3. Evaluate Bulk Volume Tier Concession (buy_to_tier)
    // Flour: 12u tier on Razorcery-1 (20% off at ₹4.80/u) or 10u tier on RazorPies (10% off at ₹7.20/u)
    // Cheese: 5u tier (10% off)
    // Tomatoes: 4u tier (10% off)
    // Milk: 3u or 5u tier (10-15% off)
    let bulkTierQty = 0;
    let bulkTierDiscount = 0;
    if (itemKey === "flour") {
      if (minimalQty >= 10 && minimalQty <= 15) {
        bulkTierQty = Math.max(minimalQty, 12);
        bulkTierDiscount = 20;
      } else if (minimalQty < 10 && 10 <= minimalQty * 1.5) {
        bulkTierQty = 10;
        bulkTierDiscount = 10;
      }
    } else if (
      itemKey === "cheese" &&
      minimalQty < 5 &&
      5 <= minimalQty * 1.6
    ) {
      bulkTierQty = 5;
      bulkTierDiscount = 10;
    } else if (
      itemKey === "tomatoes" &&
      minimalQty < 4 &&
      4 <= minimalQty * 1.6
    ) {
      bulkTierQty = 4;
      bulkTierDiscount = 10;
    } else if (itemKey === "milk" && minimalQty < 5 && 5 <= minimalQty * 1.6) {
      bulkTierQty = 5;
      bulkTierDiscount = 15;
    }

    if (bulkTierQty > minimalQty) {
      return {
        action: "buy_to_tier",
        quantity: bulkTierQty,
        rationale: `Stepped up ${itemKey} from ${minimalQty}u minimal deficit to ${bulkTierQty}u volume tier, unlocking ${bulkTierDiscount}% volume discount while remaining bounded within budget caps.`,
      };
    }

    return {
      action: "buy_minimal",
      quantity: minimalQty,
      rationale: `Restocking ${minimalQty}u ${itemKey} to restore pantry from ${current}u to ${target}u target level (sized to absorb typical order cycles).`,
    };
  };

  // Min-Max Inventory Model with Look-Ahead: Reorder when stock is below par (min), order up to target stock level (max).
  const checkReorderTriggers = (currentPantry: BuyerPantry) => {
    const itemsToBuy: Array<{ item: string; quantity: number }> = [];
    const keys: Array<keyof Omit<BuyerPantry, "targetStock">> = [
      "flour",
      "cheese",
      "tomatoes",
      "onions",
      "milk",
    ];

    for (const k of keys) {
      if (procurementInFlightRef.current.has(k)) continue; // in-flight guard
      const current = currentPantry[k] ?? 0;
      const reorderPoint = PAR_STOCK_LEVELS[k];

      // Only evaluate if current stock is below the par reorder point
      if (current < reorderPoint) {
        const decision = evaluateProcurementDecision(k, currentPantry);

        if (decision.action === "wait") {
          addLog(
            "info",
            `⏳ Look-Ahead Intelligence: Deferred (${k.toUpperCase()})`,
            decision.rationale,
          );
        } else {
          addLog(
            "info",
            `💡 Look-Ahead Decision: ${decision.action === "buy_to_tier" ? "BULK TIER CONCESSION" : "TARGET RESTOCK"} (${k.toUpperCase()})`,
            decision.rationale,
          );
          itemsToBuy.push({
            item: k,
            quantity: decision.quantity,
          });
        }
      }
    }

    return itemsToBuy;
  };

  // Process next order in queue
  const processNextOrder = async (): Promise<boolean> => {
    if (isFulfillingOrderRef.current) return false;
    isFulfillingOrderRef.current = true;
    setIsFulfillingOrder(true);
    setPaymentErrorNotification(null);

    try {
      const currentQueue = orderQueueRef.current;
      if (currentQueue.length === 0) {
        addLog(
          "info",
          "Queue Complete",
          "All customer orders have been successfully fulfilled & served!",
        );
        setIsAutoSimulating(false);
        return false;
      }

      const currentOrder = currentQueue[0];
      setActiveProcessingOrder(currentOrder);

      addLog(
        "order_taken",
        `Customer Order #${currentOrder.id} (${currentOrder.name})`,
        `Customer arrived. Recipe: ${Object.entries(currentOrder.recipe)
          .map(([k, v]) => `${v} ${k}`)
          .join(", ")}. Checking kitchen pantry...`,
        currentOrder.id,
      );

      let canBakeImmediately = true;
      const immediateDeficits: Array<{ item: string; quantity: number }> = [];

      (Object.keys(currentOrder.recipe) as Array<keyof BuyerPantry>).forEach(
        (k) => {
          if (k === "targetStock") return;
          const needed = currentOrder.recipe[k] || 0;
          const current = buyerStockRef.current[k] || 0;
          if (needed > current) {
            canBakeImmediately = false;
            immediateDeficits.push({ item: k, quantity: needed - current });
          }
        },
      );

      if (canBakeImmediately) {
        await new Promise((r) => setTimeout(r, 550));

        simulationTickRef.current += 1;
        const currentTick = simulationTickRef.current;

        const updatedStock = { ...buyerStockRef.current };
        (Object.keys(currentOrder.recipe) as Array<keyof BuyerPantry>).forEach(
          (k) => {
            if (k !== "targetStock" && currentOrder.recipe[k]) {
              const used = currentOrder.recipe[k] as number;
              updatedStock[k] = Math.max(0, (updatedStock[k] as number) - used);
              inventoryEventsRef.current.push({
                item: k,
                tick: currentTick,
                quantityUsed: used,
              });
            }
          },
        );
        buyerStockRef.current = updatedStock;
        setBuyerStock(updatedStock);

        addLog(
          "inventory_event",
          `[INVENTORY_EVENT] Baked ${currentOrder.name} (-${Object.entries(
            currentOrder.recipe,
          )
            .map(([k, v]) => `${v} ${k}`)
            .join(", -")})`,
          `Pantry updated: Flour=${updatedStock.flour}, Cheese=${updatedStock.cheese}, Tomatoes=${updatedStock.tomatoes}, Onions=${updatedStock.onions}, Milk=${updatedStock.milk}`,
          currentOrder.id,
        );

        const servedOrder = { ...currentOrder, status: "served" as const };
        setOrderQueue((prev) => {
          const nextQ = prev.slice(1);
          orderQueueRef.current = nextQ;
          return nextQ;
        });
        setCompletedOrders((prev) => [servedOrder, ...prev]);

        addLog(
          "order_served",
          `✅ Order #${currentOrder.id} (${currentOrder.name}) SERVED!`,
          `Delivered to customer! Advancing next order in queue.`,
          currentOrder.id,
        );

        const proactiveReplenishment = checkReorderTriggers(updatedStock);
        if (proactiveReplenishment.length > 0) {
          proactiveReplenishment.forEach((i) =>
            procurementInFlightRef.current.add(i.item),
          );

          addLog(
            "par_trigger",
            `⚠️ Par Stock Reorder Triggered`,
            `Procuring for: ${proactiveReplenishment.map((i) => `${i.item} (+${i.quantity}u)`).join(", ")} to reach target inventory level...`,
            currentOrder.id,
          );

          addLog(
            "a2a_procure",
            `A2A Procurement: ${proactiveReplenishment.map((i) => `+${i.quantity} ${i.item}`).join(", ")}`,
            `Broadcasting concurrent RFQs with target prices to RazorPies, Razorcery-1, and Razorcery-2...`,
            currentOrder.id,
          );

          const currentSellerInventories = JSON.parse(
            JSON.stringify(sellerInventoriesRef.current),
          );

          try {
            const res = await onRunAi("custom", {
              itemsToProcure: proactiveReplenishment,
              buyerStockKg: updatedStock.flour,
              sellerStockKg:
                sellerInventoriesRef.current["agent:seller:razor_pies"].cheese +
                sellerInventoriesRef.current["agent:seller:razorcery_1"].flour +
                sellerInventoriesRef.current["agent:seller:razorcery_2"].milk,
              buyerTargetStockKg: TARGET_STOCK_LEVELS.flour,
              sellerInventories: currentSellerInventories,
              simulatePaymentFail: simulationMode === "bank_decline" || simulatePaymentFail,
              simulationMode,
            });
            if (
              res &&
              (res.status === "CONFIRMED" ||
                res.status === "RENEGOTIATED_AND_CONFIRMED") &&
              res.purchased_items &&
              res.purchased_items.length > 0
            ) {
              const eventKey = `${res.thread_id || "direct"}_${res.status}_${res.order_id || ""}`;
              applyPurchasedItems(res.purchased_items, eventKey);
            } else if (res && res.status === "AWAITING_CONFIRMATION") {
              if (isAutoSimulating) {
                wasAutoSimulatingRef.current = true;
              }
              setIsAutoSimulating(false);
              addLog(
                "par_trigger",
                `⏸️ Partial Mode: Awaiting Restaurant Manager Approval`,
                `Par replenishment deal proposed for ₹${res.total_amount || res.pending_offer?.total_price || ""}. Auto-simulation paused waiting for authorization on mobile device.`,
                currentOrder.id,
              );
              setActiveProcessingOrder(null);
              return false;
            } else if (res && res.status === "PAYMENT_FAILED") {
              setRestockNotification(null);
              setPaymentErrorNotification({
                text: "❌ Proactive Restock Payment Failed: Gateway Error",
                detail:
                  res.message ||
                  "Simulated payment processing error at gateway. Kitchen inventory remains unchanged.",
              });
              addLog(
                "error",
                `❌ Proactive Restock Payment Failed (Razorpay Error)`,
                `Transaction declined by gateway. Par level replenishment canceled; kitchen inventory unchanged.`,
                currentOrder.id,
              );
              setIsAutoSimulating(false);
              wasAutoSimulatingRef.current = false;
            }
          } finally {
            proactiveReplenishment.forEach((i) =>
              procurementInFlightRef.current.delete(i.item),
            );
          }
        }

        setActiveProcessingOrder(null);
        return true;
      } else {
        addLog(
          "par_trigger",
          `⚠️ Immediate Stock Shortage on Order #${currentOrder.id}`,
          `Missing: ${immediateDeficits.map((d) => `${d.quantity}u ${d.item}`).join(", ")}. Triggering Look-Ahead A2A Procurement up to target level...`,
          currentOrder.id,
        );

        const itemsToProcure: Array<{ item: string; quantity: number }> = [];
        const keys: Array<keyof Omit<BuyerPantry, "targetStock">> = [
          "flour",
          "cheese",
          "tomatoes",
          "onions",
          "milk",
        ];

        for (const k of keys) {
          if (procurementInFlightRef.current.has(k)) continue;
          const current = buyerStockRef.current[k] ?? 0;
          const neededForRecipe = currentOrder.recipe[k] || 0;
          const reorderPoint = PAR_STOCK_LEVELS[k];

          if (current < neededForRecipe || current < reorderPoint) {
            const decision = evaluateProcurementDecision(k, buyerStockRef.current);
            const qty = Math.max(neededForRecipe - current, decision.quantity);
            if (qty > 0) {
              itemsToProcure.push({
                item: k,
                quantity: qty,
              });
            }
          }
        }

        if (itemsToProcure.length === 0) {
          for (const d of immediateDeficits) {
            itemsToProcure.push({
              item: d.item,
              quantity: d.quantity,
            });
          }
        }

        itemsToProcure.forEach((i) => procurementInFlightRef.current.add(i.item));

        addLog(
          "a2a_procure",
          `Broadcasting Concurrent RFQs`,
          `Procuring ${itemsToProcure.map((i) => `${i.quantity}u ${i.item}`).join(", ")} across A2A sellers with 2-round volume negotiation...`,
          currentOrder.id,
        );

        const currentSellerInventories = JSON.parse(
          JSON.stringify(sellerInventoriesRef.current),
        );

        let res: NegotiationResult | null = null;
        try {
          res = await onRunAi("custom", {
            itemsToProcure,
            buyerStockKg: buyerStockRef.current.flour,
            sellerStockKg:
              sellerInventoriesRef.current["agent:seller:razor_pies"].cheese +
              sellerInventoriesRef.current["agent:seller:razorcery_1"].flour +
              sellerInventoriesRef.current["agent:seller:razorcery_2"].milk,
            buyerTargetStockKg: TARGET_STOCK_LEVELS.flour,
            sellerInventories: currentSellerInventories,
            simulatePaymentFail: simulationMode === "bank_decline" || simulatePaymentFail,
            simulationMode,
          });
          if (
            res &&
            (res.status === "CONFIRMED" ||
              res.status === "RENEGOTIATED_AND_CONFIRMED") &&
            res.purchased_items &&
            res.purchased_items.length > 0
          ) {
            const eventKey = `${res.thread_id || "direct"}_${res.status}_${res.order_id || ""}`;
            applyPurchasedItems(res.purchased_items, eventKey);
          }
        } finally {
          itemsToProcure.forEach((i) =>
            procurementInFlightRef.current.delete(i.item),
          );
        }

        if (
          res &&
          (res.status === "CONFIRMED" ||
            res.status === "RENEGOTIATED_AND_CONFIRMED")
        ) {
          await new Promise((r) => setTimeout(r, 650));

          const next = { ...buyerStockRef.current };
          (
            Object.keys(currentOrder.recipe) as Array<keyof BuyerPantry>
          ).forEach((k) => {
            if (k !== "targetStock" && currentOrder.recipe[k]) {
              next[k] = Math.max(
                0,
                (next[k] as number) - (currentOrder.recipe[k] as number),
              );
            }
          });
          buyerStockRef.current = next;
          setBuyerStock(next);

          const servedOrder = { ...currentOrder, status: "served" as const };
          setOrderQueue((prev) => {
            const nextQ = prev.slice(1);
            orderQueueRef.current = nextQ;
            return nextQ;
          });
          setCompletedOrders((prev) => [servedOrder, ...prev]);
          setActiveProcessingOrder(null);

          addLog(
            "order_served",
            `✅ Order #${currentOrder.id} (${currentOrder.name}) SERVED!`,
            `Freshly baked with restocked ingredients and served!`,
            currentOrder.id,
          );

          return true;
        } else if (res && res.status === "AWAITING_CONFIRMATION") {
          waitingForProcurementOrderRef.current = currentOrder;
          if (isAutoSimulating) {
            wasAutoSimulatingRef.current = true;
          }
          addLog(
            "par_trigger",
            `⏸️ Partial Mode: Awaiting Restaurant Manager Approval`,
            `Order #${currentOrder.id} (${currentOrder.name}) is on hold. Negotiated procurement of ${itemsToProcure.map((i) => `${i.quantity}u ${i.item}`).join(", ")} for ₹${res.total_amount || res.pending_offer?.total_price || ""} requires mobile confirmation before payment & delivery.`,
            currentOrder.id,
          );
          setIsAutoSimulating(false);
          setActiveProcessingOrder(null);
          return false;
        } else if (res && res.status === "PAYMENT_FAILED") {
          setRestockNotification(null);
          setPaymentErrorNotification({
            text: "❌ Razorpay Payment Failed: Order Sourcing Aborted",
            detail:
              res.message ||
              "Simulated payment processing error at gateway. Kitchen inventory unchanged.",
          });
          addLog(
            "error",
            `❌ Order #${currentOrder.id} Sourcing Failed (Razorpay Error)`,
            `Payment declined by Razorpay gateway for ₹${res.total_amount || ""}. Order cannot be fulfilled; pantry stock unchanged.`,
            currentOrder.id,
          );
          setIsAutoSimulating(false);
          wasAutoSimulatingRef.current = false;
          setActiveProcessingOrder(null);
          return false;
        } else {
          addLog(
            "par_trigger",
            `Procurement Paused / Policy Hold`,
            `Order #${currentOrder.id} paused pending manager authorization.`,
            currentOrder.id,
          );
          setIsAutoSimulating(false);
          setActiveProcessingOrder(null);
          return false;
        }
      }
    } finally {
      isFulfillingOrderRef.current = false;
      setIsFulfillingOrder(false);
    }
  };

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    if (isAutoSimulating && !isRunning && orderQueue.length > 0) {
      timeoutId = setTimeout(() => {
        processNextOrder();
      }, 1500);
    } else if (orderQueue.length === 0 && isAutoSimulating) {
      setIsAutoSimulating(false);
    }
    return () => clearTimeout(timeoutId);
  }, [isAutoSimulating, isRunning, orderQueue]);

  const applyPreset = (
    preset: "default" | "stocked" | "low_par" | "over_cap",
  ) => {
    processedTxKeysRef.current.clear();
    lastProcessedThreadRef.current = null;
    procurementInFlightRef.current.clear();
    simulationTickRef.current = 0;
    inventoryEventsRef.current = [];
    waitingForProcurementOrderRef.current = null;
    wasAutoSimulatingRef.current = false;
    setIsAutoSimulating(false);
    setRestockNotification(null);
    setPaymentErrorNotification(null);

    if (preset === "default") {
      sellerInventoriesRef.current = {
        "agent:seller:razor_pies": { cheese: 15, flour: 25, milk: 10 },
        "agent:seller:razorcery_1": { flour: 35, tomatoes: 15, onions: 15 },
        "agent:seller:razorcery_2": { milk: 15, tomatoes: 15, onions: 15 },
      };
      setBuyerStock({
        cheese: 6,
        flour: 30,
        tomatoes: 6,
        onions: 6,
        milk: 7,
        targetStock: 40,
      });
      setRazorPies({
        cheese: { stock: 15, price: 4 },
        flour: { stock: 25, price: 8 },
        milk: { stock: 10, price: 9 },
      });
      setRazorcery1({
        flour: { stock: 35, price: 6 },
        tomatoes: { stock: 15, price: 4 },
        onions: { stock: 15, price: 4 },
      });
      setRazorcery2({
        milk: { stock: 15, price: 10 },
        tomatoes: { stock: 15, price: 3 },
        onions: { stock: 15, price: 5 },
      });
      setOrderQueue(DEFAULT_ORDERS);
      setCompletedOrders([]);
      addLog(
        "info",
        "Reset to Default Setup",
        "Pantry restored to initial state (Flour: 30/40, Cheese: 6/8, Tomatoes: 6/8, Onions: 6/8, Milk: 7/9). Target stock sized for order cycles.",
      );
    } else if (preset === "stocked") {
      sellerInventoriesRef.current = {
        "agent:seller:razor_pies": { cheese: 25, flour: 40, milk: 20 },
        "agent:seller:razorcery_1": { flour: 45, tomatoes: 25, onions: 25 },
        "agent:seller:razorcery_2": { milk: 25, tomatoes: 25, onions: 25 },
      };
      setRazorPies({
        cheese: { stock: 25, price: 4 },
        flour: { stock: 40, price: 8 },
        milk: { stock: 20, price: 9 },
      });
      setRazorcery1({
        flour: { stock: 45, price: 6 },
        tomatoes: { stock: 25, price: 4 },
        onions: { stock: 25, price: 4 },
      });
      setRazorcery2({
        milk: { stock: 25, price: 10 },
        tomatoes: { stock: 25, price: 3 },
        onions: { stock: 25, price: 5 },
      });
      setBuyerStock({
        cheese: 15,
        flour: 50,
        tomatoes: 20,
        onions: 15,
        milk: 20,
        targetStock: 40,
      });
      addLog(
        "info",
        "Surplus Stock Preset",
        "Pantry and seller warehouses filled with high surplus stock.",
      );
    } else if (preset === "low_par") {
      sellerInventoriesRef.current = {
        "agent:seller:razor_pies": { cheese: 15, flour: 25, milk: 10 },
        "agent:seller:razorcery_1": { flour: 35, tomatoes: 15, onions: 15 },
        "agent:seller:razorcery_2": { milk: 15, tomatoes: 15, onions: 15 },
      };
      setRazorPies({
        cheese: { stock: 15, price: 4 },
        flour: { stock: 25, price: 8 },
        milk: { stock: 10, price: 9 },
      });
      setRazorcery1({
        flour: { stock: 35, price: 6 },
        tomatoes: { stock: 15, price: 4 },
        onions: { stock: 15, price: 4 },
      });
      setRazorcery2({
        milk: { stock: 15, price: 10 },
        tomatoes: { stock: 15, price: 3 },
        onions: { stock: 15, price: 5 },
      });
      setBuyerStock({
        cheese: 3,
        flour: 22,
        tomatoes: 4,
        onions: 3,
        milk: 4,
        targetStock: 40,
      });
      addLog(
        "par_trigger",
        "Low Par Stock Preset",
        "All items set below par stock (Flour: 22/30, Cheese: 3/5, Tomatoes: 4/5, Onions: 3/5, Milk: 4/5) with 40u / 8-9u cycle target reordering.",
      );
    } else if (preset === "over_cap") {
      sellerInventoriesRef.current = {
        "agent:seller:razor_pies": { cheese: 50, flour: 50, milk: 50 },
        "agent:seller:razorcery_1": { flour: 50, tomatoes: 50, onions: 50 },
        "agent:seller:razorcery_2": { milk: 50, tomatoes: 50, onions: 50 },
      };
      setBuyerStock({
        cheese: 0,
        flour: 0,
        tomatoes: 0,
        onions: 0,
        milk: 0,
        targetStock: 50,
      });
      setRazorPies({
        cheese: { stock: 50, price: 40 },
        flour: { stock: 50, price: 50 },
        milk: { stock: 50, price: 50 },
      });
      setRazorcery1({
        flour: { stock: 50, price: 50 },
        tomatoes: { stock: 50, price: 50 },
        onions: { stock: 50, price: 50 },
      });
      setRazorcery2({
        milk: { stock: 50, price: 50 },
        tomatoes: { stock: 50, price: 50 },
        onions: { stock: 50, price: 50 },
      });
      addLog(
        "info",
        "Breach Cap Demo",
        "Pantry empty and seller prices set high to demonstrate bounded policy engine caps.",
      );
    }
  };

  const handleAddOrder = (
    recipeType: "margherita" | "farm_fresh" | "shake",
  ) => {
    const id = nextOrderIdRef.current++;
    let newOrd: CustomerOrder;
    if (recipeType === "margherita") {
      newOrd = {
        id,
        name: "Margherita Pizza",
        recipe: { flour: 5, cheese: 2, tomatoes: 1 },
        price: "₹299",
        status: "queued",
      };
    } else if (recipeType === "farm_fresh") {
      newOrd = {
        id,
        name: "Farm Fresh Pizza",
        recipe: { flour: 5, cheese: 1, tomatoes: 1, onions: 2 },
        price: "₹349",
        status: "queued",
      };
    } else {
      newOrd = {
        id,
        name: "Milk Shake",
        recipe: { milk: 2 },
        price: "₹120",
        status: "queued",
      };
    }
    setOrderQueue((prev) => [...prev, newOrd]);
    addLog(
      "order_taken",
      `New Customer Arrived: Order #${id}`,
      `Added ${newOrd.name} to the back of the queue.`,
      id,
    );
  };

  const updateBuyerItem = (item: keyof BuyerPantry, delta: number) => {
    if (isRunning) return;
    setBuyerStock((prev) => ({
      ...prev,
      [item]: Math.max(0, prev[item] + delta),
    }));
  };

  const updateSellerStock = (
    seller: "razorPies" | "razorcery1" | "razorcery2",
    item: string,
    delta: number,
  ) => {
    if (isRunning) return;
    if (seller === "razorPies") {
      setRazorPies((prev) => {
        const nextStock = Math.max(0, prev[item].stock + delta);
        if (sellerInventoriesRef.current["agent:seller:razor_pies"]) {
          sellerInventoriesRef.current["agent:seller:razor_pies"][item] =
            nextStock;
        }
        return {
          ...prev,
          [item]: { ...prev[item], stock: nextStock },
        };
      });
    } else if (seller === "razorcery1") {
      setRazorcery1((prev) => {
        const nextStock = Math.max(0, prev[item].stock + delta);
        if (sellerInventoriesRef.current["agent:seller:razorcery_1"]) {
          sellerInventoriesRef.current["agent:seller:razorcery_1"][item] =
            nextStock;
        }
        return {
          ...prev,
          [item]: { ...prev[item], stock: nextStock },
        };
      });
    } else if (seller === "razorcery2") {
      setRazorcery2((prev) => {
        const nextStock = Math.max(0, prev[item].stock + delta);
        if (sellerInventoriesRef.current["agent:seller:razorcery_2"]) {
          sellerInventoriesRef.current["agent:seller:razorcery_2"][item] =
            nextStock;
        }
        return {
          ...prev,
          [item]: { ...prev[item], stock: nextStock },
        };
      });
    }
  };

  // Helper to filter envelopes specific to a seller channel
  const getChannelMessages = (sellerId: string) => {
    return messages.filter(
      (m) =>
        m.from.toLowerCase().includes(sellerId.toLowerCase()) ||
        m.to.toLowerCase().includes(sellerId.toLowerCase()),
    );
  };

  // Helper to check if a specific seller won a deal in the latest result
  const isSellerFinalized = (sellerId: string) => {
    if (!latestResult || latestResult.status !== "CONFIRMED") return false;
    if (
      latestResult.purchased_items &&
      latestResult.purchased_items.length > 0
    ) {
      return latestResult.purchased_items.some((p) =>
        p.seller_id.toLowerCase().includes(sellerId.toLowerCase()),
      );
    }
    if (latestResult.pending_offer?.seller_id) {
      return latestResult.pending_offer.seller_id
        .toLowerCase()
        .includes(sellerId.toLowerCase());
    }
    return false;
  };

  const getSellerFinalizedSummary = (sellerId: string) => {
    if (!latestResult || latestResult.status !== "CONFIRMED") return null;
    const items = (latestResult.purchased_items || []).filter((p) =>
      p.seller_id.toLowerCase().includes(sellerId.toLowerCase()),
    );
    if (items.length === 0) return null;
    const totalCost = items.reduce(
      (sum, it) => sum + it.quantity * it.price,
      0,
    );
    return {
      itemsSummary: items
        .map((it) => `${it.quantity}u ${it.item} @ ₹${it.price}`)
        .join(", "),
      totalCost,
    };
  };

  // Helper component for message queue capsule channel box (matching image.png blueprint)
  // ONLY shows messages when messages exist, with no filler text and a smooth internal scrollbar!
  const renderMessageChannel = (
    sellerKey: string,
    sellerDisplayName: string,
  ) => {
    const channelMsgs = getChannelMessages(sellerKey);
    const finalized = isSellerFinalized(sellerKey);
    const finalizedSummary = getSellerFinalizedSummary(sellerKey);

    return (
      <div
        style={{
          border: finalized ? "1.5px solid #10b981" : "1.5px solid #0D94FB",
          borderRadius: 14,
          padding: "0.4rem 0.65rem",
          background: finalized
            ? "linear-gradient(90deg, rgba(16, 185, 129, 0.08) 0%, rgba(13, 148, 251, 0.08) 100%)"
            : "rgba(13, 148, 251, 0.05)",
          boxShadow: finalized
            ? "0 0 14px rgba(16, 185, 129, 0.25)"
            : "0 0 10px rgba(13, 148, 251, 0.12)",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          minHeight: 48,
          position: "relative",
          width: "100%",
          minWidth: 0,
          boxSizing: "border-box",
        }}
      >
        {/* Channel Label Tag */}
        <div
          style={{
            fontSize: "0.62rem",
            fontWeight: 800,
            color: finalized ? "#34d399" : "#38bdf8",
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
            flexShrink: 0,
            background: "rgba(15, 23, 42, 0.7)",
            padding: "0.2rem 0.4rem",
            borderRadius: 4,
            border: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <ArrowLeftRight size={11} />
          <span>{sellerDisplayName}</span>
        </div>

        {/* Message Sequence Trail with internal horizontal scrollbar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            overflowX: "auto",
            minWidth: 0,
            flex: 1,
            paddingBottom: channelMsgs.length > 0 ? 3 : 0,
            scrollbarWidth: "thin",
          }}
        >
          {channelMsgs.length > 0 ? (
            channelMsgs.map((msg, idx) => {
              const isBuyerMsg =
                msg.from.toLowerCase().includes("buyer") ||
                msg.from.toLowerCase().includes("razorslice");
              const isRfq = msg.type === "RFQ";
              const isCounter = msg.type === "COUNTER_OFFER";
              const isOffer = msg.type === "OFFER";
              const isAccept =
                msg.type === "ACCEPT" || msg.type === "SPLIT_ACCEPT";

              let pillBg = "rgba(13, 148, 251, 0.22)";
              let pillBorder = "#0D94FB";
              let pillColor = "#e0f2fe";
              let label = isRfq
                ? `buyer ask: ${(msg.payload as any).quantity_kg || 5}u ${(msg.payload as any).item || "flour"} @ ₹${(msg.payload as any).target_price_per_unit || (msg.payload as any).buyer_max_price_per_kg || 5}/u`
                : isCounter
                  ? `buyer counter: ${(msg.payload as any).quantity_kg}u @ ₹${(msg.payload as any).target_price_per_unit || 3.5}/u`
                  : isOffer
                    ? `seller response: ${(msg.payload as any).quantity_kg}u @ ₹${(msg.payload as any).final_price_per_kg}/u (-${(msg.payload as any).discount_pct}%)`
                    : isAccept
                      ? `Finalized Deal`
                      : msg.type;

              if (!isBuyerMsg) {
                pillBg = "rgba(16, 185, 129, 0.22)";
                pillBorder = "#10b981";
                pillColor = "#6ee7b7";
              }

              return (
                <button
                  key={msg.message_id || idx}
                  onClick={() =>
                    onSelectMessage &&
                    msg.message_id &&
                    onSelectMessage(msg.message_id)
                  }
                  title="Click to view & inspect this envelope in the Envelope Trace below"
                  style={{
                    background: pillBg,
                    border: `1.5px solid ${pillBorder}`,
                    borderRadius: 18,
                    padding: "0.2rem 0.6rem",
                    color: pillColor,
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    flexShrink: 0,
                    transition: "all 0.15s ease",
                  }}
                >
                  <span>{label}</span>
                  <ExternalLink size={10} style={{ opacity: 0.6 }} />
                </button>
              );
            })
          ) : (
            <div
              style={{
                color: "#64748b",
                fontSize: "0.7rem",
                fontStyle: "italic",
                display: "flex",
                alignItems: "center",
                gap: "0.3rem",
                padding: "0.15rem 0.4rem",
              }}
            >
              <Clock size={12} style={{ opacity: 0.7 }} />
              <span>Awaiting negotiation events...</span>
            </div>
          )}
        </div>

        {/* Finalized Summary Badge */}
        {finalized && finalizedSummary && (
          <div
            style={{
              background: "#064e3b",
              border: "1.5px solid #10b981",
              borderRadius: 8,
              padding: "0.2rem 0.5rem",
              color: "#a7f3d0",
              fontSize: "0.68rem",
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              gap: "0.3rem",
              flexShrink: 0,
              boxShadow: "0 0 8px rgba(16, 185, 129, 0.4)",
            }}
          >
            <Award size={12} color="#34d399" />
            <span>
              Finalized: {finalizedSummary.itemsSummary} (₹
              {finalizedSummary.totalCost})
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      style={{
        background: "#090d16",
        borderRadius: 12,
        border: "1px solid #1e293b",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.45)",
        color: "#f8fafc",
        padding: "1.25rem",
        position: "relative",
        overflow: "hidden",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* Background Blueprint Grid Lines */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(rgba(13, 148, 251, 0.08) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          pointerEvents: "none",
          opacity: 0.8,
        }}
      />

      {/* Partial Mode Awaiting Confirmation Alert Banner */}
      {delegationMode === "partial" &&
        latestResult?.status === "AWAITING_CONFIRMATION" && (
          <div
            style={{
              position: "relative",
              zIndex: 10,
              background:
                "linear-gradient(90deg, rgba(245, 158, 11, 0.2) 0%, rgba(217, 119, 6, 0.25) 100%)",
              border: "1px solid #f59e0b",
              borderRadius: 8,
              padding: "0.6rem 1rem",
              marginBottom: "1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "0.5rem",
            }}
          >
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <Clock size={18} color="#f59e0b" />
              <span
                style={{
                  fontWeight: 700,
                  color: "#fef3c7",
                  fontSize: "0.85rem",
                }}
              >
                ⏸️ Partial Delegation: Awaiting Restaurant Manager Approval on
                Mobile Device (₹
                {latestResult.total_amount ||
                  latestResult.pending_offer?.total_price}
                )
              </span>
            </div>
            <span
              style={{
                background: "#78350f",
                color: "#fde68a",
                fontSize: "0.72rem",
                fontWeight: 700,
                padding: "0.2rem 0.5rem",
                borderRadius: 4,
                border: "1px solid #d97706",
              }}
            >
              Awaiting Mobile UPI Circle Authorization
            </span>
          </div>
        )}

      {/* Restock Live Notification Banner */}
      {restockNotification && (
        <div
          style={{
            position: "relative",
            zIndex: 10,
            background:
              "linear-gradient(90deg, rgba(16, 185, 129, 0.25) 0%, rgba(13, 148, 251, 0.25) 100%)",
            border: "1px solid #10b981",
            borderRadius: 8,
            padding: "0.6rem 1rem",
            marginBottom: "1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.5rem",
            animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <CheckCircle2 size={18} color="#10b981" />
            <span
              style={{ fontWeight: 700, color: "#ffffff", fontSize: "0.85rem" }}
            >
              {restockNotification.text}
            </span>
          </div>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {restockNotification.items.map((it, idx) => (
              <span
                key={idx}
                style={{
                  background: "#064e3b",
                  color: "#6ee7b7",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  padding: "0.2rem 0.5rem",
                  borderRadius: 4,
                  border: "1px solid #059669",
                }}
              >
                +{it.quantity} {it.item} ({it.seller})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Payment Failure Live Notification Banner */}
      {paymentErrorNotification && (
        <div
          style={{
            position: "relative",
            zIndex: 10,
            background:
              "linear-gradient(90deg, rgba(239, 68, 68, 0.25) 0%, rgba(185, 28, 28, 0.25) 100%)",
            border: "1px solid #ef4444",
            borderRadius: 8,
            padding: "0.6rem 1rem",
            marginBottom: "1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.5rem",
            animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <AlertCircle size={18} color="#ef4444" />
            <span
              style={{ fontWeight: 700, color: "#ffffff", fontSize: "0.85rem" }}
            >
              {paymentErrorNotification.text}
            </span>
          </div>
          {paymentErrorNotification.detail && (
            <span
              style={{
                background: "#7f1d1d",
                color: "#fca5a5",
                fontSize: "0.72rem",
                fontWeight: 700,
                padding: "0.2rem 0.5rem",
                borderRadius: 4,
                border: "1px solid #b91c1c",
              }}
            >
              {paymentErrorNotification.detail}
            </span>
          )}
        </div>
      )}

      {/* TOP: Header Bar & Preset Quick Select */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1rem",
          flexWrap: "wrap",
          gap: "0.75rem",
          position: "relative",
          zIndex: 2,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
          <ChefHat size={22} color="#38bdf8" />
          <h2
            style={{
              fontSize: "1.15rem",
              fontWeight: 800,
              color: "#ffffff",
              letterSpacing: "-0.01em",
              margin: 0,
            }}
          >
            RazorSlice Kitchen & Multi-Seller A2A Negotiation Architecture
          </h2>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.3rem",
              padding: "0.2rem 0.55rem",
              borderRadius: 4,
              background:
                simulationMode === "happy"
                  ? "rgba(16, 185, 129, 0.2)"
                  : simulationMode === "bank_decline"
                  ? "rgba(220, 38, 38, 0.2)"
                  : simulationMode === "network_drop"
                  ? "rgba(245, 158, 11, 0.2)"
                  : simulationMode === "gateway_downtime"
                  ? "rgba(234, 88, 12, 0.2)"
                  : "rgba(168, 85, 247, 0.2)",
              border: `1px solid ${
                simulationMode === "happy"
                  ? "#10b981"
                  : simulationMode === "bank_decline"
                  ? "#ef4444"
                  : simulationMode === "network_drop"
                  ? "#f59e0b"
                  : simulationMode === "gateway_downtime"
                  ? "#ea580c"
                  : "#a855f7"
              }`,
              color:
                simulationMode === "happy"
                  ? "#6ee7b7"
                  : simulationMode === "bank_decline"
                  ? "#fca5a5"
                  : simulationMode === "network_drop"
                  ? "#fde68a"
                  : simulationMode === "gateway_downtime"
                  ? "#fdba74"
                  : "#d8b4fe",
              fontSize: "0.7rem",
              fontWeight: 700,
              letterSpacing: "0.02em",
            }}
          >
            <AlertCircle size={12} />
            {simulationMode === "happy"
              ? "UPI Circle Active (success@razorpay)"
              : simulationMode === "bank_decline"
              ? "Simulated Bank Decline Active (failure@razorpay)"
              : simulationMode === "network_drop"
              ? "Simulated Socket Drop Active (ECONNRESET)"
              : simulationMode === "gateway_downtime"
              ? "Simulated NPCI Switch 502 Downtime"
              : "Policy Cap Breach Demo Active"}
          </span>
        </div>

        {/* Preset quick buttons */}
        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
          <button
            onClick={() => applyPreset("default")}
            disabled={isRunning}
            style={{
              padding: "0.28rem 0.65rem",
              borderRadius: 6,
              background: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              fontSize: "0.72rem",
              color: "#e2e8f0",
              cursor: isRunning ? "not-allowed" : "pointer",
              fontWeight: 600,
            }}
          >
            Default Par Setup
          </button>
          <button
            onClick={() => applyPreset("low_par")}
            disabled={isRunning}
            style={{
              padding: "0.28rem 0.65rem",
              borderRadius: 6,
              background: "rgba(245, 158, 11, 0.12)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              fontSize: "0.72rem",
              color: "#fde68a",
              cursor: isRunning ? "not-allowed" : "pointer",
              fontWeight: 600,
            }}
          >
            Below Par Trigger Demo
          </button>
          <button
            onClick={() => applyPreset("stocked")}
            disabled={isRunning}
            style={{
              padding: "0.28rem 0.65rem",
              borderRadius: 6,
              background: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              fontSize: "0.72rem",
              color: "#6ee7b7",
              cursor: isRunning ? "not-allowed" : "pointer",
              fontWeight: 600,
            }}
          >
            Surplus Stock
          </button>
          <button
            onClick={() => applyPreset("over_cap")}
            disabled={isRunning}
            style={{
              padding: "0.28rem 0.65rem",
              borderRadius: 6,
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              fontSize: "0.72rem",
              color: "#fca5a5",
              cursor: isRunning ? "not-allowed" : "pointer",
              fontWeight: 600,
            }}
          >
            Policy Cap Demo
          </button>
        </div>

        {/* PILLAR C: Simulation Mode Selector Bar */}
        <div
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: "0.45rem",
            flexWrap: "wrap",
            padding: "0.4rem 0.65rem",
            background: "rgba(15, 23, 42, 0.6)",
            borderRadius: 8,
            border: "1px solid rgba(255, 255, 255, 0.12)",
            marginTop: "0.5rem",
          }}
        >
          <span
            style={{
              fontSize: "0.72rem",
              fontWeight: 800,
              color: "#38bdf8",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span>⚡ Resilience Rail:</span>
          </span>
          <button
            onClick={() => setSimulationMode && setSimulationMode("happy")}
            style={{
              padding: "0.28rem 0.65rem",
              borderRadius: 6,
              border:
                simulationMode === "happy"
                  ? "1.5px solid #10b981"
                  : "1px solid rgba(255,255,255,0.12)",
              background:
                simulationMode === "happy"
                  ? "rgba(16, 185, 129, 0.25)"
                  : "rgba(255,255,255,0.03)",
              color: simulationMode === "happy" ? "#6ee7b7" : "#94a3b8",
              fontSize: "0.72rem",
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            🟢 Happy Path (success@razorpay)
          </button>
          <button
            onClick={() => setSimulationMode && setSimulationMode("bank_decline")}
            style={{
              padding: "0.28rem 0.65rem",
              borderRadius: 6,
              border:
                simulationMode === "bank_decline"
                  ? "1.5px solid #ef4444"
                  : "1px solid rgba(255,255,255,0.12)",
              background:
                simulationMode === "bank_decline"
                  ? "rgba(239, 68, 68, 0.25)"
                  : "rgba(255,255,255,0.03)",
              color: simulationMode === "bank_decline" ? "#fca5a5" : "#94a3b8",
              fontSize: "0.72rem",
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            🔴 Bank Decline (failure@razorpay)
          </button>
        </div>
      </div>

      {/* TOP CENTER: Menu Recipes Bar */}
      <div
        style={{
          border: "2px solid #0D94FB",
          borderRadius: 14,
          padding: "0.55rem 0.9rem",
          background: "rgba(13, 148, 251, 0.06)",
          marginBottom: "1.25rem",
          position: "relative",
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            style={{
              color: "#38bdf8",
              fontSize: "0.85rem",
              fontWeight: 800,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Menu
          </span>
          <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
            (Par Stock: Flour 30u, Cheese 5u, Tomatoes 5u, Onions 5u, Milk 5u)
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            fontSize: "0.75rem",
            color: "#e2e8f0",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              background: "rgba(15, 23, 42, 0.7)",
              padding: "0.25rem 0.6rem",
              borderRadius: 6,
              border: "1px solid rgba(13, 148, 251, 0.25)",
            }}
          >
            <span style={{ fontWeight: 700, color: "#38bdf8" }}>
              Margherita:{" "}
            </span>
            <span>5 Flour, 2 Cheese, 1 Tomato</span>
          </div>

          <div
            style={{
              background: "rgba(15, 23, 42, 0.7)",
              padding: "0.25rem 0.6rem",
              borderRadius: 6,
              border: "1px solid rgba(13, 148, 251, 0.25)",
            }}
          >
            <span style={{ fontWeight: 700, color: "#38bdf8" }}>
              Farm fresh:{" "}
            </span>
            <span>5 Flour, 1 Cheese, 1 Tomato, 2 Onions</span>
          </div>

          <div
            style={{
              background: "rgba(15, 23, 42, 0.7)",
              padding: "0.25rem 0.6rem",
              borderRadius: 6,
              border: "1px solid rgba(13, 148, 251, 0.25)",
            }}
          >
            <span style={{ fontWeight: 700, color: "#38bdf8" }}>
              Milk shake:{" "}
            </span>
            <span>2 Milk</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MAIN ARCHITECTURAL CANVAS (Strictly In-Bounds, 3 Responsive Columns)      */}
      {/* Left: Inventory + Agent + Order Queue                                      */}
      {/* Middle: 3 Communication Channel Boxes (Real Messages Only + Scrollable)    */}
      {/* Right: 3 Seller Agents + Catalog Inventory Boxes                          */}
      {/* ========================================================================= */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "minmax(250px, 280px) minmax(0, 1fr) minmax(240px, 270px)",
          gap: "1rem",
          alignItems: "stretch",
          position: "relative",
          zIndex: 2,
          width: "100%",
          minWidth: 0,
        }}
      >
        {/* LEFT COLUMN: Inventory Box + Agent RazorSlice + Customer Line */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              alignItems: "flex-start",
              minWidth: 0,
            }}
          >
            {/* 1. Buyer Inventory Box (Dashed Orange Outline) */}
            <div
              style={{
                border: "2px dashed #f59e0b",
                borderRadius: 12,
                padding: "0.5rem 0.55rem",
                background: "rgba(245, 158, 11, 0.03)",
                flex: "1 1 50%",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  color: "#f59e0b",
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  marginBottom: "0.35rem",
                  textAlign: "center",
                }}
              >
                inventory
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.22rem",
                }}
              >
                {[
                  {
                    key: "cheese" as const,
                    name: "cheese",
                    par: PAR_STOCK_LEVELS.cheese,
                    tgt: TARGET_STOCK_LEVELS.cheese,
                  },
                  {
                    key: "flour" as const,
                    name: "flour",
                    par: PAR_STOCK_LEVELS.flour,
                    tgt: TARGET_STOCK_LEVELS.flour,
                  },
                  {
                    key: "tomatoes" as const,
                    name: "tomatoes",
                    par: PAR_STOCK_LEVELS.tomatoes,
                    tgt: TARGET_STOCK_LEVELS.tomatoes,
                  },
                  {
                    key: "onions" as const,
                    name: "onions",
                    par: PAR_STOCK_LEVELS.onions,
                    tgt: TARGET_STOCK_LEVELS.onions,
                  },
                  {
                    key: "milk" as const,
                    name: "milk",
                    par: PAR_STOCK_LEVELS.milk,
                    tgt: TARGET_STOCK_LEVELS.milk,
                  },
                ].map((item) => {
                  const currentVal = buyerStock[item.key];
                  const isBelowPar = currentVal < item.par;

                  return (
                    <div
                      key={item.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        background: isBelowPar
                          ? "rgba(239, 68, 68, 0.14)"
                          : "rgba(15, 23, 42, 0.6)",
                        padding: "0.15rem 0.3rem",
                        borderRadius: 5,
                        fontSize: "0.7rem",
                      }}
                    >
                      <span
                        style={{
                          color: isBelowPar ? "#fca5a5" : "#e2e8f0",
                          fontWeight: 700,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.name}-{currentVal}{" "}
                        <span style={{ opacity: 0.6, fontSize: "0.62rem" }}>
                          ({item.tgt})
                        </span>
                      </span>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.1rem",
                          flexShrink: 0,
                        }}
                      >
                        <button
                          onClick={() => updateBuyerItem(item.key, -1)}
                          disabled={isRunning}
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: 3,
                            background: "rgba(255, 255, 255, 0.1)",
                            border: "none",
                            color: "#ffffff",
                            cursor: isRunning ? "not-allowed" : "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Minus size={8} />
                        </button>
                        <button
                          onClick={() => updateBuyerItem(item.key, 1)}
                          disabled={isRunning}
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: 3,
                            background: "rgba(255, 255, 255, 0.1)",
                            border: "none",
                            color: "#ffffff",
                            cursor: isRunning ? "not-allowed" : "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Plus size={8} />
                        </button>
                      </div>
                    </div>
                  );
                })}

                <div
                  style={{
                    color: "#f59e0b",
                    fontSize: "0.6rem",
                    fontWeight: 700,
                    textAlign: "center",
                    marginTop: "0.15rem",
                  }}
                >
                  target = reorder + 2-order buffer
                </div>
              </div>
            </div>

            {/* 2. Agent RazorSlice Box (White solid outline) */}
            <div
              style={{
                border: "2px solid #ffffff",
                borderRadius: 14,
                background: "#0d1527",
                padding: "0.55rem 0.45rem 0.35rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                flex: "1 1 50%",
                minWidth: 0,
                boxShadow: "0 0 16px rgba(255, 255, 255, 0.1)",
              }}
            >
              <div
                style={{
                  padding: "0.12rem 0.55rem",
                  borderRadius: 6,
                  border: "1.5px solid #ea580c",
                  background: "rgba(234, 88, 12, 0.3)",
                  color: "#fb923c",
                  fontSize: "0.68rem",
                  fontWeight: 800,
                  marginBottom: "0.35rem",
                }}
              >
                agent
              </div>

              <div
                style={{
                  fontSize: "0.9rem",
                  fontWeight: 800,
                  color: "#ffffff",
                  marginBottom: "0.65rem",
                }}
              >
                RazorSlice
              </div>

              <div
                style={{
                  width: "90%",
                  borderTop: "2px dashed #94a3b8",
                  borderLeft: "2px dashed #94a3b8",
                  borderRight: "2px dashed #94a3b8",
                  borderTopLeftRadius: 4,
                  borderTopRightRadius: 4,
                  padding: "0.1rem 0.2rem",
                  textAlign: "center",
                  fontSize: "0.55rem",
                  color: "#94a3b8",
                  background: "rgba(148, 163, 184, 0.08)",
                }}
              >
                [ Counter Gate ]
              </div>
            </div>
          </div>

          {/* 3. Customer Order Queue */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.25rem",
              paddingLeft: "0.25rem",
              minWidth: 0,
            }}
          >
            {orderQueue.length === 0 ? (
              <div
                style={{
                  background: "rgba(16, 185, 129, 0.1)",
                  border: "1px dashed #10b981",
                  borderRadius: 8,
                  padding: "0.45rem",
                  textAlign: "center",
                  color: "#6ee7b7",
                  fontSize: "0.7rem",
                  fontWeight: 600,
                }}
              >
                All Orders Fulfilled! 🎉
              </div>
            ) : (
              orderQueue.map((order, idx) => {
                const isFront = idx === 0;
                return (
                  <div
                    key={order.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.45rem",
                      background: isFront
                        ? "rgba(13, 148, 251, 0.15)"
                        : "transparent",
                      padding: "0.12rem 0.3rem",
                      borderRadius: 12,
                      border: isFront
                        ? "1px solid #0D94FB"
                        : "1px solid transparent",
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        width: 17,
                        height: 17,
                        borderRadius: "50%",
                        border: "2px solid #0D94FB",
                        background: isFront
                          ? "#0D94FB"
                          : "rgba(13, 148, 251, 0.25)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.58rem",
                        fontWeight: 800,
                        color: "#ffffff",
                        flexShrink: 0,
                      }}
                    >
                      {order.id}
                    </div>

                    <span
                      style={{
                        fontSize: "0.7rem",
                        color: isFront ? "#ffffff" : "#94a3b8",
                        fontWeight: isFront ? 700 : 500,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        minWidth: 0,
                      }}
                    >
                      {order.name.toLowerCase()}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* MIDDLE COLUMN: The 3 Message Queue Channel Boxes (Real Messages Only + Scrollable) */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-around",
            gap: "0.75rem",
            minWidth: 0,
          }}
        >
          {/* Channel 1: RazorSlice <-> RazorPies */}
          {renderMessageChannel("razor_pies", "RazorPies")}

          {/* Channel 2: RazorSlice <-> Razorcery-1 */}
          {renderMessageChannel("razorcery_1", "Razorcery-1")}

          {/* Channel 3: RazorSlice <-> Razorcery-2 */}
          {renderMessageChannel("razorcery_2", "Razorcery-2")}
        </div>

        {/* RIGHT COLUMN: 3 Sellers (Green outline boxes + Dashed Orange Inventory) */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.6rem",
            minWidth: 0,
          }}
        >
          {/* SELLER 1: RazorPies */}
          <div
            style={{
              display: "flex",
              gap: "0.4rem",
              alignItems: "center",
              minWidth: 0,
            }}
          >
            <div
              style={{
                border: "2px solid #10b981",
                borderRadius: 12,
                background: "#0d1527",
                padding: "0.45rem 0.5rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                flex: "1 1 45%",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  padding: "0.08rem 0.45rem",
                  borderRadius: 5,
                  border: "1.5px solid #ea580c",
                  background: "rgba(234, 88, 12, 0.3)",
                  color: "#fb923c",
                  fontSize: "0.62rem",
                  fontWeight: 800,
                  marginBottom: "0.2rem",
                }}
              >
                agent
              </div>
              <div
                style={{
                  fontSize: "0.78rem",
                  fontWeight: 800,
                  color: "#34d399",
                  whiteSpace: "nowrap",
                }}
              >
                RazorPies
              </div>
            </div>

            <div
              style={{
                border: "2px dashed #f59e0b",
                borderRadius: 10,
                padding: "0.3rem 0.4rem",
                background: "rgba(245, 158, 11, 0.03)",
                flex: "1 1 55%",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  color: "#f59e0b",
                  fontSize: "0.65rem",
                  fontWeight: 800,
                  marginBottom: "0.15rem",
                  textAlign: "center",
                }}
              >
                inventory
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.12rem",
                  fontSize: "0.65rem",
                }}
              >
                {(["cheese", "flour", "milk"] as const).map((it) => (
                  <div
                    key={it}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      color: "#6ee7b7",
                      fontWeight: 700,
                    }}
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      ₹{razorPies[it].price}, {it}-{razorPies[it].stock}
                    </span>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.1rem",
                        flexShrink: 0,
                      }}
                    >
                      <button
                        onClick={() => updateSellerStock("razorPies", it, -1)}
                        disabled={isRunning}
                        style={{
                          width: 13,
                          height: 13,
                          borderRadius: 2,
                          background: "rgba(255,255,255,0.1)",
                          border: "none",
                          color: "#fff",
                          cursor: isRunning ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Minus size={7} />
                      </button>
                      <button
                        onClick={() => updateSellerStock("razorPies", it, 1)}
                        disabled={isRunning}
                        style={{
                          width: 13,
                          height: 13,
                          borderRadius: 2,
                          background: "rgba(255,255,255,0.1)",
                          border: "none",
                          color: "#fff",
                          cursor: isRunning ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Plus size={7} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* SELLER 2: Razorcery-1 */}
          <div
            style={{
              display: "flex",
              gap: "0.4rem",
              alignItems: "center",
              minWidth: 0,
            }}
          >
            <div
              style={{
                border: "2px solid #10b981",
                borderRadius: 12,
                background: "#0d1527",
                padding: "0.45rem 0.5rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                flex: "1 1 45%",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  padding: "0.08rem 0.45rem",
                  borderRadius: 5,
                  border: "1.5px solid #ea580c",
                  background: "rgba(234, 88, 12, 0.3)",
                  color: "#fb923c",
                  fontSize: "0.62rem",
                  fontWeight: 800,
                  marginBottom: "0.2rem",
                }}
              >
                agent
              </div>
              <div
                style={{
                  fontSize: "0.78rem",
                  fontWeight: 800,
                  color: "#34d399",
                  whiteSpace: "nowrap",
                }}
              >
                Razorcery-1
              </div>
            </div>

            <div
              style={{
                border: "2px dashed #f59e0b",
                borderRadius: 10,
                padding: "0.3rem 0.4rem",
                background: "rgba(245, 158, 11, 0.03)",
                flex: "1 1 55%",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  color: "#f59e0b",
                  fontSize: "0.65rem",
                  fontWeight: 800,
                  marginBottom: "0.15rem",
                  textAlign: "center",
                }}
              >
                inventory
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.12rem",
                  fontSize: "0.65rem",
                }}
              >
                {(["flour", "tomatoes", "onions"] as const).map((it) => (
                  <div
                    key={it}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      color: "#6ee7b7",
                      fontWeight: 700,
                    }}
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      ₹{razorcery1[it].price}, {it}-{razorcery1[it].stock}
                    </span>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.1rem",
                        flexShrink: 0,
                      }}
                    >
                      <button
                        onClick={() => updateSellerStock("razorcery1", it, -1)}
                        disabled={isRunning}
                        style={{
                          width: 13,
                          height: 13,
                          borderRadius: 2,
                          background: "rgba(255,255,255,0.1)",
                          border: "none",
                          color: "#fff",
                          cursor: isRunning ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Minus size={7} />
                      </button>
                      <button
                        onClick={() => updateSellerStock("razorcery1", it, 1)}
                        disabled={isRunning}
                        style={{
                          width: 13,
                          height: 13,
                          borderRadius: 2,
                          background: "rgba(255,255,255,0.1)",
                          border: "none",
                          color: "#fff",
                          cursor: isRunning ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Plus size={7} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* SELLER 3: Razorcery-2 */}
          <div
            style={{
              display: "flex",
              gap: "0.4rem",
              alignItems: "center",
              minWidth: 0,
            }}
          >
            <div
              style={{
                border: "2px solid #10b981",
                borderRadius: 12,
                background: "#0d1527",
                padding: "0.45rem 0.5rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                flex: "1 1 45%",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  padding: "0.08rem 0.45rem",
                  borderRadius: 5,
                  border: "1.5px solid #ea580c",
                  background: "rgba(234, 88, 12, 0.3)",
                  color: "#fb923c",
                  fontSize: "0.62rem",
                  fontWeight: 800,
                  marginBottom: "0.2rem",
                }}
              >
                agent
              </div>
              <div
                style={{
                  fontSize: "0.78rem",
                  fontWeight: 800,
                  color: "#34d399",
                  whiteSpace: "nowrap",
                }}
              >
                Razorcery-2
              </div>
            </div>

            <div
              style={{
                border: "2px dashed #f59e0b",
                borderRadius: 10,
                padding: "0.3rem 0.4rem",
                background: "rgba(245, 158, 11, 0.03)",
                flex: "1 1 55%",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  color: "#f59e0b",
                  fontSize: "0.65rem",
                  fontWeight: 800,
                  marginBottom: "0.15rem",
                  textAlign: "center",
                }}
              >
                inventory
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.12rem",
                  fontSize: "0.65rem",
                }}
              >
                {(["milk", "tomatoes", "onions"] as const).map((it) => (
                  <div
                    key={it}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      color: "#6ee7b7",
                      fontWeight: 700,
                    }}
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      ₹{razorcery2[it].price}, {it}-{razorcery2[it].stock}
                    </span>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.1rem",
                        flexShrink: 0,
                      }}
                    >
                      <button
                        onClick={() => updateSellerStock("razorcery2", it, -1)}
                        disabled={isRunning}
                        style={{
                          width: 13,
                          height: 13,
                          borderRadius: 2,
                          background: "rgba(255,255,255,0.1)",
                          border: "none",
                          color: "#fff",
                          cursor: isRunning ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Minus size={7} />
                      </button>
                      <button
                        onClick={() => updateSellerStock("razorcery2", it, 1)}
                        disabled={isRunning}
                        style={{
                          width: 13,
                          height: 13,
                          borderRadius: 2,
                          background: "rgba(255,255,255,0.1)",
                          border: "none",
                          color: "#fff",
                          cursor: isRunning ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Plus size={7} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ACTION CONTROLS & ADD ORDER BAR */}
      <div
        style={{
          marginTop: "1.1rem",
          paddingTop: "0.85rem",
          borderTop: "1px solid rgba(255, 255, 255, 0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.75rem",
          position: "relative",
          zIndex: 2,
        }}
      >
        {/* Left: Quick Add Customer Orders */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700 }}
          >
            + Add to Line:
          </span>
          <button
            onClick={() => handleAddOrder("margherita")}
            disabled={isRunning}
            style={{
              padding: "0.25rem 0.55rem",
              borderRadius: 6,
              background: "rgba(13, 148, 251, 0.15)",
              border: "1px solid rgba(13, 148, 251, 0.3)",
              fontSize: "0.7rem",
              color: "#38bdf8",
              cursor: isRunning ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
          >
            + Margherita
          </button>
          <button
            onClick={() => handleAddOrder("farm_fresh")}
            disabled={isRunning}
            style={{
              padding: "0.25rem 0.55rem",
              borderRadius: 6,
              background: "rgba(13, 148, 251, 0.15)",
              border: "1px solid rgba(13, 148, 251, 0.3)",
              fontSize: "0.7rem",
              color: "#38bdf8",
              cursor: isRunning ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
          >
            + Farm Fresh
          </button>
          <button
            onClick={() => handleAddOrder("shake")}
            disabled={isRunning}
            style={{
              padding: "0.25rem 0.55rem",
              borderRadius: 6,
              background: "rgba(13, 148, 251, 0.15)",
              border: "1px solid rgba(13, 148, 251, 0.3)",
              fontSize: "0.7rem",
              color: "#38bdf8",
              cursor: isRunning ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
          >
            + Milk Shake
          </button>
        </div>

        {/* Right: Simulation Action Buttons */}
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {/* Step Next Order Button */}
          <button
            onClick={() => processNextOrder()}
            disabled={isRunning || orderQueue.length === 0 || isAutoSimulating || isFulfillingOrder}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.55rem 1rem",
              borderRadius: 8,
              background:
                isRunning || orderQueue.length === 0 || isAutoSimulating || isFulfillingOrder
                  ? "#334155"
                  : "rgba(255, 255, 255, 0.1)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              color: "#ffffff",
              fontSize: "0.78rem",
              fontWeight: 700,
              cursor:
                isRunning || orderQueue.length === 0 || isAutoSimulating || isFulfillingOrder
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {isFulfillingOrder ? (
              <>
                <Clock size={14} />
                <span>Baking & Serving...</span>
              </>
            ) : (
              <>
                <ArrowRight size={14} />
                <span>Fulfill Next Order</span>
              </>
            )}
          </button>

          {/* Auto-Simulate Toggle Button */}
          <button
            onClick={() => setIsAutoSimulating(!isAutoSimulating)}
            disabled={
              isRunning || (orderQueue.length === 0 && !isAutoSimulating)
            }
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.55rem 1.25rem",
              borderRadius: 8,
              background: isAutoSimulating
                ? "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)"
                : isRunning
                  ? "#475569"
                  : "linear-gradient(135deg, #0D94FB 0%, #012652 100%)",
              border: "1px solid rgba(255, 255, 255, 0.25)",
              color: "#ffffff",
              fontSize: "0.82rem",
              fontWeight: 800,
              cursor:
                isRunning || (orderQueue.length === 0 && !isAutoSimulating)
                  ? "not-allowed"
                  : "pointer",
              boxShadow: isAutoSimulating
                ? "0 4px 14px rgba(220, 38, 38, 0.4)"
                : "0 4px 14px rgba(13, 148, 251, 0.4)",
            }}
          >
            {isAutoSimulating ? (
              <>
                <Pause size={14} fill="#ffffff" />
                <span>Pause Auto-Simulation</span>
              </>
            ) : isRunning ? (
              <>
                <div
                  style={{
                    width: 13,
                    height: 13,
                    border: "2px solid #ffffff",
                    borderTopColor: "transparent",
                    borderRadius: "50%",
                    animation: "spin 1s linear infinite",
                  }}
                />
                <span>Negotiating Deals...</span>
              </>
            ) : (
              <>
                <Play size={14} fill="#ffffff" />
                <span>Auto-Simulate All Orders</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* DEDICATED KITCHEN ORDER EVENT LOG FEED */}
      <div
        style={{
          marginTop: "1rem",
          background: "rgba(10, 15, 29, 0.75)",
          border: "1px solid #1e293b",
          borderRadius: 8,
          padding: "0.75rem",
          position: "relative",
          zIndex: 2,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "0.5rem",
          }}
        >
          <div
            style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}
          >
            <Utensils size={15} color="#38bdf8" />
            <span
              style={{ fontSize: "0.78rem", fontWeight: 800, color: "#e2e8f0" }}
            >
              Kitchen Order Agent Log (Internal Events)
            </span>
          </div>
          <span style={{ fontSize: "0.68rem", color: "#94a3b8" }}>
            Deterministic kitchen runner stock events & par triggers (Distinct
            from A2A Audit Trace)
          </span>
        </div>

        <div
          style={{
            maxHeight: 130,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "0.35rem",
            paddingRight: "0.25rem",
          }}
        >
          {kitchenLogs.map((log) => {
            let badgeBg = "rgba(13, 148, 251, 0.15)";
            let badgeColor = "#38bdf8";
            let borderColor = "rgba(13, 148, 251, 0.3)";

            if (log.type === "inventory_event") {
              badgeBg = "rgba(13, 148, 136, 0.18)";
              badgeColor = "#2dd4bf";
              borderColor = "rgba(13, 148, 136, 0.4)";
            } else if (log.type === "order_served") {
              badgeBg = "rgba(16, 185, 129, 0.18)";
              badgeColor = "#4ade80";
              borderColor = "rgba(16, 185, 129, 0.4)";
            } else if (log.type === "par_trigger") {
              badgeBg = "rgba(239, 68, 68, 0.18)";
              badgeColor = "#fca5a5";
              borderColor = "rgba(239, 68, 68, 0.4)";
            } else if (log.type === "restocked") {
              badgeBg = "rgba(168, 85, 247, 0.18)";
              badgeColor = "#c084fc";
              borderColor = "rgba(168, 85, 247, 0.4)";
            } else if (log.type === "a2a_procure") {
              badgeBg = "rgba(245, 158, 11, 0.18)";
              badgeColor = "#fde68a";
              borderColor = "rgba(245, 158, 11, 0.4)";
            } else if (log.type === "error") {
              badgeBg = "rgba(239, 68, 68, 0.25)";
              badgeColor = "#ef4444";
              borderColor = "rgba(239, 68, 68, 0.6)";
            }

            return (
              <div
                key={log.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.5rem",
                  background: "rgba(15, 23, 42, 0.5)",
                  border: `1px solid ${borderColor}`,
                  borderRadius: 6,
                  padding: "0.35rem 0.55rem",
                  fontSize: "0.72rem",
                }}
              >
                <span
                  style={{
                    fontSize: "0.62rem",
                    color: "#64748b",
                    fontFamily: "monospace",
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                >
                  {log.time}
                </span>

                <span
                  style={{
                    background: badgeBg,
                    color: badgeColor,
                    fontSize: "0.62rem",
                    fontWeight: 800,
                    padding: "0.1rem 0.35rem",
                    borderRadius: 4,
                    flexShrink: 0,
                    textTransform: "uppercase",
                  }}
                >
                  {log.type.replace("_", " ")}
                </span>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.1rem",
                    minWidth: 0,
                  }}
                >
                  <span style={{ fontWeight: 700, color: "#f1f5f9" }}>
                    {log.title}
                  </span>
                  <span style={{ color: "#94a3b8", fontSize: "0.68rem" }}>
                    {log.detail}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default RazorSliceArchitecture;
