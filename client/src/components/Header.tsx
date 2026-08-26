import React from "react";
import {
  Cpu,
  ShieldCheck,
  RefreshCw,
  Layers,
  CheckCircle2,
} from "lucide-react";

interface HeaderProps {
  onReset: () => void;
  isResetting: boolean;
  delegationMode: "full" | "partial";
}

export const Header: React.FC<HeaderProps> = ({
  onReset,
  isResetting,
  delegationMode,
}) => {
  return (
    <header className="app-banner">
      <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: "#0D94FB",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
            boxShadow: "0 2px 8px rgba(13, 148, 251, 0.4)",
          }}
        >
          <Cpu size={22} color="#ffffff" />
        </div>
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
                fontSize: "1.25rem",
                fontWeight: 800,
                color: "#ffffff",
                letterSpacing: "-0.01em",
                margin: 0,
              }}
            >
              A2A Bounded Procurement Agent
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

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            padding: "0.35rem 0.7rem",
            borderRadius: 6,
            background: "rgba(255, 255, 255, 0.1)",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            fontSize: "0.76rem",
            color: "#ffffff",
          }}
        >
          <CheckCircle2 size={14} color="#34d399" />
          <span>Razorpay Test Mode</span>
        </div>

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
