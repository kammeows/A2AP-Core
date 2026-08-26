import React from "react";
import {
  Sliders,
  ShoppingBag,
  Store,
  Play,
  Sparkles,
  CheckCircle,
  PackageX,
  TrendingDown,
} from "lucide-react";

interface StockConfiguratorProps {
  buyerStockKg: number;
  setBuyerStockKg: (val: number) => void;
  sellerStockKg: number;
  setSellerStockKg: (val: number) => void;
  buyerTargetStockKg: number;
  setBuyerTargetStockKg: (val: number) => void;
  onRunAi: (scenario?: "happy" | "failure" | "custom") => void;
  isRunning: boolean;
  delegationMode: "full" | "partial";
}

export const StockConfigurator: React.FC<StockConfiguratorProps> = ({
  buyerStockKg,
  setBuyerStockKg,
  sellerStockKg,
  setSellerStockKg,
  buyerTargetStockKg,
  setBuyerTargetStockKg,
  onRunAi,
  isRunning,
  delegationMode,
}) => {
  const deficitKg = Math.max(0, buyerTargetStockKg - buyerStockKg);
  const isHealthyStock = deficitKg === 0;
  const isSellerOutOfStock = sellerStockKg === 0;

  const applyPreset = (
    preset: "standard" | "healthy" | "no_seller" | "over_cap",
  ) => {
    if (preset === "standard") {
      setBuyerStockKg(15);
      setSellerStockKg(500);
      setBuyerTargetStockKg(65);
    } else if (preset === "healthy") {
      setBuyerStockKg(70);
      setSellerStockKg(500);
      setBuyerTargetStockKg(65);
    } else if (preset === "no_seller") {
      setBuyerStockKg(15);
      setSellerStockKg(0);
      setBuyerTargetStockKg(65);
    } else if (preset === "over_cap") {
      setBuyerStockKg(15);
      setSellerStockKg(500);
      setBuyerTargetStockKg(90);
    }
  };

  return (
    <div className="clean-card" style={{ marginBottom: "1.5rem" }}>
      <div className="clean-card-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              background: "rgba(13, 148, 251, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#0D94FB",
            }}
          >
            <Sliders size={18} />
          </div>
          <div>
            <h2
              style={{
                fontSize: "1.05rem",
                fontWeight: 700,
                color: "#0D94FB",
                margin: 0,
              }}
            >
              Agent Stock & Inventory Controls
            </h2>
            <p style={{ fontSize: "0.76rem", color: "#475569", marginTop: 1 }}>
              Configure stock levels for buyer and seller agents
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
          <button
            onClick={() => applyPreset("standard")}
            style={{
              padding: "0.25rem 0.6rem",
              borderRadius: 6,
              background: "#f8fafc",
              border: "1px solid #cbd5e1",
              fontSize: "0.72rem",
              color: "#012652",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Reorder (50kg)
          </button>
          <button
            onClick={() => applyPreset("healthy")}
            style={{
              padding: "0.25rem 0.6rem",
              borderRadius: 6,
              background: "#f8fafc",
              border: "1px solid #cbd5e1",
              fontSize: "0.72rem",
              color: "#059669",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Full Stock
          </button>
          <button
            onClick={() => applyPreset("no_seller")}
            style={{
              padding: "0.25rem 0.6rem",
              borderRadius: 6,
              background: "#f8fafc",
              border: "1px solid #cbd5e1",
              fontSize: "0.72rem",
              color: "#dc2626",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Zero Seller Stock
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1.25rem",
          marginBottom: "1.25rem",
        }}
      >
        {/* Buyer Stock Slider */}
        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            padding: "1rem",
            position: "relative",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "0.65rem",
            }}
          >
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}
            >
              <ShoppingBag size={16} color="#0D94FB" />
              <span
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  color: "#012652",
                }}
              >
                Buyer Agent Stock
              </span>
            </div>
            <div
              style={{
                padding: "0.2rem 0.55rem",
                borderRadius: 4,
                background: isHealthyStock ? "#dcfce7" : "#fef3c7",
                border: `1px solid ${isHealthyStock ? "#86efac" : "#fde68a"}`,
                fontSize: "0.75rem",
                fontWeight: 800,
                color: isHealthyStock ? "#15803d" : "#b45309",
              }}
            >
              {buyerStockKg} kg / {buyerTargetStockKg} kg
            </div>
          </div>

          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={buyerStockKg}
            onChange={(e) => setBuyerStockKg(Number(e.target.value))}
            style={{ marginBottom: "0.5rem" }}
          />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.7rem",
              color: "#64748b",
            }}
          >
            <span>0 kg</span>
            <span style={{ color: "#012652", fontWeight: 600 }}>
              Target: {buyerTargetStockKg} kg
            </span>
            <span>100 kg</span>
          </div>

          <div
            style={{
              marginTop: "0.65rem",
              padding: "0.45rem 0.6rem",
              borderRadius: 6,
              background: isHealthyStock ? "#f0fdf4" : "#eff6ff",
              border: `1px solid ${isHealthyStock ? "#bbf7d0" : "#bfdbfe"}`,
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              fontSize: "0.74rem",
            }}
          >
            {isHealthyStock ? (
              <>
                <CheckCircle size={14} color="#16a34a" />
                <span style={{ color: "#15803d", fontWeight: 600 }}>
                  Optimal stock ({buyerStockKg}kg). No purchase needed.
                </span>
              </>
            ) : (
              <>
                <TrendingDown size={14} color="#0D94FB" />
                <span style={{ color: "#0369a1" }}>
                  Deficit of{" "}
                  <strong style={{ color: "#012652" }}>{deficitKg} kg</strong>{" "}
                  will trigger AI procurement.
                </span>
              </>
            )}
          </div>
        </div>

        {/* Seller Stock Slider */}
        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            padding: "1rem",
            position: "relative",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "0.65rem",
            }}
          >
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}
            >
              <Store size={16} color="#012652" />
              <span
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  color: "#012652",
                }}
              >
                Seller Agent Stock
              </span>
            </div>
            <div
              style={{
                padding: "0.2rem 0.55rem",
                borderRadius: 4,
                background: isSellerOutOfStock ? "#fee2e2" : "#e0f2fe",
                border: `1px solid ${isSellerOutOfStock ? "#fca5a5" : "#bae6fd"}`,
                fontSize: "0.75rem",
                fontWeight: 800,
                color: isSellerOutOfStock ? "#b91c1c" : "#0369a1",
              }}
            >
              {sellerStockKg} kg Available
            </div>
          </div>

          <input
            type="range"
            min="0"
            max="500"
            step="5"
            value={sellerStockKg}
            onChange={(e) => setSellerStockKg(Number(e.target.value))}
            style={{ marginBottom: "0.5rem" }}
          />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.7rem",
              color: "#64748b",
            }}
          >
            <span>0 kg</span>
            <span style={{ color: "#012652", fontWeight: 600 }}>
              Base: ₹32/kg
            </span>
            <span>500 kg</span>
          </div>

          <div
            style={{
              marginTop: "0.65rem",
              padding: "0.45rem 0.6rem",
              borderRadius: 6,
              background: isSellerOutOfStock ? "#fef2f2" : "#f0f9ff",
              border: `1px solid ${isSellerOutOfStock ? "#fecaca" : "#e0f2fe"}`,
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              fontSize: "0.74rem",
            }}
          >
            {isSellerOutOfStock ? (
              <>
                <PackageX size={14} color="#dc2626" />
                <span style={{ color: "#b91c1c", fontWeight: 600 }}>
                  Out of Stock. Will return "No seller found".
                </span>
              </>
            ) : (
              <>
                <Sparkles size={14} color="#0D94FB" />
                <span style={{ color: "#0284c7" }}>
                  Volume tiers:{" "}
                  <strong style={{ color: "#012652" }}>30kg (-10%)</strong>,{" "}
                  <strong style={{ color: "#012652" }}>75kg (-18%)</strong>.
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: "0.85rem",
          borderTop: "1px solid #f1f5f9",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            fontSize: "0.8rem",
            color: "#334155",
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#0D94FB",
            }}
          />
          <span>
            Active Mode:{" "}
            <strong style={{ color: "#012652" }}>
              {delegationMode === "full"
                ? "Fully Autonomous"
                : "Partial (Human Confirmation)"}
            </strong>
          </span>
        </div>

        <button
          onClick={() => onRunAi("custom")}
          disabled={isRunning}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.65rem 1.4rem",
            borderRadius: 8,
            background: isRunning ? "#94a3b8" : "#012652",
            border: "none",
            color: "#ffffff",
            fontSize: "0.88rem",
            fontWeight: 700,
            cursor: isRunning ? "not-allowed" : "pointer",
            boxShadow: isRunning ? "none" : "0 2px 8px rgba(1, 38, 82, 0.25)",
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
              <span>AI Agents Negotiating...</span>
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
