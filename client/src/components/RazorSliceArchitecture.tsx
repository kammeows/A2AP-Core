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
} from "lucide-react";
import { NegotiationResult } from "../types";

export interface RazorSliceArchitectureProps {
  onRunAi: (
    scenario?: "happy" | "failure" | "custom",
    customOptions?: any,
  ) => Promise<NegotiationResult | null> | void;
  isRunning: boolean;
  delegationMode: "full" | "partial";
  latestResult: NegotiationResult | null;
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
    | "order_taken"
    | "kitchen_check"
    | "deficit"
    | "a2a_procure"
    | "restocked"
    | "order_served"
    | "info";
  title: string;
  detail: string;
}

const DEFAULT_ORDERS: CustomerOrder[] = [
  {
    id: 1,
    name: "Margherita Pizza",
    recipe: { flour: 2, cheese: 2, tomatoes: 1 },
    price: "₹299",
    status: "queued",
  },
  {
    id: 2,
    name: "Farm Fresh Pizza",
    recipe: { flour: 2, cheese: 1, tomatoes: 1, onions: 2 },
    price: "₹349",
    status: "queued",
  },
  {
    id: 3,
    name: "Margherita Pizza + Milk Shake",
    recipe: { flour: 2, cheese: 2, tomatoes: 1, milk: 2 },
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
}) => {
  // 1. RazorSlice Buyer Stock State (from main-idea.md: cheese-3, flour-5, tomatoes-6, onions-5, milk-7, target=15)
  const [buyerStock, setBuyerStock] = useState<BuyerPantry>({
    cheese: 3,
    flour: 5,
    tomatoes: 6,
    onions: 5,
    milk: 7,
    targetStock: 15,
  });

  // 2. Seller 1: RazorPies (sells cheese, milk, flour)
  const [razorPies, setRazorPies] = useState<SellerInventory>({
    cheese: { stock: 10, price: 4 },
    flour: { stock: 6, price: 8 },
    milk: { stock: 4, price: 9 },
  });

  // 3. Seller 2: Razorcery-1 (sells flour, tomatoes, onions)
  const [razorcery1, setRazorcery1] = useState<SellerInventory>({
    flour: { stock: 10, price: 6 },
    tomatoes: { stock: 6, price: 4 },
    onions: { stock: 4, price: 4 },
  });

  // 4. Seller 3: Razorcery-2 (sells tomatoes, onions, milk)
  const [razorcery2, setRazorcery2] = useState<SellerInventory>({
    milk: { stock: 10, price: 10 },
    tomatoes: { stock: 6, price: 3 },
    onions: { stock: 4, price: 5 },
  });

  // Dynamic Customer Order Queue & Fulfillment States
  const [orderQueue, setOrderQueue] = useState<CustomerOrder[]>(DEFAULT_ORDERS);
  const [completedOrders, setCompletedOrders] = useState<CustomerOrder[]>([]);
  const [activeProcessingOrder, setActiveProcessingOrder] = useState<CustomerOrder | null>(null);
  const [isAutoSimulating, setIsAutoSimulating] = useState<boolean>(false);
  const nextOrderIdRef = useRef<number>(5);

  // Kitchen Activity & Order Log
  const [kitchenLogs, setKitchenLogs] = useState<KitchenLogEntry[]>([
    {
      id: "log_init",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      type: "info",
      title: "Kitchen Simulation Ready",
      detail: "4 customer orders queued at the RazorSlice front counter. Autonomous procurement engine monitoring pantry stock.",
    },
  ]);

  const addLog = (
    type: KitchenLogEntry["type"],
    title: string,
    detail: string,
    orderId?: number
  ) => {
    const newEntry: KitchenLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
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

  const lastProcessedThreadRef = useRef<string | null>(null);

  const normalizeKey = (name: string): keyof BuyerPantry => {
    const s = (name || "").toLowerCase().trim();
    if (s.startsWith("flour")) return "flour";
    if (s.startsWith("cheese")) return "cheese";
    if (s.startsWith("milk")) return "milk";
    if (s.startsWith("tomat")) return "tomatoes";
    if (s.startsWith("onion")) return "onions";
    return s as keyof BuyerPantry;
  };

  // Sync confirmed transactions from A2A Multi-Seller network
  useEffect(() => {
    if (
      latestResult &&
      (latestResult.status === "CONFIRMED" || latestResult.status === "RENEGOTIATED_AND_CONFIRMED")
    ) {
      const eventKey = `${latestResult.thread_id || "direct"}_${latestResult.status}_${latestResult.order_id || ""}`;
      if (lastProcessedThreadRef.current === eventKey) {
        return;
      }
      lastProcessedThreadRef.current = eventKey;

      const purchasedList: Array<{ seller_id: string; item: string; quantity: number }> = [];

      if (latestResult.purchased_items && latestResult.purchased_items.length > 0) {
        for (const p of latestResult.purchased_items) {
          purchasedList.push({
            seller_id: p.seller_id,
            item: p.item,
            quantity: Number(p.quantity) || 1,
          });
        }
      } else if (latestResult.pending_offer) {
        purchasedList.push({
          seller_id: latestResult.pending_offer.seller_id || "agent:seller:razorcery_1",
          item: latestResult.pending_offer.item,
          quantity: Number(latestResult.pending_offer.quantity_kg) || 1,
        });
      }

      if (purchasedList.length > 0) {
        const itemSummaryList: Array<{ item: string; quantity: number; seller: string }> = [];

        // 1. Increment Buyer Pantry Stock
        setBuyerStock((prev) => {
          const next = { ...prev };
          for (const p of purchasedList) {
            const pantryKey = normalizeKey(p.item);
            if (pantryKey in next && typeof next[pantryKey] === "number") {
              next[pantryKey] = (next[pantryKey] as number) + p.quantity;
            }
          }
          return next;
        });

        // 2. Decrement Seller Stock
        for (const p of purchasedList) {
          const norm = normalizeKey(p.item);
          const sid = (p.seller_id || "").toLowerCase();

          let matchedSellerName = "Wholesale Grocery";
          const isPies = sid.includes("pies") || sid.includes("razor_pies") || norm === "cheese";
          const isCery1 = sid.includes("razorcery_1") || sid.includes("fresh #1") || (norm === "flour" && !sid.includes("pies")) || (norm === "onions" && !sid.includes("razorcery_2"));
          const isCery2 = sid.includes("razorcery_2") || sid.includes("dairy & veg #2") || (norm === "tomatoes" && !sid.includes("razorcery_1"));

          if (isPies && !sid.includes("razorcery_1") && !sid.includes("razorcery_2")) {
            matchedSellerName = "RazorPies";
            setRazorPies((prev) => {
              const k = Object.keys(prev).find((key) => normalizeKey(key) === norm);
              if (k && prev[k]) {
                return {
                  ...prev,
                  [k]: { ...prev[k], stock: Math.max(0, prev[k].stock - p.quantity) },
                };
              }
              return prev;
            });
          } else if (isCery1 && !sid.includes("razorcery_2")) {
            matchedSellerName = "Razorcery-1";
            setRazorcery1((prev) => {
              const k = Object.keys(prev).find((key) => normalizeKey(key) === norm);
              if (k && prev[k]) {
                return {
                  ...prev,
                  [k]: { ...prev[k], stock: Math.max(0, prev[k].stock - p.quantity) },
                };
              }
              return prev;
            });
          } else if (isCery2) {
            matchedSellerName = "Razorcery-2";
            setRazorcery2((prev) => {
              const k = Object.keys(prev).find((key) => normalizeKey(key) === norm);
              if (k && prev[k]) {
                return {
                  ...prev,
                  [k]: { ...prev[k], stock: Math.max(0, prev[k].stock - p.quantity) },
                };
              }
              return prev;
            });
          } else {
            matchedSellerName = "Razorcery-1 & RazorPies";
            setRazorcery1((prev) => {
              const k = Object.keys(prev).find((key) => normalizeKey(key) === norm);
              if (k && prev[k] && prev[k].stock > 0) {
                return {
                  ...prev,
                  [k]: { ...prev[k], stock: Math.max(0, prev[k].stock - p.quantity) },
                };
              }
              return prev;
            });
            setRazorPies((prev) => {
              const k = Object.keys(prev).find((key) => normalizeKey(key) === norm);
              if (k && prev[k] && prev[k].stock > 0) {
                return {
                  ...prev,
                  [k]: { ...prev[k], stock: Math.max(0, prev[k].stock - p.quantity) },
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

        const bannerText = `Payment Confirmed! Restocked ${purchasedList.map((p) => `+${p.quantity} ${p.item}`).join(", ")}`;
        setRestockNotification({
          text: bannerText,
          items: itemSummaryList,
        });

        addLog(
          "restocked",
          `Restocked from A2A Groceries`,
          `Procured: ${purchasedList.map((p) => `${p.quantity}u ${p.item}`).join(", ")} | Groceries stock decremented | Total Paid: ₹${latestResult.total_amount || 0}`
        );

        const timer = setTimeout(() => {
          setRestockNotification(null);
        }, 6000);
        return () => clearTimeout(timer);
      }
    }
  }, [latestResult]);

  // Real-time deficit calculation across entire current queue demand
  const queueTotalRequirements = orderQueue.reduce(
    (acc, ord) => {
      acc.flour += ord.recipe.flour || 0;
      acc.cheese += ord.recipe.cheese || 0;
      acc.tomatoes += ord.recipe.tomatoes || 0;
      acc.onions += ord.recipe.onions || 0;
      acc.milk += ord.recipe.milk || 0;
      return acc;
    },
    { flour: 0, cheese: 0, tomatoes: 0, onions: 0, milk: 0 }
  );

  const deficits = {
    flour: Math.max(0, queueTotalRequirements.flour - buyerStock.flour),
    cheese: Math.max(0, queueTotalRequirements.cheese - buyerStock.cheese),
    tomatoes: Math.max(0, queueTotalRequirements.tomatoes - buyerStock.tomatoes),
    onions: Math.max(0, queueTotalRequirements.onions - buyerStock.onions),
    milk: Math.max(0, queueTotalRequirements.milk - buyerStock.milk),
  };

  const totalDeficitUnits =
    deficits.flour +
    deficits.cheese +
    deficits.tomatoes +
    deficits.onions +
    deficits.milk;

  // Single Order Processor Engine
  const processNextOrder = async (): Promise<boolean> => {
    if (orderQueue.length === 0) {
      addLog("info", "Queue Complete", "All customer orders have been successfully fulfilled & served!");
      setIsAutoSimulating(false);
      return false;
    }

    const currentOrder = orderQueue[0];
    setActiveProcessingOrder(currentOrder);

    addLog(
      "order_taken",
      `Order #${currentOrder.id} (${currentOrder.name}) at Front Counter`,
      `Customer waiting. Checking pantry stock for required ingredients...`,
      currentOrder.id
    );

    // Calculate deficits specifically for this order
    const orderDeficits: Array<{ item: string; quantity: number }> = [];
    (Object.keys(currentOrder.recipe) as Array<keyof BuyerPantry>).forEach((k) => {
      if (k === "targetStock") return;
      const needed = currentOrder.recipe[k] || 0;
      const current = buyerStock[k] || 0;
      if (needed > current) {
        orderDeficits.push({
          item: k,
          quantity: needed - current,
        });
      }
    });

    if (orderDeficits.length === 0) {
      // 1. Sufficient Stock: Prepare & Serve directly
      addLog(
        "kitchen_check",
        `Stock Available for Order #${currentOrder.id}`,
        `Pantry contains all ingredients. Preparing ${currentOrder.name}...`,
        currentOrder.id
      );

      await new Promise((r) => setTimeout(r, 650));

      // Decrement pantry stock for the recipe
      setBuyerStock((prev) => {
        const updated = { ...prev };
        (Object.keys(currentOrder.recipe) as Array<keyof BuyerPantry>).forEach((k) => {
          if (k !== "targetStock" && currentOrder.recipe[k]) {
            updated[k] = Math.max(0, (updated[k] as number) - (currentOrder.recipe[k] as number));
          }
        });
        return updated;
      });

      // Mark served and shift queue
      const servedOrder = { ...currentOrder, status: "served" as const };
      setOrderQueue((prev) => prev.slice(1));
      setCompletedOrders((prev) => [servedOrder, ...prev]);
      setActiveProcessingOrder(null);

      addLog(
        "order_served",
        `✅ Order #${currentOrder.id} (${currentOrder.name}) SERVED!`,
        `Delivered to customer! Next order in line is advancing to the counter.`,
        currentOrder.id
      );

      return true;
    } else {
      // 2. Deficit detected: Trigger Concurrent A2A Procurement
      addLog(
        "deficit",
        `⚠️ Stock Deficit on Order #${currentOrder.id}`,
        `Missing: ${orderDeficits.map((d) => `${d.quantity}u ${d.item}`).join(", ")}. Triggering autonomous concurrent A2A procurement with Groceries...`,
        currentOrder.id
      );

      addLog(
        "a2a_procure",
        `Concurrent RFQ Broadcast`,
        `Contacting RazorPies, Razorcery-1, Razorcery-2 concurrently for ${orderDeficits.map((d) => `${d.quantity}u ${d.item}`).join(", ")}...`,
        currentOrder.id
      );

      // Trigger Multi-Item Negotiation
      const res = await onRunAi("custom", {
        itemsToProcure: orderDeficits,
        buyerStockKg: buyerStock.flour,
        sellerStockKg: razorPies.cheese.stock + razorcery1.flour.stock + razorcery2.milk.stock,
        buyerTargetStockKg: buyerStock.targetStock,
      });

      if (res && res.status === "CONFIRMED") {
        await new Promise((r) => setTimeout(r, 700));

        // After stock updated, bake and serve the pizza
        setBuyerStock((prev) => {
          const updated = { ...prev };
          (Object.keys(currentOrder.recipe) as Array<keyof BuyerPantry>).forEach((k) => {
            if (k !== "targetStock" && currentOrder.recipe[k]) {
              updated[k] = Math.max(0, (updated[k] as number) - (currentOrder.recipe[k] as number));
            }
          });
          return updated;
        });

        const servedOrder = { ...currentOrder, status: "served" as const };
        setOrderQueue((prev) => prev.slice(1));
        setCompletedOrders((prev) => [servedOrder, ...prev]);
        setActiveProcessingOrder(null);

        addLog(
          "order_served",
          `✅ Order #${currentOrder.id} (${currentOrder.name}) SERVED!`,
          `Freshly prepared with restocked ingredients and handed to customer!`,
          currentOrder.id
        );

        return true;
      } else {
        addLog(
          "deficit",
          `Procurement Pending / Policy Pause`,
          `Order #${currentOrder.id} paused pending human authorization or payment resolution.`,
          currentOrder.id
        );
        setIsAutoSimulating(false);
        return false;
      }
    }
  };

  // Continuous Auto-Simulation loop
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    if (isAutoSimulating && !isRunning && orderQueue.length > 0) {
      timeoutId = setTimeout(() => {
        processNextOrder();
      }, 1400);
    } else if (orderQueue.length === 0 && isAutoSimulating) {
      setIsAutoSimulating(false);
    }
    return () => clearTimeout(timeoutId);
  }, [isAutoSimulating, isRunning, orderQueue]);

  // Preset Handlers
  const applyPreset = (preset: "default" | "stocked" | "no_seller" | "over_cap") => {
    if (preset === "default") {
      setBuyerStock({ cheese: 3, flour: 5, tomatoes: 6, onions: 5, milk: 7, targetStock: 15 });
      setRazorPies({
        cheese: { stock: 10, price: 4 },
        flour: { stock: 6, price: 8 },
        milk: { stock: 4, price: 9 },
      });
      setRazorcery1({
        flour: { stock: 10, price: 6 },
        tomatoes: { stock: 6, price: 4 },
        onions: { stock: 4, price: 4 },
      });
      setRazorcery2({
        milk: { stock: 10, price: 10 },
        tomatoes: { stock: 6, price: 3 },
        onions: { stock: 4, price: 5 },
      });
      setOrderQueue(DEFAULT_ORDERS);
      setCompletedOrders([]);
      addLog("info", "Reset to Default", "Pantry and Seller inventories restored to default demo values.");
    } else if (preset === "stocked") {
      setBuyerStock({ cheese: 12, flour: 15, tomatoes: 12, onions: 10, milk: 12, targetStock: 15 });
      addLog("info", "Stocked Preset", "Pantry stock filled to surplus levels. Orders will fulfill without needing A2A procurement.");
    } else if (preset === "no_seller") {
      setBuyerStock({ cheese: 1, flour: 1, tomatoes: 1, onions: 1, milk: 1, targetStock: 15 });
      setRazorPies({ cheese: { stock: 0, price: 4 }, flour: { stock: 0, price: 8 }, milk: { stock: 0, price: 9 } });
      setRazorcery1({ flour: { stock: 0, price: 6 }, tomatoes: { stock: 0, price: 4 }, onions: { stock: 0, price: 4 } });
      setRazorcery2({ milk: { stock: 0, price: 10 }, tomatoes: { stock: 0, price: 3 }, onions: { stock: 0, price: 5 } });
      addLog("info", "Zero Seller Stock Preset", "All groceries set to 0 stock to test seller out-of-stock rejection.");
    } else if (preset === "over_cap") {
      setBuyerStock({ cheese: 0, flour: 0, tomatoes: 0, onions: 0, milk: 0, targetStock: 50 });
      setRazorPies({ cheese: { stock: 50, price: 40 }, flour: { stock: 50, price: 50 }, milk: { stock: 50, price: 50 } });
      addLog("info", "Breach Cap Demo", "Pantry empty and seller prices increased to trigger bounded policy caps.");
    }
  };

  // Add extra order to queue
  const handleAddOrder = (recipeType: "margherita" | "farm_fresh" | "shake") => {
    const id = nextOrderIdRef.current++;
    let newOrd: CustomerOrder;
    if (recipeType === "margherita") {
      newOrd = { id, name: "Margherita Pizza", recipe: { flour: 2, cheese: 2, tomatoes: 1 }, price: "₹299", status: "queued" };
    } else if (recipeType === "farm_fresh") {
      newOrd = { id, name: "Farm Fresh Pizza", recipe: { flour: 2, cheese: 1, tomatoes: 1, onions: 2 }, price: "₹349", status: "queued" };
    } else {
      newOrd = { id, name: "Milk Shake", recipe: { milk: 2 }, price: "₹120", status: "queued" };
    }
    setOrderQueue((prev) => [...prev, newOrd]);
    addLog("order_taken", `New Customer Arrived: Order #${id}`, `Added ${newOrd.name} to the back of the queue.`, id);
  };

  // Steppers for buyer stock
  const updateBuyerItem = (item: keyof BuyerPantry, delta: number) => {
    if (isRunning) return;
    setBuyerStock((prev) => ({
      ...prev,
      [item]: Math.max(0, prev[item] + delta),
    }));
  };

  // Stepper for seller item stock
  const updateSellerStock = (
    seller: "razorPies" | "razorcery1" | "razorcery2",
    item: string,
    delta: number
  ) => {
    if (isRunning) return;
    if (seller === "razorPies") {
      setRazorPies((prev) => ({
        ...prev,
        [item]: { ...prev[item], stock: Math.max(0, prev[item].stock + delta) },
      }));
    } else if (seller === "razorcery1") {
      setRazorcery1((prev) => ({
        ...prev,
        [item]: { ...prev[item], stock: Math.max(0, prev[item].stock + delta) },
      }));
    } else if (seller === "razorcery2") {
      setRazorcery2((prev) => ({
        ...prev,
        [item]: { ...prev[item], stock: Math.max(0, prev[item].stock + delta) },
      }));
    }
  };

  // Stepper for seller price
  const updateSellerPrice = (
    seller: "razorPies" | "razorcery1" | "razorcery2",
    item: string,
    delta: number
  ) => {
    if (isRunning) return;
    if (seller === "razorPies") {
      setRazorPies((prev) => ({
        ...prev,
        [item]: { ...prev[item], price: Math.max(1, prev[item].price + delta) },
      }));
    } else if (seller === "razorcery1") {
      setRazorcery1((prev) => ({
        ...prev,
        [item]: { ...prev[item], price: Math.max(1, prev[item].price + delta) },
      }));
    } else if (seller === "razorcery2") {
      setRazorcery2((prev) => ({
        ...prev,
        [item]: { ...prev[item], price: Math.max(1, prev[item].price + delta) },
      }));
    }
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
        marginBottom: "1.5rem",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background Blueprint Grid Lines */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "radial-gradient(rgba(13, 148, 251, 0.08) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          pointerEvents: "none",
          opacity: 0.8,
        }}
      />

      {/* Restock Live Notification Banner */}
      {restockNotification && (
        <div
          style={{
            position: "relative",
            zIndex: 10,
            background: "linear-gradient(90deg, rgba(16, 185, 129, 0.25) 0%, rgba(13, 148, 251, 0.25) 100%)",
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
            <span style={{ fontWeight: 700, color: "#ffffff", fontSize: "0.85rem" }}>
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

      {/* Top Header & Presets */}
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
        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <ChefHat size={20} color="#38bdf8" />
            <h2
              style={{
                fontSize: "1.1rem",
                fontWeight: 800,
                color: "#ffffff",
                letterSpacing: "-0.01em",
                margin: 0,
              }}
            >
              RazorSlice Kitchen & Multi-Seller A2A Simulation
            </h2>
          </div>
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
            Default Setup
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
            onClick={() => applyPreset("no_seller")}
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
            Zero Seller Stock
          </button>
          <button
            onClick={() => applyPreset("over_cap")}
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
            Policy Cap Demo
          </button>
        </div>
      </div>

      {/* TOP: Menu Card (Sky blue rounded box matching image.png) */}
      <div
        style={{
          border: "2px solid #0D94FB",
          borderRadius: 12,
          padding: "0.65rem 0.9rem",
          background: "rgba(13, 148, 251, 0.05)",
          marginBottom: "1rem",
          position: "relative",
          zIndex: 2,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "0.35rem",
          }}
        >
          <span
            style={{
              color: "#38bdf8",
              fontSize: "0.85rem",
              fontWeight: 800,
              letterSpacing: "0.02em",
            }}
          >
            Menu Recipes
          </span>
          <span style={{ fontSize: "0.7rem", color: "#94a3b8", fontStyle: "italic" }}>
            Ingredients consumed per order & monitored continuously
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "0.5rem",
            fontSize: "0.75rem",
            color: "#e2e8f0",
          }}
        >
          <div
            style={{
              background: "rgba(15, 23, 42, 0.6)",
              padding: "0.4rem 0.6rem",
              borderRadius: 6,
              border: "1px solid rgba(13, 148, 251, 0.2)",
            }}
          >
            <div style={{ fontWeight: 700, color: "#38bdf8" }}>Margherita</div>
            <div style={{ color: "#cbd5e1", fontSize: "0.72rem" }}>
              = -2 Flour, -2 Cheese, -1 Tomato
            </div>
          </div>

          <div
            style={{
              background: "rgba(15, 23, 42, 0.6)",
              padding: "0.4rem 0.6rem",
              borderRadius: 6,
              border: "1px solid rgba(13, 148, 251, 0.2)",
            }}
          >
            <div style={{ fontWeight: 700, color: "#38bdf8" }}>Farm fresh</div>
            <div style={{ color: "#cbd5e1", fontSize: "0.72rem" }}>
              = -2 Flour, -1 Cheese, -1 Tomato, -2 Onions
            </div>
          </div>

          <div
            style={{
              background: "rgba(15, 23, 42, 0.6)",
              padding: "0.4rem 0.6rem",
              borderRadius: 6,
              border: "1px solid rgba(13, 148, 251, 0.2)",
            }}
          >
            <div style={{ fontWeight: 700, color: "#38bdf8" }}>Milk shake</div>
            <div style={{ color: "#cbd5e1", fontSize: "0.72rem" }}>= -2 Milk</div>
          </div>
        </div>
      </div>

      {/* MAIN DIAGRAM CANVAS: RazorSlice + Inventory + Queue + Connections + 3 Sellers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(310px, 1.25fr) 60px minmax(290px, 1.15fr)",
          gap: "0.5rem",
          alignItems: "start",
          position: "relative",
          zIndex: 2,
        }}
      >
        {/* LEFT COLUMN: RazorSlice Inventory Box + RazorSlice Agent + Dynamic Customer Queue */}
        <div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.1fr 0.9fr",
              gap: "0.6rem",
              alignItems: "start",
            }}
          >
            {/* RazorSlice Inventory Box (Dashed Orange Border) */}
            <div
              style={{
                border: "2px dashed #f59e0b",
                borderRadius: 12,
                padding: "0.6rem",
                background: "rgba(245, 158, 11, 0.03)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "0.4rem",
                }}
              >
                <span
                  style={{
                    color: "#f59e0b",
                    fontSize: "0.78rem",
                    fontWeight: 800,
                    textTransform: "lowercase",
                  }}
                >
                  inventory
                </span>
                <span
                  style={{
                    color: "#94a3b8",
                    fontSize: "0.62rem",
                    background: "rgba(245, 158, 11, 0.12)",
                    padding: "0.15rem 0.35rem",
                    borderRadius: 4,
                  }}
                >
                  Pantry Stock
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {[
                  { key: "cheese" as const, name: "cheese", required: queueTotalRequirements.cheese },
                  { key: "flour" as const, name: "flour", required: queueTotalRequirements.flour },
                  { key: "tomatoes" as const, name: "tomatoes", required: queueTotalRequirements.tomatoes },
                  { key: "onions" as const, name: "onions", required: queueTotalRequirements.onions },
                  { key: "milk" as const, name: "milk", required: queueTotalRequirements.milk },
                ].map((item) => {
                  const currentVal = buyerStock[item.key];
                  const isDeficit = item.required > currentVal;
                  const deficit = Math.max(0, item.required - currentVal);

                  return (
                    <div
                      key={item.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        background: isDeficit ? "rgba(239, 68, 68, 0.12)" : "rgba(15, 23, 42, 0.6)",
                        border: isDeficit ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid transparent",
                        padding: "0.22rem 0.4rem",
                        borderRadius: 6,
                        transition: "all 0.2s ease",
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span
                          style={{
                            fontSize: "0.72rem",
                            color: isDeficit ? "#fca5a5" : "#e2e8f0",
                            fontWeight: 600,
                          }}
                        >
                          {item.name}-{currentVal}
                        </span>
                        <span style={{ fontSize: "0.58rem", color: "#94a3b8" }}>
                          Need {item.required}u{" "}
                          {isDeficit && (
                            <strong style={{ color: "#ef4444" }}>(-{deficit})</strong>
                          )}
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
                        <button
                          onClick={() => updateBuyerItem(item.key, -1)}
                          disabled={isRunning}
                          style={{
                            width: 17,
                            height: 17,
                            borderRadius: 4,
                            background: "rgba(255, 255, 255, 0.1)",
                            border: "none",
                            color: "#ffffff",
                            cursor: isRunning ? "not-allowed" : "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Minus size={9} />
                        </button>
                        <span
                          style={{
                            fontSize: "0.76rem",
                            fontWeight: 800,
                            color: isDeficit ? "#f87171" : "#38bdf8",
                            minWidth: 14,
                            textAlign: "center",
                          }}
                        >
                          {currentVal}
                        </span>
                        <button
                          onClick={() => updateBuyerItem(item.key, 1)}
                          disabled={isRunning}
                          style={{
                            width: 17,
                            height: 17,
                            borderRadius: 4,
                            background: "rgba(255, 255, 255, 0.1)",
                            border: "none",
                            color: "#ffffff",
                            cursor: isRunning ? "not-allowed" : "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Plus size={9} />
                        </button>
                      </div>
                    </div>
                  );
                })}

                <div
                  style={{
                    marginTop: "0.2rem",
                    fontSize: "0.65rem",
                    color: "#fbbf24",
                    fontWeight: 700,
                    textAlign: "center",
                    padding: "0.2rem",
                    background: "rgba(245, 158, 11, 0.1)",
                    borderRadius: 4,
                  }}
                >
                  target stock = {buyerStock.targetStock}
                </div>
              </div>
            </div>

            {/* RazorSlice Agent Box + Customer Order Queue */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div
                style={{
                  width: "100%",
                  border: "2px solid #ffffff",
                  borderRadius: 14,
                  background: "#0d1527",
                  padding: "0.65rem 0.5rem 0.35rem",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  boxShadow: "0 0 16px rgba(255, 255, 255, 0.12)",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    padding: "0.12rem 0.55rem",
                    borderRadius: 6,
                    border: "1.5px solid #ea580c",
                    background: "rgba(234, 88, 12, 0.25)",
                    color: "#fb923c",
                    fontSize: "0.68rem",
                    fontWeight: 800,
                    marginBottom: "0.3rem",
                    letterSpacing: "0.02em",
                  }}
                >
                  Buyer Agent
                </div>

                <div
                  style={{
                    fontSize: "0.9rem",
                    fontWeight: 800,
                    color: "#ffffff",
                    marginBottom: "0.45rem",
                  }}
                >
                  RazorSlice
                </div>

                {/* Gate at the bottom [----] */}
                <div
                  style={{
                    width: "85%",
                    borderTop: "2px dashed #94a3b8",
                    borderLeft: "2px dashed #94a3b8",
                    borderRight: "2px dashed #94a3b8",
                    borderTopLeftRadius: 4,
                    borderTopRightRadius: 4,
                    padding: "0.1rem 0.2rem",
                    textAlign: "center",
                    fontSize: "0.58rem",
                    color: "#94a3b8",
                    background: "rgba(148, 163, 184, 0.08)",
                  }}
                >
                  [ Counter Gate ]
                </div>
              </div>

              {/* Dynamic Customer Order Queue in Front of Gate */}
              <div
                style={{
                  width: "100%",
                  marginTop: "0.5rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.35rem",
                }}
              >
                {orderQueue.length === 0 ? (
                  <div
                    style={{
                      background: "rgba(16, 185, 129, 0.1)",
                      border: "1px dashed #10b981",
                      borderRadius: 8,
                      padding: "0.6rem 0.4rem",
                      textAlign: "center",
                      color: "#6ee7b7",
                      fontSize: "0.72rem",
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
                          gap: "0.4rem",
                          background: isFront
                            ? "linear-gradient(90deg, rgba(13, 148, 251, 0.22) 0%, rgba(13, 148, 251, 0.08) 100%)"
                            : "rgba(13, 148, 251, 0.06)",
                          border: isFront ? "1.5px solid #0D94FB" : "1px solid rgba(13, 148, 251, 0.2)",
                          borderRadius: 18,
                          padding: "0.2rem 0.45rem 0.2rem 0.25rem",
                          boxShadow: isFront ? "0 0 10px rgba(13, 148, 251, 0.3)" : "none",
                          transition: "all 0.25s ease",
                        }}
                      >
                        {/* Blue Queue Circle Avatar */}
                        <div
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            border: isFront ? "2px solid #38bdf8" : "2px solid #0D94FB",
                            background: isFront ? "#0D94FB" : "rgba(13, 148, 251, 0.3)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "0.62rem",
                            fontWeight: 800,
                            color: "#ffffff",
                            flexShrink: 0,
                          }}
                        >
                          {order.id}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                          <span
                            style={{
                              fontSize: "0.68rem",
                              color: isFront ? "#ffffff" : "#bae6fd",
                              fontWeight: isFront ? 700 : 600,
                              lineHeight: 1.15,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {order.name}
                          </span>
                          {isFront && (
                            <span style={{ fontSize: "0.56rem", color: "#38bdf8", fontWeight: 700 }}>
                              Next to fulfill
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* CENTER CONNECTOR: SVG Dashed Arrow Lines */}
        <div
          style={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            minHeight: 250,
          }}
        >
          <svg
            style={{ width: "100%", height: "100%", overflow: "visible" }}
            viewBox="0 0 60 250"
            preserveAspectRatio="none"
          >
            <defs>
              <marker id="arrowhead-white" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#ffffff" />
              </marker>
            </defs>

            {/* Top Arrow: to RazorPies */}
            <path
              d="M 5,75 C 25,75 35,35 55,35"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2"
              strokeDasharray="4,4"
              markerEnd="url(#arrowhead-white)"
            />

            {/* Middle Arrow: to Razorcery-1 */}
            <path
              d="M 5,85 C 25,85 35,120 55,120"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2"
              strokeDasharray="4,4"
              markerEnd="url(#arrowhead-white)"
            />

            {/* Bottom Arrow: to Razorcery-2 */}
            <path
              d="M 5,95 C 25,95 35,205 55,205"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2"
              strokeDasharray="4,4"
              markerEnd="url(#arrowhead-white)"
            />
          </svg>
        </div>

        {/* RIGHT COLUMN: 3 Sellers (RazorPies, Razorcery-1, Razorcery-2) */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
          {/* SELLER 1: RazorPies */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.45rem",
              alignItems: "center",
            }}
          >
            <div
              style={{
                border: "2px solid #ffffff",
                borderRadius: 10,
                background: "#0d1527",
                padding: "0.45rem 0.5rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  padding: "0.08rem 0.4rem",
                  borderRadius: 4,
                  border: "1px solid #10b981",
                  background: "rgba(16, 185, 129, 0.2)",
                  color: "#34d399",
                  fontSize: "0.62rem",
                  fontWeight: 800,
                  marginBottom: "0.2rem",
                }}
              >
                Seller Agent
              </div>
              <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "#ffffff" }}>
                RazorPies
              </div>
            </div>

            <div
              style={{
                border: "2px dashed #f59e0b",
                borderRadius: 10,
                padding: "0.4rem",
                background: "rgba(245, 158, 11, 0.03)",
              }}
            >
              <div style={{ color: "#f59e0b", fontSize: "0.68rem", fontWeight: 800, marginBottom: "0.2rem" }}>
                inventory
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                {(["cheese", "flour", "milk"] as const).map((it) => (
                  <div
                    key={it}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: "0.68rem",
                      background: "rgba(15, 23, 42, 0.6)",
                      padding: "0.15rem 0.3rem",
                      borderRadius: 4,
                    }}
                  >
                    <span style={{ color: "#6ee7b7", fontWeight: 700 }}>
                      ₹{razorPies[it].price}, {it}-{razorPies[it].stock}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.15rem" }}>
                      <button
                        onClick={() => updateSellerStock("razorPies", it, -1)}
                        disabled={isRunning}
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 3,
                          background: "rgba(255,255,255,0.1)",
                          border: "none",
                          color: "#fff",
                          cursor: isRunning ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Minus size={8} />
                      </button>
                      <button
                        onClick={() => updateSellerStock("razorPies", it, 1)}
                        disabled={isRunning}
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 3,
                          background: "rgba(255,255,255,0.1)",
                          border: "none",
                          color: "#fff",
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
                ))}
              </div>
            </div>
          </div>

          {/* SELLER 2: Razorcery-1 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.45rem",
              alignItems: "center",
            }}
          >
            <div
              style={{
                border: "2px solid #ffffff",
                borderRadius: 10,
                background: "#0d1527",
                padding: "0.45rem 0.5rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  padding: "0.08rem 0.4rem",
                  borderRadius: 4,
                  border: "1px solid #10b981",
                  background: "rgba(16, 185, 129, 0.2)",
                  color: "#34d399",
                  fontSize: "0.62rem",
                  fontWeight: 800,
                  marginBottom: "0.2rem",
                }}
              >
                Seller Agent
              </div>
              <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "#ffffff" }}>
                Razorcery-1
              </div>
            </div>

            <div
              style={{
                border: "2px dashed #f59e0b",
                borderRadius: 10,
                padding: "0.4rem",
                background: "rgba(245, 158, 11, 0.03)",
              }}
            >
              <div style={{ color: "#f59e0b", fontSize: "0.68rem", fontWeight: 800, marginBottom: "0.2rem" }}>
                inventory
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                {(["flour", "tomatoes", "onions"] as const).map((it) => (
                  <div
                    key={it}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: "0.68rem",
                      background: "rgba(15, 23, 42, 0.6)",
                      padding: "0.15rem 0.3rem",
                      borderRadius: 4,
                    }}
                  >
                    <span style={{ color: "#6ee7b7", fontWeight: 700 }}>
                      ₹{razorcery1[it].price}, {it}-{razorcery1[it].stock}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.15rem" }}>
                      <button
                        onClick={() => updateSellerStock("razorcery1", it, -1)}
                        disabled={isRunning}
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 3,
                          background: "rgba(255,255,255,0.1)",
                          border: "none",
                          color: "#fff",
                          cursor: isRunning ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Minus size={8} />
                      </button>
                      <button
                        onClick={() => updateSellerStock("razorcery1", it, 1)}
                        disabled={isRunning}
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 3,
                          background: "rgba(255,255,255,0.1)",
                          border: "none",
                          color: "#fff",
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
                ))}
              </div>
            </div>
          </div>

          {/* SELLER 3: Razorcery-2 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.45rem",
              alignItems: "center",
            }}
          >
            <div
              style={{
                border: "2px solid #ffffff",
                borderRadius: 10,
                background: "#0d1527",
                padding: "0.45rem 0.5rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  padding: "0.08rem 0.4rem",
                  borderRadius: 4,
                  border: "1px solid #10b981",
                  background: "rgba(16, 185, 129, 0.2)",
                  color: "#34d399",
                  fontSize: "0.62rem",
                  fontWeight: 800,
                  marginBottom: "0.2rem",
                }}
              >
                Seller Agent
              </div>
              <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "#ffffff" }}>
                Razorcery-2
              </div>
            </div>

            <div
              style={{
                border: "2px dashed #f59e0b",
                borderRadius: 10,
                padding: "0.4rem",
                background: "rgba(245, 158, 11, 0.03)",
              }}
            >
              <div style={{ color: "#f59e0b", fontSize: "0.68rem", fontWeight: 800, marginBottom: "0.2rem" }}>
                inventory
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                {(["milk", "tomatoes", "onions"] as const).map((it) => (
                  <div
                    key={it}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: "0.68rem",
                      background: "rgba(15, 23, 42, 0.6)",
                      padding: "0.15rem 0.3rem",
                      borderRadius: 4,
                    }}
                  >
                    <span style={{ color: "#6ee7b7", fontWeight: 700 }}>
                      ₹{razorcery2[it].price}, {it}-{razorcery2[it].stock}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.15rem" }}>
                      <button
                        onClick={() => updateSellerStock("razorcery2", it, -1)}
                        disabled={isRunning}
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 3,
                          background: "rgba(255,255,255,0.1)",
                          border: "none",
                          color: "#fff",
                          cursor: isRunning ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Minus size={8} />
                      </button>
                      <button
                        onClick={() => updateSellerStock("razorcery2", it, 1)}
                        disabled={isRunning}
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 3,
                          background: "rgba(255,255,255,0.1)",
                          border: "none",
                          color: "#fff",
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
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700 }}>
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
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          {/* Step Next Order Button */}
          <button
            onClick={() => processNextOrder()}
            disabled={isRunning || orderQueue.length === 0 || isAutoSimulating}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.55rem 1rem",
              borderRadius: 8,
              background: isRunning || orderQueue.length === 0 || isAutoSimulating
                ? "#334155"
                : "rgba(255, 255, 255, 0.1)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              color: "#ffffff",
              fontSize: "0.78rem",
              fontWeight: 700,
              cursor: isRunning || orderQueue.length === 0 || isAutoSimulating ? "not-allowed" : "pointer",
            }}
          >
            <ArrowRight size={14} />
            <span>Fulfill Next Order</span>
          </button>

          {/* Auto-Simulate Toggle Button */}
          <button
            onClick={() => setIsAutoSimulating(!isAutoSimulating)}
            disabled={isRunning || (orderQueue.length === 0 && !isAutoSimulating)}
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
              cursor: isRunning || (orderQueue.length === 0 && !isAutoSimulating) ? "not-allowed" : "pointer",
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
                <span>Agents Transacting...</span>
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

      {/* DEDICATED KITCHEN ORDER FULFILLMENT & EVENT LOG FEED (Requirement 4) */}
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
          <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
            <Clock size={15} color="#38bdf8" />
            <span style={{ fontSize: "0.78rem", fontWeight: 800, color: "#e2e8f0" }}>
              Kitchen Order Fulfillment & A2A Event Log
            </span>
          </div>
          <span style={{ fontSize: "0.68rem", color: "#94a3b8" }}>
            Real-time trace per order taken, pantry checked, restocked & served
          </span>
        </div>

        <div
          style={{
            maxHeight: 145,
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

            if (log.type === "order_served") {
              badgeBg = "rgba(16, 185, 129, 0.18)";
              badgeColor = "#4ade80";
              borderColor = "rgba(16, 185, 129, 0.4)";
            } else if (log.type === "deficit") {
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

                <div style={{ display: "flex", flexDirection: "column", gap: "0.1rem", minWidth: 0 }}>
                  <span style={{ fontWeight: 700, color: "#f1f5f9" }}>{log.title}</span>
                  <span style={{ color: "#94a3b8", fontSize: "0.68rem" }}>{log.detail}</span>
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
