import React, { useState } from "react";
import {
  Sparkles,
  Play,
  Plus,
  Minus,
  CheckCircle2,
  TrendingDown,
} from "lucide-react";
import { NegotiationResult } from "../types";

export interface RazorSliceArchitectureProps {
  onRunAi: (
    scenario?: "happy" | "failure" | "custom",
    customOptions?: any,
  ) => void;
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
  // image.png: $4 cheese-10, $8 flour-6, $9 milk-4
  const [razorPies, setRazorPies] = useState<SellerInventory>({
    cheese: { stock: 10, price: 4 },
    flour: { stock: 6, price: 8 },
    milk: { stock: 4, price: 9 },
  });

  // 3. Seller 2: Razorcery-1 (sells flour, tomatoes, onions)
  // image.png: $6 flour-10, $4 tomatoes-6, $4 onions-4
  const [razorcery1, setRazorcery1] = useState<SellerInventory>({
    flour: { stock: 10, price: 6 },
    tomatoes: { stock: 6, price: 4 },
    onions: { stock: 4, price: 4 },
  });

  // 4. Seller 3: Razorcery-2 (sells tomatoes, onions, milk)
  // image.png: $10 milk-10, $3 tomatoes-6, $5 onions-4
  const [razorcery2, setRazorcery2] = useState<SellerInventory>({
    milk: { stock: 10, price: 10 },
    tomatoes: { stock: 6, price: 3 },
    onions: { stock: 4, price: 5 },
  });

  // Track last processed thread ID to ensure each confirmed deal updates simulation stock exactly once
  const lastProcessedThreadRef = React.useRef<string | null>(null);
  const [restockNotification, setRestockNotification] = useState<{
    text: string;
    items: Array<{ item: string; quantity: number; seller: string }>;
  } | null>(null);

  const normalizeKey = (name: string): keyof BuyerPantry => {
    const s = (name || "").toLowerCase().trim();
    if (s.startsWith("flour")) return "flour";
    if (s.startsWith("cheese")) return "cheese";
    if (s.startsWith("milk")) return "milk";
    if (s.startsWith("tomat")) return "tomatoes";
    if (s.startsWith("onion")) return "onions";
    return s as keyof BuyerPantry;
  };

  React.useEffect(() => {
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
                  [k]: {
                    ...prev[k],
                    stock: Math.max(0, prev[k].stock - p.quantity),
                  },
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
                  [k]: {
                    ...prev[k],
                    stock: Math.max(0, prev[k].stock - p.quantity),
                  },
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
                  [k]: {
                    ...prev[k],
                    stock: Math.max(0, prev[k].stock - p.quantity),
                  },
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
                  [k]: {
                    ...prev[k],
                    stock: Math.max(0, prev[k].stock - p.quantity),
                  },
                };
              }
              return prev;
            });
            setRazorPies((prev) => {
              const k = Object.keys(prev).find((key) => normalizeKey(key) === norm);
              if (k && prev[k] && prev[k].stock > 0) {
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

        setRestockNotification({
          text: `Payment Confirmed! Restocked ${purchasedList.map((p) => `${p.quantity}u ${p.item}`).join(", ")}`,
          items: itemSummaryList,
        });

        const timer = setTimeout(() => {
          setRestockNotification(null);
        }, 6000);
        return () => clearTimeout(timer);
      }
    }
  }, [latestResult]);

  // Active customer order queue formulas (from main-idea.md)
  // Order 1: Margherita (-2 Flour, -2 Cheese, -1 Tomato)
  // Order 2: Farm Fresh (-2 Flour, -1 Cheese, -1 Tomato, -2 Onions)
  // Order 3: Margherita + Milk Shake (-2 Flour, -2 Cheese, -1 Tomato, -2 Milk)
  // Order 4: Milk Shake (-2 Milk)
  const orderRequirements = {
    flour: 2 + 2 + 2, // 6
    cheese: 2 + 1 + 2, // 5
    tomatoes: 1 + 1 + 1, // 3
    onions: 2, // 2
    milk: 2 + 2, // 4
  };

  // Deficits calculation
  const deficits = {
    flour: Math.max(0, orderRequirements.flour - buyerStock.flour),
    cheese: Math.max(0, orderRequirements.cheese - buyerStock.cheese),
    tomatoes: Math.max(0, orderRequirements.tomatoes - buyerStock.tomatoes),
    onions: Math.max(0, orderRequirements.onions - buyerStock.onions),
    milk: Math.max(0, orderRequirements.milk - buyerStock.milk),
  };

  const totalDeficitUnits =
    deficits.flour +
    deficits.cheese +
    deficits.tomatoes +
    deficits.onions +
    deficits.milk;

  // Preset Handlers
  const applyPreset = (
    preset: "default" | "stocked" | "no_seller" | "over_cap",
  ) => {
    if (preset === "default") {
      setBuyerStock({
        cheese: 3,
        flour: 5,
        tomatoes: 6,
        onions: 5,
        milk: 7,
        targetStock: 15,
      });
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
    } else if (preset === "stocked") {
      setBuyerStock({
        cheese: 10,
        flour: 12,
        tomatoes: 10,
        onions: 8,
        milk: 10,
        targetStock: 15,
      });
    } else if (preset === "no_seller") {
      setBuyerStock({
        cheese: 1,
        flour: 1,
        tomatoes: 1,
        onions: 1,
        milk: 1,
        targetStock: 15,
      });
      setRazorPies({
        cheese: { stock: 0, price: 4 },
        flour: { stock: 0, price: 8 },
        milk: { stock: 0, price: 9 },
      });
      setRazorcery1({
        flour: { stock: 0, price: 6 },
        tomatoes: { stock: 0, price: 4 },
        onions: { stock: 0, price: 4 },
      });
      setRazorcery2({
        milk: { stock: 0, price: 10 },
        tomatoes: { stock: 0, price: 3 },
        onions: { stock: 0, price: 5 },
      });
    } else if (preset === "over_cap") {
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
    }
  };

  // Steppers for buyer stock
  const updateBuyerItem = (item: keyof BuyerPantry, delta: number) => {
    setBuyerStock((prev) => ({
      ...prev,
      [item]: Math.max(0, prev[item] + delta),
    }));
  };

  // Stepper for seller item stock
  const updateSellerStock = (
    seller: "razorPies" | "razorcery1" | "razorcery2",
    item: string,
    delta: number,
  ) => {
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
    delta: number,
  ) => {
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

  // Execution trigger
  const handleTriggerProcurement = () => {
    const isOutOfStockAll =
      razorPies.cheese.stock === 0 &&
      razorcery1.flour.stock === 0 &&
      razorcery2.milk.stock === 0;

    let scenario: "happy" | "failure" | "custom" = "custom";
    if (totalDeficitUnits === 0) {
      scenario = "happy";
    } else if (isOutOfStockAll) {
      scenario = "failure";
    }

    // Identify which item has deficit
    const deficitEntries = Object.entries(deficits).filter(([_, qty]) => qty > 0);
    let itemToProcure = "flour";
    let quantityNeeded = 6;
    if (deficitEntries.length > 0) {
      deficitEntries.sort((a, b) => b[1] - a[1]);
      itemToProcure = deficitEntries[0][0];
      quantityNeeded = deficitEntries[0][1];
    }

    onRunAi(scenario, {
      itemToProcure,
      quantityNeeded,
      buyerStockKg: buyerStock[itemToProcure as keyof BuyerPantry] || buyerStock.flour,
      sellerStockKg:
        razorPies.cheese.stock + razorcery1.flour.stock + razorcery2.milk.stock,
      buyerTargetStockKg: buyerStock.targetStock,
    });
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
          backgroundImage:
            "radial-gradient(rgba(13, 148, 251, 0.08) 1px, transparent 1px)",
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
            background: "linear-gradient(90deg, rgba(16, 185, 129, 0.2) 0%, rgba(13, 148, 251, 0.2) 100%)",
            border: "1px solid #10b981",
            borderRadius: 8,
            padding: "0.6rem 1rem",
            marginBottom: "1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <CheckCircle2 size={18} color="#10b981" />
            <span style={{ fontWeight: 700, color: "#ffffff", fontSize: "0.85rem" }}>
              {restockNotification.text}
            </span>
          </div>
          <div style={{ display: "flex", gap: "0.4rem" }}>
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
                +{it.quantity} {it.item} from {it.seller}
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
          marginBottom: "1.25rem",
          flexWrap: "wrap",
          gap: "0.75rem",
          position: "relative",
          zIndex: 2,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
          <div>
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <h2
                style={{
                  fontSize: "1.1rem",
                  fontWeight: 800,
                  color: "#ffffff",
                  letterSpacing: "-0.01em",
                  margin: 0,
                }}
              >
                Pizza Restaurant Scenario Simulation
              </h2>
            </div>
          </div>
        </div>

        {/* Preset quick buttons */}
        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
          <button
            onClick={() => applyPreset("default")}
            style={{
              padding: "0.28rem 0.65rem",
              borderRadius: 6,
              background: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              fontSize: "0.72rem",
              color: "#e2e8f0",
              cursor: "pointer",
              fontWeight: 600,
              transition: "all 0.15s ease",
            }}
          >
            Default Setup
          </button>
          <button
            onClick={() => applyPreset("stocked")}
            style={{
              padding: "0.28rem 0.65rem",
              borderRadius: 6,
              background: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              fontSize: "0.72rem",
              color: "#6ee7b7",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Sufficient Stock
          </button>
          <button
            onClick={() => applyPreset("no_seller")}
            style={{
              padding: "0.28rem 0.65rem",
              borderRadius: 6,
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              fontSize: "0.72rem",
              color: "#fca5a5",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Zero Sellers Stock
          </button>
          <button
            onClick={() => applyPreset("over_cap")}
            style={{
              padding: "0.28rem 0.65rem",
              borderRadius: 6,
              background: "rgba(245, 158, 11, 0.12)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              fontSize: "0.72rem",
              color: "#fde68a",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Breach Cap Demo
          </button>
        </div>
      </div>

      {/* TOP: Menu Card (Sky blue rounded box matching image.png) */}
      <div
        style={{
          border: "2px solid #0D94FB",
          borderRadius: 14,
          padding: "0.75rem 1rem",
          background: "rgba(13, 148, 251, 0.05)",
          marginBottom: "1.25rem",
          position: "relative",
          zIndex: 2,
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
              color: "#38bdf8",
              fontSize: "0.88rem",
              fontWeight: 800,
              letterSpacing: "0.02em",
            }}
          >
            Menu
          </span>
          <span
            style={{
              fontSize: "0.7rem",
              color: "#94a3b8",
              fontStyle: "italic",
            }}
          >
            Ingredient recipes consumed by customer orders
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "0.75rem",
            fontSize: "0.78rem",
            color: "#e2e8f0",
          }}
        >
          <div
            style={{
              background: "rgba(15, 23, 42, 0.6)",
              padding: "0.45rem 0.65rem",
              borderRadius: 8,
              border: "1px solid rgba(13, 148, 251, 0.2)",
            }}
          >
            <div style={{ fontWeight: 700, color: "#38bdf8", marginBottom: 2 }}>
              Margherita
            </div>
            <div style={{ color: "#cbd5e1", fontSize: "0.73rem" }}>
              = -2 Flour, -2 Cheese, -1 Tomato
            </div>
          </div>

          <div
            style={{
              background: "rgba(15, 23, 42, 0.6)",
              padding: "0.45rem 0.65rem",
              borderRadius: 8,
              border: "1px solid rgba(13, 148, 251, 0.2)",
            }}
          >
            <div style={{ fontWeight: 700, color: "#38bdf8", marginBottom: 2 }}>
              Farm fresh
            </div>
            <div style={{ color: "#cbd5e1", fontSize: "0.73rem" }}>
              = -2 Flour, -1 Cheese, -1 Tomato, -2 onions
            </div>
          </div>

          <div
            style={{
              background: "rgba(15, 23, 42, 0.6)",
              padding: "0.45rem 0.65rem",
              borderRadius: 8,
              border: "1px solid rgba(13, 148, 251, 0.2)",
            }}
          >
            <div style={{ fontWeight: 700, color: "#38bdf8", marginBottom: 2 }}>
              Milk shake
            </div>
            <div style={{ color: "#cbd5e1", fontSize: "0.73rem" }}>
              = -2 milk
            </div>
          </div>
        </div>
      </div>

      {/* MAIN DIAGRAM CANVAS: RazorSlice + Inventory + Queue + Connections + 3 Sellers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "minmax(280px, 1.15fr) 70px minmax(290px, 1.25fr)",
          gap: "0.5rem",
          alignItems: "start",
          position: "relative",
          zIndex: 2,
        }}
      >
        {/* LEFT COLUMN: RazorSlice Inventory Box + RazorSlice Box + 4 Queue Orders */}
        <div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.05fr 0.95fr",
              gap: "0.65rem",
              alignItems: "start",
            }}
          >
            {/* RazorSlice Inventory Box (Dashed Orange Border) */}
            <div
              style={{
                border: "2px dashed #f59e0b",
                borderRadius: 12,
                padding: "0.65rem",
                background: "rgba(245, 158, 11, 0.03)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "0.45rem",
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
                    fontSize: "0.64rem",
                    color: "#cbd5e1",
                    background: "rgba(245, 158, 11, 0.15)",
                    padding: "0.1rem 0.35rem",
                    borderRadius: 4,
                  }}
                >
                  stock
                </span>
              </div>

              {/* Items stock controls */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.35rem",
                }}
              >
                {(
                  [
                    {
                      key: "cheese",
                      name: "cheese",
                      required: orderRequirements.cheese,
                    },
                    {
                      key: "flour",
                      name: "flour",
                      required: orderRequirements.flour,
                    },
                    {
                      key: "tomatoes",
                      name: "tomatoes",
                      required: orderRequirements.tomatoes,
                    },
                    {
                      key: "onions",
                      name: "onions",
                      required: orderRequirements.onions,
                    },
                    {
                      key: "milk",
                      name: "milk",
                      required: orderRequirements.milk,
                    },
                  ] as const
                ).map((item) => {
                  const currentVal = buyerStock[item.key];
                  const deficit = Math.max(0, item.required - currentVal);
                  const isDeficit = deficit > 0;

                  return (
                    <div
                      key={item.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        background: "rgba(15, 23, 42, 0.5)",
                        padding: "0.24rem 0.4rem",
                        borderRadius: 6,
                        border: isDeficit
                          ? "1px solid rgba(239, 68, 68, 0.4)"
                          : "1px solid rgba(255, 255, 255, 0.08)",
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
                        <span style={{ fontSize: "0.6rem", color: "#94a3b8" }}>
                          Need {item.required}u{" "}
                          {isDeficit && (
                            <strong style={{ color: "#ef4444" }}>
                              (-{deficit})
                            </strong>
                          )}
                        </span>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.2rem",
                        }}
                      >
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
                            cursor: "pointer",
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
                            cursor: "pointer",
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
                    fontSize: "0.68rem",
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

            {/* RazorSlice Agent Box */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  width: "100%",
                  border: "2px solid #ffffff",
                  borderRadius: 14,
                  background: "#0d1527",
                  padding: "0.75rem 0.5rem 0.4rem",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  boxShadow: "0 0 16px rgba(255, 255, 255, 0.12)",
                  position: "relative",
                }}
              >
                {/* Agent Orange Tag */}
                <div
                  style={{
                    padding: "0.12rem 0.6rem",
                    borderRadius: 6,
                    border: "1.5px solid #ea580c",
                    background: "rgba(234, 88, 12, 0.25)",
                    color: "#fb923c",
                    fontSize: "0.7rem",
                    fontWeight: 800,
                    marginBottom: "0.35rem",
                    letterSpacing: "0.02em",
                  }}
                >
                  Buyer Agent
                </div>

                <div
                  style={{
                    fontSize: "0.92rem",
                    fontWeight: 800,
                    color: "#ffffff",
                    marginBottom: "0.55rem",
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
                    padding: "0.12rem 0.25rem",
                    textAlign: "center",
                    fontSize: "0.6rem",
                    color: "#94a3b8",
                    background: "rgba(148, 163, 184, 0.08)",
                  }}
                >
                  [ - - - - ]
                </div>
              </div>

              {/* 4 Customer Orders lined up back-to-back in front of gate */}
              <div
                style={{
                  width: "100%",
                  marginTop: "0.55rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.4rem",
                }}
              >
                {[
                  { id: 1, name: "margherita pizza" },
                  { id: 2, name: "farm fresh pizza" },
                  { id: 3, name: "margherita pizza + milk shake" },
                  { id: 4, name: "milk shake" },
                ].map((order) => (
                  <div
                    key={order.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      background: "rgba(13, 148, 251, 0.06)",
                      border: "1px solid rgba(13, 148, 251, 0.25)",
                      borderRadius: 18,
                      padding: "0.2rem 0.45rem 0.2rem 0.25rem",
                    }}
                  >
                    {/* Blue Queue Circle Avatar */}
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        border: "2px solid #0D94FB",
                        background: "rgba(13, 148, 251, 0.3)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.62rem",
                        fontWeight: 800,
                        color: "#ffffff",
                        boxShadow: "0 0 6px rgba(13, 148, 251, 0.4)",
                        flexShrink: 0,
                      }}
                    >
                      {order.id}
                    </div>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        color: "#bae6fd",
                        fontWeight: 600,
                        lineHeight: 1.15,
                      }}
                    >
                      {order.name}
                    </span>
                  </div>
                ))}
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
            minHeight: 260,
          }}
        >
          <svg
            style={{
              width: "100%",
              height: "100%",
              overflow: "visible",
            }}
            viewBox="0 0 70 260"
            preserveAspectRatio="none"
          >
            <defs>
              <marker
                id="arrowhead-white"
                markerWidth="8"
                markerHeight="6"
                refX="7"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 8 3, 0 6" fill="#ffffff" />
              </marker>
            </defs>

            {/* Top Arrow: to RazorPies */}
            <path
              d="M 5,75 C 30,75 40,35 65,35"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2"
              strokeDasharray="4,4"
              markerEnd="url(#arrowhead-white)"
            />

            {/* Middle Arrow: to Razorcery-1 */}
            <path
              d="M 5,85 C 30,85 40,125 65,125"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2"
              strokeDasharray="4,4"
              markerEnd="url(#arrowhead-white)"
            />

            {/* Bottom Arrow: to Razorcery-2 */}
            <path
              d="M 5,95 C 30,95 40,215 65,215"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2"
              strokeDasharray="4,4"
              markerEnd="url(#arrowhead-white)"
            />
          </svg>
        </div>

        {/* RIGHT COLUMN: 3 Seller Agents + Inventory Blocks */}
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
        >
          {/* Seller 1: RazorPies */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "0.9fr 1.25fr",
              gap: "0.5rem",
              alignItems: "center",
            }}
          >
            {/* RazorPies Agent Box */}
            <div
              style={{
                border: "2px solid #10b981",
                borderRadius: 12,
                background: "#062017",
                padding: "0.55rem 0.45rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                boxShadow: "0 0 12px rgba(16, 185, 129, 0.2)",
              }}
            >
              <div
                style={{
                  padding: "0.1rem 0.45rem",
                  borderRadius: 6,
                  border: "1.5px solid #ea580c",
                  background: "rgba(234, 88, 12, 0.25)",
                  color: "#fb923c",
                  fontSize: "0.65rem",
                  fontWeight: 800,
                  marginBottom: "0.2rem",
                }}
              >
                Seller Agent
              </div>
              <div
                style={{
                  fontSize: "0.82rem",
                  fontWeight: 800,
                  color: "#6ee7b7",
                }}
              >
                RazorPies
              </div>
            </div>

            {/* RazorPies Inventory Box */}
            <div
              style={{
                border: "2px dashed #f59e0b",
                borderRadius: 10,
                padding: "0.45rem",
                background: "rgba(245, 158, 11, 0.03)",
              }}
            >
              <div
                style={{
                  color: "#f59e0b",
                  fontSize: "0.7rem",
                  fontWeight: 800,
                  marginBottom: "0.3rem",
                  textTransform: "lowercase",
                }}
              >
                inventory
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.25rem",
                }}
              >
                {(["cheese", "flour", "milk"] as const).map((it) => (
                  <div
                    key={it}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: "0.7rem",
                      background: "rgba(15, 23, 42, 0.6)",
                      padding: "0.18rem 0.35rem",
                      borderRadius: 4,
                    }}
                  >
                    <span style={{ color: "#6ee7b7", fontWeight: 700 }}>
                      ₹{razorPies[it].price}, {it}-{razorPies[it].stock}
                    </span>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.15rem",
                      }}
                    >
                      <button
                        onClick={() => updateSellerStock("razorPies", it, -1)}
                        disabled={isRunning}
                        style={{
                          width: 15,
                          height: 15,
                          borderRadius: 3,
                          background: "rgba(255,255,255,0.1)",
                          border: "none",
                          color: "#fff",
                          cursor: "pointer",
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
                          width: 15,
                          height: 15,
                          borderRadius: 3,
                          background: "rgba(255,255,255,0.1)",
                          border: "none",
                          color: "#fff",
                          cursor: "pointer",
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

          {/* Seller 2: Razorcery-1 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "0.9fr 1.25fr",
              gap: "0.5rem",
              alignItems: "center",
            }}
          >
            {/* Razorcery-1 Agent Box */}
            <div
              style={{
                border: "2px solid #10b981",
                borderRadius: 12,
                background: "#062017",
                padding: "0.55rem 0.45rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                boxShadow: "0 0 12px rgba(16, 185, 129, 0.2)",
              }}
            >
              <div
                style={{
                  padding: "0.1rem 0.45rem",
                  borderRadius: 6,
                  border: "1.5px solid #ea580c",
                  background: "rgba(234, 88, 12, 0.25)",
                  color: "#fb923c",
                  fontSize: "0.65rem",
                  fontWeight: 800,
                  marginBottom: "0.2rem",
                }}
              >
                Seller Agent
              </div>
              <div
                style={{
                  fontSize: "0.82rem",
                  fontWeight: 800,
                  color: "#6ee7b7",
                }}
              >
                Razorcery-1
              </div>
            </div>

            {/* Razorcery-1 Inventory Box */}
            <div
              style={{
                border: "2px dashed #f59e0b",
                borderRadius: 10,
                padding: "0.45rem",
                background: "rgba(245, 158, 11, 0.03)",
              }}
            >
              <div
                style={{
                  color: "#f59e0b",
                  fontSize: "0.7rem",
                  fontWeight: 800,
                  marginBottom: "0.3rem",
                  textTransform: "lowercase",
                }}
              >
                inventory
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.25rem",
                }}
              >
                {(["flour", "tomatoes", "onions"] as const).map((it) => (
                  <div
                    key={it}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: "0.7rem",
                      background: "rgba(15, 23, 42, 0.6)",
                      padding: "0.18rem 0.35rem",
                      borderRadius: 4,
                    }}
                  >
                    <span style={{ color: "#6ee7b7", fontWeight: 700 }}>
                      ₹{razorcery1[it].price}, {it}-{razorcery1[it].stock}
                    </span>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.15rem",
                      }}
                    >
                      <button
                        onClick={() => updateSellerStock("razorcery1", it, -1)}
                        disabled={isRunning}
                        style={{
                          width: 15,
                          height: 15,
                          borderRadius: 3,
                          background: "rgba(255,255,255,0.1)",
                          border: "none",
                          color: "#fff",
                          cursor: "pointer",
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
                          width: 15,
                          height: 15,
                          borderRadius: 3,
                          background: "rgba(255,255,255,0.1)",
                          border: "none",
                          color: "#fff",
                          cursor: "pointer",
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

          {/* Seller 3: Razorcery-2 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "0.9fr 1.25fr",
              gap: "0.5rem",
              alignItems: "center",
            }}
          >
            {/* Razorcery-2 Agent Box */}
            <div
              style={{
                border: "2px solid #10b981",
                borderRadius: 12,
                background: "#062017",
                padding: "0.55rem 0.45rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                boxShadow: "0 0 12px rgba(16, 185, 129, 0.2)",
              }}
            >
              <div
                style={{
                  padding: "0.1rem 0.45rem",
                  borderRadius: 6,
                  border: "1.5px solid #ea580c",
                  background: "rgba(234, 88, 12, 0.25)",
                  color: "#fb923c",
                  fontSize: "0.65rem",
                  fontWeight: 800,
                  marginBottom: "0.2rem",
                }}
              >
                Seller Agent
              </div>
              <div
                style={{
                  fontSize: "0.82rem",
                  fontWeight: 800,
                  color: "#6ee7b7",
                }}
              >
                Razorcery-2
              </div>
            </div>

            {/* Razorcery-2 Inventory Box */}
            <div
              style={{
                border: "2px dashed #f59e0b",
                borderRadius: 10,
                padding: "0.45rem",
                background: "rgba(245, 158, 11, 0.03)",
              }}
            >
              <div
                style={{
                  color: "#f59e0b",
                  fontSize: "0.7rem",
                  fontWeight: 800,
                  marginBottom: "0.3rem",
                  textTransform: "lowercase",
                }}
              >
                inventory
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.25rem",
                }}
              >
                {(["milk", "tomatoes", "onions"] as const).map((it) => (
                  <div
                    key={it}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: "0.7rem",
                      background: "rgba(15, 23, 42, 0.6)",
                      padding: "0.18rem 0.35rem",
                      borderRadius: 4,
                    }}
                  >
                    <span style={{ color: "#6ee7b7", fontWeight: 700 }}>
                      ₹{razorcery2[it].price}, {it}-{razorcery2[it].stock}
                    </span>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.15rem",
                      }}
                    >
                      <button
                        onClick={() => updateSellerStock("razorcery2", it, -1)}
                        disabled={isRunning}
                        style={{
                          width: 15,
                          height: 15,
                          borderRadius: 3,
                          background: "rgba(255,255,255,0.1)",
                          border: "none",
                          color: "#fff",
                          cursor: "pointer",
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
                          width: 15,
                          height: 15,
                          borderRadius: 3,
                          background: "rgba(255,255,255,0.1)",
                          border: "none",
                          color: "#fff",
                          cursor: "pointer",
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

      {/* BOTTOM ACTION BAR */}
      <div
        style={{
          marginTop: "1.25rem",
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
        {/* Status indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          {totalDeficitUnits > 0 ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                fontSize: "0.78rem",
                color: "#fde047",
                background: "rgba(234, 179, 8, 0.15)",
                padding: "0.3rem 0.65rem",
                borderRadius: 6,
                border: "1px solid rgba(234, 179, 8, 0.3)",
              }}
            >
              <TrendingDown size={14} color="#facc15" />
              <span>
                Queue deficit of <strong>{totalDeficitUnits} units</strong>{" "}
                triggers autonomous A2A RFQs to sellers.
              </span>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                fontSize: "0.78rem",
                color: "#86efac",
                background: "rgba(34, 197, 94, 0.15)",
                padding: "0.3rem 0.65rem",
                borderRadius: 6,
                border: "1px solid rgba(34, 197, 94, 0.3)",
              }}
            >
              <CheckCircle2 size={14} color="#4ade80" />
              <span>Pantry covers customer queue (0 deficit).</span>
            </div>
          )}
        </div>

        {/* Start button */}
        <button
          onClick={handleTriggerProcurement}
          disabled={isRunning}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.65rem 1.4rem",
            borderRadius: 8,
            background: isRunning
              ? "#475569"
              : "linear-gradient(135deg, #0D94FB 0%, #012652 100%)",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            color: "#ffffff",
            fontSize: "0.88rem",
            fontWeight: 800,
            cursor: isRunning ? "not-allowed" : "pointer",
            boxShadow: isRunning
              ? "none"
              : "0 4px 14px rgba(13, 148, 251, 0.4)",
            transition: "all 0.15s ease",
          }}
        >
          {isRunning ? (
            <>
              <div
                style={{
                  width: 15,
                  height: 15,
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
              <Play size={15} fill="#ffffff" />
              <span>Update & Start AI Evaluation</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default RazorSliceArchitecture;
