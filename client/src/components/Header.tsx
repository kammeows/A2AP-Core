import React from "react";
import {
  Cpu,
  ShieldCheck,
  RefreshCw,
  Layers,
  CheckCircle2,
  Key,
} from "lucide-react";

interface HeaderProps {
  onReset: () => void;
  isResetting: boolean;
  delegationMode: "full" | "partial";
  onOpenKeyModal: () => void;
  hasCustomKeys: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onReset,
  isResetting,
  delegationMode,
  onOpenKeyModal,
  hasCustomKeys,
}) => {
  return (
    <header className="app-banner">
      <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              flexWrap: "wrap",
            }}
          >
            <h1
              style={{
                fontSize: "1.15rem",
                fontWeight: 800,
                color: "#ffffff",
                letterSpacing: "-0.01em",
                margin: 0,
              }}
            >
              RazorSlice A2A Bounded Procurement
            </h1>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.65rem",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            padding: "0.35rem 0.7rem",
            borderRadius: 6,
            background:
              delegationMode === "full"
                ? "rgba(16, 185, 129, 0.2)"
                : "rgba(245, 158, 11, 0.2)",
            border: `1px solid ${delegationMode === "full" ? "rgba(16, 185, 129, 0.4)" : "rgba(245, 158, 11, 0.4)"}`,
            fontSize: "0.76rem",
            color: delegationMode === "full" ? "#a7f3d0" : "#fde68a",
            fontWeight: 600,
          }}
        >
          <Layers size={14} />
          <span>
            {delegationMode === "full"
              ? "Autonomous Mode"
              : "Partial (Human-Gated)"}
          </span>
        </div>

        <button
          onClick={onOpenKeyModal}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            padding: "0.38rem 0.8rem",
            borderRadius: 6,
            background: hasCustomKeys
              ? "linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(5, 150, 105, 0.25) 100%)"
              : "rgba(255, 255, 255, 0.08)",
            border: `1px solid ${
              hasCustomKeys ? "rgba(16, 185, 129, 0.5)" : "rgba(255, 255, 255, 0.15)"
            }`,
            color: hasCustomKeys ? "#a7f3d0" : "#e5e7eb",
            fontSize: "0.76rem",
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
          title="Configure Razorpay & Gemini API Keys (BYOK)"
        >
          <Key size={13} color={hasCustomKeys ? "#34d399" : "#9ca3af"} />
          <span>{hasCustomKeys ? "Custom Keys Active" : "API Keys (BYOK)"}</span>
        </button>

        <button
          onClick={onReset}
          disabled={isResetting}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.35rem",
            padding: "0.38rem 0.8rem",
            borderRadius: 6,
            background: "#0D94FB",
            border: "none",
            color: "#ffffff",
            fontSize: "0.76rem",
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
          title="Reset database to initial state"
        >
          <RefreshCw
            size={12}
            className={isResetting ? "pulse-animation" : ""}
          />
          <span>{isResetting ? "Resetting..." : "Reset"}</span>
        </button>
      </div>
    </header>
  );
};
