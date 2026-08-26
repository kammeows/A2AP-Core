import React, { useState } from "react";
import { Envelope, MessageType, PolicyCheck } from "../types";
import {
  FileText,
  ShieldCheck,
  ShieldAlert,
  CreditCard,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Code,
  Sparkles,
  ChevronDown,
  ChevronUp,
  AlertOctagon,
  Bot,
  UserCheck,
} from "lucide-react";

interface EnvelopeTraceProps {
  messages: Envelope[];
  threadId: string | null;
  isLoading: boolean;
}

export const EnvelopeTrace: React.FC<EnvelopeTraceProps> = ({
  messages,
  threadId,
  isLoading,
}) => {
  const [filter, setFilter] = useState<"all" | "agents" | "policy" | "orders">(
    "all",
  );
  const [expandedJson, setExpandedJson] = useState<Record<string, boolean>>({});

  const toggleJson = (id: string) => {
    setExpandedJson((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredMessages = messages.filter((msg) => {
    if (filter === "agents") {
      return ["RFQ", "OFFER", "COUNTER_OFFER", "ACCEPT", "REJECT"].includes(
        msg.type,
      );
    }
    if (filter === "policy") {
      return msg.type === "POLICY_CHECK";
    }
    if (filter === "orders") {
      return ["ORDER_CREATE", "ORDER_CONFIRM", "ORDER_FAIL"].includes(msg.type);
    }
    return true;
  });

  const getBadgeStyle = (type: MessageType) => {
    switch (type) {
      case "RFQ":
        return {
          bg: "#eff6ff",
          border: "#0D94FB",
          color: "#0369a1",
          label: "RFQ (Request for Quote)",
        };
      case "OFFER":
        return {
          bg: "#f5f3ff",
          border: "#7c3aed",
          color: "#6d28d9",
          label: "OFFER (Wholesale Quote)",
        };
      case "COUNTER_OFFER":
        return {
          bg: "#fff7ed",
          border: "#ea580c",
          color: "#c2410c",
          label: "COUNTER OFFER (Renegotiation)",
        };
      case "ACCEPT":
        return {
          bg: "#f0fdf4",
          border: "#16a34a",
          color: "#15803d",
          label: "PROPOSE ACCEPT (Awaiting Policy)",
        };
      case "POLICY_CHECK":
        return {
          bg: "#fefce8",
          border: "#ca8a04",
          color: "#a16207",
          label: "POLICY CHECK (Deterministic Gate)",
        };
      case "ORDER_CREATE":
        return {
          bg: "#f0f9ff",
          border: "#0284c7",
          color: "#0369a1",
          label: "ORDER CREATE (Razorpay Paired)",
        };
      case "ORDER_CONFIRM":
        return {
          bg: "#ecfdf5",
          border: "#059669",
          color: "#047857",
          label: "ORDER CONFIRMED (Test Paid)",
        };
      case "ORDER_FAIL":
        return {
          bg: "#fef2f2",
          border: "#dc2626",
          color: "#b91c1c",
          label: "ORDER FAILED / BLOCKED",
        };
      case "REJECT":
        return {
          bg: "#fef2f2",
          border: "#dc2626",
          color: "#b91c1c",
          label: "REJECT",
        };
      default:
        return {
          bg: "#f8fafc",
          border: "#64748b",
          color: "#334155",
          label: type,
        };
    }
  };

  const getActorLabel = (actor: string) => {
    if (actor.includes("buyer"))
      return {
        label: "Buyer Agent",
        icon: <Bot size={13} color="#0D94FB" />,
        color: "#0D94FB",
      };
    if (actor.includes("seller"))
      return {
        label: "Seller Agent",
        icon: <Bot size={13} color="#012652" />,
        color: "#012652",
      };
    if (actor.includes("policy_engine"))
      return {
        label: "Policy Engine",
        icon: <ShieldCheck size={13} color="#d97706" />,
        color: "#b45309",
      };
    if (actor.includes("razorpay"))
      return {
        label: "Razorpay API",
        icon: <CreditCard size={13} color="#0284c7" />,
        color: "#0369a1",
      };
    if (actor.includes("human"))
      return {
        label: "Human Manager",
        icon: <UserCheck size={13} color="#012652" />,
        color: "#012652",
      };
    return { label: actor, icon: null, color: "#475569" };
  };

  return (
    <div className="clean-card">
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
            <FileText size={18} />
          </div>
          <div>
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <h2
                style={{
                  fontSize: "1.05rem",
                  fontWeight: 700,
                  color: "#0D94FB",
                  margin: 0,
                }}
              >
                Full Explainability Envelope Trace
              </h2>
              {threadId && (
                <span
                  style={{
                    fontSize: "0.68rem",
                    fontFamily: "var(--font-mono)",
                    padding: "0.15rem 0.45rem",
                    borderRadius: 4,
                    background: "#f1f5f9",
                    color: "#012652",
                    border: "1px solid #e2e8f0",
                    fontWeight: 600,
                  }}
                >
                  {threadId}
                </span>
              )}
            </div>
            <p style={{ fontSize: "0.76rem", color: "#475569", marginTop: 1 }}>
              Structured message logs with decision explainability
            </p>
          </div>
        </div>

        {/* Filter Pills */}
        <div
          style={{
            display: "flex",
            gap: "0.25rem",
            background: "#f1f5f9",
            padding: 3,
            borderRadius: 6,
            border: "1px solid #e2e8f0",
          }}
        >
          {(["all", "agents", "policy", "orders"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              style={{
                padding: "0.25rem 0.6rem",
                borderRadius: 4,
                fontSize: "0.74rem",
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
                background: filter === tab ? "#012652" : "transparent",
                color: filter === tab ? "#ffffff" : "#64748b",
                transition: "all 0.15s ease",
              }}
            >
              {tab === "all" && `All (${messages.length})`}
              {tab === "agents" && "A2A Chat"}
              {tab === "policy" && "Policy Engine"}
              {tab === "orders" && "Payment"}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div
          style={{
            padding: "3rem 1rem",
            textAlign: "center",
            color: "#64748b",
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              border: "3px solid #0D94FB",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 0.75rem",
            }}
          />
          <p style={{ fontSize: "0.9rem", fontWeight: 700, color: "#012652" }}>
            Executing Multi-Turn Agent Negotiation...
          </p>
          <p style={{ fontSize: "0.78rem", color: "#64748b", marginTop: 2 }}>
            AI agents communicating in real time
          </p>
        </div>
      ) : filteredMessages.length === 0 ? (
        <div
          style={{
            padding: "2.5rem 1rem",
            textAlign: "center",
            background: "#f8fafc",
            borderRadius: 8,
            border: "1px dashed #cbd5e1",
            color: "#64748b",
          }}
        >
          <Sparkles
            size={28}
            style={{ margin: "0 auto 0.5rem", opacity: 0.5, color: "#0D94FB" }}
          />
          <p style={{ fontSize: "0.9rem", color: "#012652", fontWeight: 700 }}>
            No Envelopes in Trace Yet
          </p>
          <p style={{ fontSize: "0.78rem", marginTop: 2 }}>
            Click <strong>"Update & Start AI Evaluation"</strong> to start agent
            negotiation.
          </p>
        </div>
      ) : (
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
        >
          {filteredMessages.map((envelope, idx) => {
            const badge = getBadgeStyle(envelope.type);
            const fromActor = getActorLabel(envelope.from);
            const toActor = getActorLabel(envelope.to);
            const isJsonOpen = Boolean(expandedJson[envelope.message_id]);

            return (
              <div
                key={envelope.message_id || idx}
                className="fade-in"
                style={{
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderLeft: `4px solid ${badge.border}`,
                  borderRadius: 8,
                  padding: "0.9rem 1rem",
                  position: "relative",
                  boxShadow: "0 1px 4px rgba(1, 38, 82, 0.04)",
                }}
              >
                {/* Envelope Header Bar */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "0.5rem",
                    flexWrap: "wrap",
                    gap: "0.4rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <span
                      style={{
                        padding: "0.18rem 0.5rem",
                        borderRadius: 4,
                        background: badge.bg,
                        border: `1px solid ${badge.border}44`,
                        color: badge.color,
                        fontSize: "0.72rem",
                        fontWeight: 800,
                        letterSpacing: "0.01em",
                      }}
                    >
                      {badge.label}
                    </span>

                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.35rem",
                        fontSize: "0.74rem",
                        color: "#475569",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      <span
                        style={{
                          color: fromActor.color,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 3,
                        }}
                      >
                        {fromActor.icon}
                        <strong>{fromActor.label}</strong>
                      </span>
                      <ArrowRight size={11} color="#94a3b8" />
                      <span
                        style={{
                          color: toActor.color,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 3,
                        }}
                      >
                        {toActor.icon}
                        <strong>{toActor.label}</strong>
                      </span>
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        fontSize: "0.68rem",
                        color: "#64748b",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      <Clock size={11} />
                      {new Date(envelope.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>

                    <button
                      onClick={() => toggleJson(envelope.message_id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        padding: "0.15rem 0.45rem",
                        borderRadius: 4,
                        background: isJsonOpen ? "#f1f5f9" : "#ffffff",
                        border: "1px solid #cbd5e1",
                        color: isJsonOpen ? "#012652" : "#64748b",
                        fontSize: "0.68rem",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                      title="Inspect Raw JSON Envelope"
                    >
                      <Code size={11} />
                      <span>{isJsonOpen ? "Hide" : "JSON"}</span>
                      {isJsonOpen ? (
                        <ChevronUp size={11} />
                      ) : (
                        <ChevronDown size={11} />
                      )}
                    </button>
                  </div>
                </div>

                {/* Envelope Body Details */}
                <div
                  style={{
                    fontSize: "0.84rem",
                    color: "#0f172a",
                    lineHeight: 1.5,
                  }}
                >
                  {/* RFQ Payload */}
                  {envelope.type === "RFQ" && (
                    <div>
                      <p style={{ color: "#000000", fontWeight: 600 }}>
                        {envelope.payload.narrative ||
                          `Requested quote for ${envelope.payload.quantity_kg}kg ${envelope.payload.item}.`}
                      </p>
                      <div
                        style={{
                          display: "flex",
                          gap: "0.75rem",
                          marginTop: "0.35rem",
                          flexWrap: "wrap",
                          fontSize: "0.76rem",
                          color: "#475569",
                        }}
                      >
                        <span>
                          Item:{" "}
                          <strong style={{ color: "#012652" }}>
                            {envelope.payload.item}
                          </strong>
                        </span>
                        <span>
                          Quantity:{" "}
                          <strong style={{ color: "#0D94FB" }}>
                            {envelope.payload.quantity_kg} kg
                          </strong>
                        </span>
                        <span>
                          Quality:{" "}
                          <strong style={{ color: "#012652" }}>
                            {envelope.payload.quality_min || "Grade A"}
                          </strong>
                        </span>
                        <span>
                          Max Price Ceiling:{" "}
                          <strong style={{ color: "#059669" }}>
                            ₹{envelope.payload.buyer_max_price_per_kg || 35}/kg
                          </strong>
                        </span>
                      </div>
                    </div>
                  )}

                  {/* OFFER Payload */}
                  {envelope.type === "OFFER" && (
                    <div>
                      <p style={{ color: "#000000", fontWeight: 600 }}>
                        {envelope.payload.narrative ||
                          `Wholesale offer: ${envelope.payload.quantity_kg}kg at ₹${envelope.payload.final_price_per_kg}/kg.`}
                      </p>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(130px, 1fr))",
                          gap: "0.5rem",
                          marginTop: "0.45rem",
                          background: "#f8fafc",
                          padding: "0.5rem 0.7rem",
                          borderRadius: 6,
                          border: "1px solid #e2e8f0",
                          fontSize: "0.75rem",
                        }}
                      >
                        <div>
                          <span style={{ color: "#64748b" }}>Base Price:</span>
                          <p style={{ fontWeight: 700, color: "#0f172a" }}>
                            ₹{envelope.payload.base_price_per_kg}/kg
                          </p>
                        </div>
                        <div>
                          <span style={{ color: "#64748b" }}>
                            Discount Tier:
                          </span>
                          <p style={{ fontWeight: 700, color: "#7c3aed" }}>
                            {envelope.payload.discount_pct}% (
                            {envelope.payload.discount_reason})
                          </p>
                        </div>
                        <div>
                          <span style={{ color: "#64748b" }}>Final Rate:</span>
                          <p style={{ fontWeight: 700, color: "#0D94FB" }}>
                            ₹{envelope.payload.final_price_per_kg}/kg
                          </p>
                        </div>
                        <div>
                          <span style={{ color: "#64748b" }}>Total Value:</span>
                          <p
                            style={{
                              fontWeight: 800,
                              color: "#059669",
                              fontSize: "0.85rem",
                            }}
                          >
                            ₹{envelope.payload.total_price}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ACCEPT Payload */}
                  {envelope.type === "ACCEPT" && (
                    <div>
                      <p style={{ color: "#000000", fontWeight: 500 }}>
                        {envelope.payload.rationale ||
                          "Buyer agent proposed acceptance of wholesale quote."}
                      </p>
                      <span
                        style={{
                          display: "inline-block",
                          marginTop: "0.25rem",
                          fontSize: "0.72rem",
                          color: "#b45309",
                          background: "#fef3c7",
                          padding: "0.12rem 0.45rem",
                          borderRadius: 4,
                          border: "1px solid #fde68a",
                          fontWeight: 600,
                        }}
                      >
                        LLM proposes deal $\rightarrow$ Policy Engine
                        mathematically evaluates before payment
                      </span>
                    </div>
                  )}

                  {/* POLICY_CHECK Payload */}
                  {envelope.type === "POLICY_CHECK" && (
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.45rem",
                          marginBottom: "0.35rem",
                        }}
                      >
                        {envelope.payload.approved ? (
                          <ShieldCheck size={17} color="#16a34a" />
                        ) : (
                          <ShieldAlert size={17} color="#dc2626" />
                        )}
                        <strong
                          style={{
                            color: envelope.payload.approved
                              ? "#15803d"
                              : "#b91c1c",
                          }}
                        >
                          {envelope.payload.summary ||
                            (envelope.payload.approved
                              ? "Policy Checks PASSED"
                              : "Policy Checks FAILED")}
                        </strong>
                      </div>

                      {/* Rule Checks List */}
                      {Array.isArray(envelope.payload.checks) && (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.3rem",
                            marginTop: "0.35rem",
                          }}
                        >
                          {envelope.payload.checks.map(
                            (check: PolicyCheck, cIdx: number) => (
                              <div
                                key={cIdx}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  background: "#f8fafc",
                                  padding: "0.3rem 0.6rem",
                                  borderRadius: 4,
                                  border: `1px solid ${check.passed ? "#bbf7d0" : "#fecaca"}`,
                                  fontSize: "0.73rem",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.35rem",
                                  }}
                                >
                                  {check.passed ? (
                                    <CheckCircle2 size={13} color="#16a34a" />
                                  ) : (
                                    <XCircle size={13} color="#dc2626" />
                                  )}
                                  <span
                                    style={{
                                      fontFamily: "var(--font-mono)",
                                      fontWeight: 700,
                                      color: "#012652",
                                    }}
                                  >
                                    {check.rule}
                                  </span>
                                </div>
                                <span
                                  style={{
                                    color: check.passed ? "#15803d" : "#b91c1c",
                                    fontSize: "0.72rem",
                                    fontWeight: 600,
                                  }}
                                >
                                  {check.detail ||
                                    (check.passed ? "PASS" : "BREACH")}
                                </span>
                              </div>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* COUNTER_OFFER Payload */}
                  {envelope.type === "COUNTER_OFFER" && (
                    <div>
                      <p style={{ color: "#c2410c", fontWeight: 600 }}>
                        {envelope.payload.reason}
                      </p>
                      <div
                        style={{
                          marginTop: "0.25rem",
                          fontSize: "0.75rem",
                          color: "#475569",
                        }}
                      >
                        Proposed quantity:{" "}
                        <strong style={{ color: "#012652" }}>
                          {envelope.payload.quantity_kg} kg
                        </strong>
                      </div>
                    </div>
                  )}

                  {/* ORDER_CREATE & ORDER_CONFIRM */}
                  {(envelope.type === "ORDER_CREATE" ||
                    envelope.type === "ORDER_CONFIRM") && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "0.4rem",
                      }}
                    >
                      <div>
                        <p style={{ color: "#15803d", fontWeight: 700 }}>
                          {envelope.payload.message ||
                            `Razorpay Order ${envelope.payload.orderId} created successfully.`}
                        </p>
                        <p
                          style={{
                            fontSize: "0.72rem",
                            color: "#64748b",
                            marginTop: 1,
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          Receipt:{" "}
                          {envelope.payload.receipt || envelope.payload.orderId}
                        </p>
                      </div>
                      <div
                        style={{
                          padding: "0.2rem 0.55rem",
                          borderRadius: 4,
                          background: "#dcfce7",
                          border: "1px solid #86efac",
                          color: "#15803d",
                          fontWeight: 800,
                          fontSize: "0.8rem",
                        }}
                      >
                        ₹
                        {envelope.payload.amount_inr ||
                          envelope.payload.total_price}
                      </div>
                    </div>
                  )}

                  {/* ORDER_FAIL & REJECT */}
                  {(envelope.type === "ORDER_FAIL" ||
                    envelope.type === "REJECT") && (
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          color: "#b91c1c",
                        }}
                      >
                        <AlertOctagon size={15} />
                        <strong style={{ fontSize: "0.84rem" }}>
                          {envelope.payload.reason === "NO_SELLER_FOUND"
                            ? "No Seller Found / Out of Stock"
                            : envelope.payload.message ||
                              envelope.payload.reason ||
                              "Transaction Blocked"}
                        </strong>
                      </div>
                      <p
                        style={{
                          fontSize: "0.74rem",
                          color: "#475569",
                          marginTop: "0.25rem",
                        }}
                      >
                        {envelope.payload.message ||
                          envelope.payload.narrative ||
                          "Zero money transferred."}
                      </p>
                    </div>
                  )}
                </div>

                {/* Collapsible JSON Drawer */}
                {isJsonOpen && (
                  <div
                    style={{
                      marginTop: "0.65rem",
                      background: "#f8fafc",
                      border: "1px solid #cbd5e1",
                      borderRadius: 6,
                      padding: "0.65rem",
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.72rem",
                      color: "#012652",
                      overflowX: "auto",
                    }}
                  >
                    <pre style={{ margin: 0 }}>
                      {JSON.stringify(envelope, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
