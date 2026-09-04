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
  highlightedMessageId?: string | null;
}

export const EnvelopeTrace: React.FC<EnvelopeTraceProps> = ({
  messages,
  threadId,
  isLoading,
  highlightedMessageId,
}) => {
  const [filter, setFilter] = useState<"all" | "agents" | "policy" | "orders">(
    "all",
  );
  const [expandedJson, setExpandedJson] = useState<Record<string, boolean>>({});

  React.useEffect(() => {
    if (highlightedMessageId) {
      const el = document.getElementById(highlightedMessageId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [highlightedMessageId]);

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
      return [
        "ORDER_CREATE",
        "ORDER_CONFIRM",
        "ORDER_FAIL",
        "NETWORK_TIMEOUT",
        "IDEMPOTENT_RETRY",
        "WEBHOOK_RECEIVED",
      ].includes(msg.type);
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
      case "SPLIT_ACCEPT":
        return {
          bg: "#ecfeff",
          border: "#0891b2",
          color: "#0e7490",
          label: "PROPOSE SPLIT ACCEPT (Multi-Seller)",
        };
      case "UPSELL_DECLINE":
        return {
          bg: "#fff1f2",
          border: "#e11d48",
          color: "#be123c",
          label: "UPSELL DECLINED (Not in Menu / Cap)",
        };
      case "UPSELL_ACCEPT":
        return {
          bg: "#f0fdf4",
          border: "#16a34a",
          color: "#15803d",
          label: "UPSELL ACCEPTED (Recipe Validated)",
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
      case "ROUND_CAP_REACHED":
        return {
          bg: "#fffbeb",
          border: "#f59e0b",
          color: "#b45309",
          label: "ROUND CAP REACHED (Max 2 Rounds)",
        };
      case "INVENTORY_EVENT":
        return {
          bg: "#f0fdfa",
          border: "#0d9488",
          color: "#0f766e",
          label: "INVENTORY EVENT (Kitchen Order)",
        };
      case "ORDER_FAIL":
        return {
          bg: "#fef2f2",
          border: "#dc2626",
          color: "#b91c1c",
          label: "ORDER FAILED / BLOCKED",
        };
      case "NETWORK_TIMEOUT":
        return {
          bg: "#fffbeb",
          border: "#d97706",
          color: "#b45309",
          label: "NETWORK DROP (ECONNRESET)",
        };
      case "IDEMPOTENT_RETRY":
        return {
          bg: "#eff6ff",
          border: "#0284c7",
          color: "#0369a1",
          label: "IDEMPOTENT RETRY (Safe Recovery)",
        };
      case "WEBHOOK_RECEIVED":
        return {
          bg: "#faf5ff",
          border: "#9333ea",
          color: "#7e22ce",
          label: "WEBHOOK (HMAC-SHA256 Verified)",
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
    if (actor.includes("razor_pies"))
      return {
        label: "RazorPies",
        icon: <Bot size={13} color="#10b981" />,
        color: "#10b981",
      };
    if (actor.includes("razorcery_1"))
      return {
        label: "Razorcery-1",
        icon: <Bot size={13} color="#10b981" />,
        color: "#10b981",
      };
    if (actor.includes("razorcery_2"))
      return {
        label: "Razorcery-2",
        icon: <Bot size={13} color="#10b981" />,
        color: "#10b981",
      };
    if (actor.includes("razorslice") || actor.includes("buyer"))
      return {
        label: "RazorSlice (Buyer)",
        icon: <Bot size={13} color="#0D94FB" />,
        color: "#0D94FB",
      };
    if (actor.includes("seller"))
      return {
        label: "Seller Agent",
        icon: <Bot size={13} color="#10b981" />,
        color: "#10b981",
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

            const isHighlighted = highlightedMessageId === envelope.message_id;

            return (
              <div
                id={envelope.message_id}
                key={envelope.message_id || idx}
                className="fade-in"
                style={{
                  background: isHighlighted ? "rgba(13, 148, 251, 0.04)" : "#ffffff",
                  border: isHighlighted ? "2px solid #0D94FB" : "1px solid #e2e8f0",
                  borderLeft: `5px solid ${badge.border}`,
                  borderRadius: 8,
                  padding: "0.9rem 1rem",
                  position: "relative",
                  boxShadow: isHighlighted
                    ? "0 0 20px rgba(13, 148, 251, 0.35)"
                    : "0 1px 4px rgba(1, 38, 82, 0.04)",
                  transition: "all 0.3s ease",
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

                      {envelope.payload.rationale && (
                        <div style={{
                          marginTop: '0.4rem',
                          padding: '0.45rem 0.65rem',
                          background: '#f0f9ff',
                          border: '1px solid #bae6fd',
                          borderRadius: 6,
                          fontSize: '0.76rem',
                          color: '#0369a1',
                          lineHeight: 1.4
                        }}>
                          <strong style={{ color: '#012652' }}>Seller Pricing Rationale: </strong>
                          {envelope.payload.rationale}
                        </div>
                      )}

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

                  {/* SPLIT_ACCEPT Payload */}
                  {envelope.type === "SPLIT_ACCEPT" && (
                    <div>
                      <p style={{ color: "#0e7490", fontWeight: 700 }}>
                        {envelope.payload.rationale ||
                          "Multi-seller split procurement proposed for total cost optimization."}
                      </p>
                      {envelope.payload.split_deal?.splits && (
                        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.4rem", flexWrap: "wrap" }}>
                          {envelope.payload.split_deal.splits.map((s: any, sIdx: number) => (
                            <div
                              key={sIdx}
                              style={{
                                background: "#f0fdfa",
                                border: "1px solid #99f6e4",
                                borderRadius: 6,
                                padding: "0.35rem 0.6rem",
                                fontSize: "0.74rem",
                                color: "#115e59",
                              }}
                            >
                              <strong>{s.seller_id}</strong>: {s.quantity_kg} units @ ₹{s.unit_price} = <strong>₹{s.total_price}</strong>
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{ marginTop: "0.35rem", fontSize: "0.76rem", fontWeight: 800, color: "#0f766e" }}>
                        Total Split Value: ₹{envelope.payload.total_cost}
                      </div>
                      {Boolean(envelope.payload.split_deal?.unmet_quantity_kg) && (
                        <div style={{ marginTop: "0.35rem", fontSize: "0.74rem", fontWeight: 700, color: "#dc2626" }}>
                          ⚠️ Sourcing Shortfall: {envelope.payload.split_deal.unmet_quantity_kg} units unmet (market inventory depleted)
                        </div>
                      )}
                    </div>
                  )}

                  {/* UPSELL_DECLINE Payload */}
                  {envelope.type === "UPSELL_DECLINE" && (
                    <div style={{ background: "#fff1f2", padding: "0.45rem 0.65rem", borderRadius: 6, border: "1px solid #fecdd3" }}>
                      <p style={{ color: "#be123c", fontWeight: 600, fontSize: "0.78rem" }}>
                        {envelope.payload.narrative || envelope.payload.reason}
                      </p>
                    </div>
                  )}

                  {/* UPSELL_ACCEPT Payload */}
                  {envelope.type === "UPSELL_ACCEPT" && (
                    <div style={{ background: "#f0fdf4", padding: "0.45rem 0.65rem", borderRadius: 6, border: "1px solid #bbf7d0" }}>
                      <p style={{ color: "#15803d", fontWeight: 600, fontSize: "0.78rem" }}>
                        {envelope.payload.narrative || "Accepted recipe-validated bundle upsell within budget."}
                      </p>
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
                        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginTop: 2, alignItems: "center" }}>
                          <p
                            style={{
                              fontSize: "0.72rem",
                              color: "#64748b",
                              margin: 0,
                              fontFamily: "var(--font-mono)",
                            }}
                          >
                            Order: {envelope.payload.orderId}
                          </p>
                          {envelope.payload.paymentId && (
                            <p
                              style={{
                                fontSize: "0.72rem",
                                color: "#0369a1",
                                margin: 0,
                                fontFamily: "var(--font-mono)",
                                fontWeight: 700,
                              }}
                            >
                              Payment: {envelope.payload.paymentId}
                            </p>
                          )}
                          {envelope.payload.idempotency_key && (
                            <span
                              style={{
                                fontSize: "0.66rem",
                                color: "#0369a1",
                                fontWeight: 700,
                                background: "#eff6ff",
                                border: "1px solid #bfdbfe",
                                padding: "0.1rem 0.35rem",
                                borderRadius: 4,
                                fontFamily: "var(--font-mono)",
                              }}
                            >
                              🔑 {envelope.payload.idempotency_key}
                            </span>
                          )}
                          {envelope.payload.payment_method && (
                            <span
                              style={{
                                fontSize: "0.66rem",
                                color: "#0369a1",
                                background: "#f0f9ff",
                                border: "1px solid #bae6fd",
                                padding: "0.1rem 0.35rem",
                                borderRadius: 4,
                              }}
                            >
                              Method: {envelope.payload.payment_method.toUpperCase()}
                              {envelope.payload.internal_delegation_tag && (
                                <span style={{ color: "#0284c7", fontWeight: 600 }}> ({envelope.payload.internal_delegation_tag})</span>
                              )}
                            </span>
                          )}
                          {envelope.payload.signature_verified && (
                            <span
                              style={{
                                fontSize: "0.68rem",
                                color: "#15803d",
                                fontWeight: 700,
                                background: "rgba(34, 197, 94, 0.15)",
                                padding: "0.1rem 0.35rem",
                                borderRadius: 4,
                              }}
                            >
                              ✓ HMAC-SHA256 Verified
                            </span>
                          )}
                        </div>
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

                  {/* NETWORK_TIMEOUT */}
                  {envelope.type === "NETWORK_TIMEOUT" && (
                    <div
                      style={{
                        background: "#fffbeb",
                        border: "1px solid #fde68a",
                        borderRadius: 6,
                        padding: "0.55rem 0.75rem",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: "0.25rem",
                        }}
                      >
                        <strong style={{ color: "#b45309", fontSize: "0.82rem" }}>
                          ⚠️ Socket Hangup & Timeout ({envelope.payload.error_code || "ECONNRESET"})
                        </strong>
                        <span
                          style={{
                            fontSize: "0.65rem",
                            background: "#fef3c7",
                            color: "#92400e",
                            fontWeight: 700,
                            padding: "0.1rem 0.4rem",
                            borderRadius: 4,
                            border: "1px solid #fde68a",
                          }}
                        >
                          Attempt #{envelope.payload.attempt_number || 1}
                        </span>
                      </div>
                      <p style={{ fontSize: "0.74rem", color: "#475569", margin: "0.2rem 0" }}>
                        {envelope.payload.message ||
                          "Client lost HTTP socket connection mid-transaction. Downstream status unknown."}
                      </p>
                      {envelope.payload.idempotency_key && (
                        <div
                          style={{
                            fontSize: "0.68rem",
                            color: "#0369a1",
                            fontFamily: "var(--font-mono)",
                            marginTop: "0.3rem",
                          }}
                        >
                          Protected by Idempotency Key:{" "}
                          <strong>{envelope.payload.idempotency_key}</strong>
                        </div>
                      )}
                    </div>
                  )}

                  {/* IDEMPOTENT_RETRY */}
                  {envelope.type === "IDEMPOTENT_RETRY" && (
                    <div
                      style={{
                        background: "#eff6ff",
                        border: "1px solid #bfdbfe",
                        borderRadius: 6,
                        padding: "0.55rem 0.75rem",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: "0.25rem",
                        }}
                      >
                        <strong style={{ color: "#1d4ed8", fontSize: "0.82rem" }}>
                          🔄 Idempotent Reconnect & Dispatch
                        </strong>
                        <span
                          style={{
                            fontSize: "0.65rem",
                            background: envelope.payload.reuse_key ? "#ecfdf5" : "#fef3c7",
                            color: envelope.payload.reuse_key ? "#065f46" : "#92400e",
                            fontWeight: 700,
                            padding: "0.1rem 0.4rem",
                            borderRadius: 4,
                            border: `1px solid ${envelope.payload.reuse_key ? "#a7f3d0" : "#fde68a"}`,
                          }}
                        >
                          {envelope.payload.reuse_key
                            ? "Rule 1: SAME Idempotency Key"
                            : "Rule 2: FRESH Idempotency Key"}
                        </span>
                      </div>
                      <p style={{ fontSize: "0.74rem", color: "#334155", margin: "0.2rem 0" }}>
                        {envelope.payload.narrative || envelope.payload.message}
                      </p>
                      <div
                        style={{
                          display: "flex",
                          gap: "0.5rem",
                          fontSize: "0.68rem",
                          color: "#1e40af",
                          fontFamily: "var(--font-mono)",
                          marginTop: "0.25rem",
                          flexWrap: "wrap",
                        }}
                      >
                        <span>Key: <strong>{envelope.payload.idempotency_key}</strong></span>
                        {envelope.payload.vpa && (
                          <span>• Target VPA: <strong>{envelope.payload.vpa}</strong></span>
                        )}
                        {envelope.payload.backoff_ms !== undefined && (
                          <span>• Backoff: <strong>{envelope.payload.backoff_ms}ms</strong></span>
                        )}
                      </div>
                      {envelope.payload.primary_vpa && envelope.payload.backup_vpa && (
                        <div
                          style={{
                            marginTop: "0.35rem",
                            padding: "0.3rem 0.55rem",
                            background: "rgba(30, 64, 175, 0.06)",
                            borderRadius: 4,
                            border: "1px solid rgba(191, 219, 254, 0.6)",
                            fontSize: "0.68rem",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.35rem",
                            flexWrap: "wrap",
                          }}
                        >
                          <span style={{ color: "#dc2626", fontWeight: 700 }}>Primary VPA Hard Declined:</span>
                          <code style={{ color: "#991b1b", background: "#fee2e2", padding: "0.05rem 0.25rem", borderRadius: 3 }}>
                            {envelope.payload.primary_vpa}
                          </code>
                          <span style={{ color: "#64748b" }}>➔</span>
                          <span style={{ color: "#15803d", fontWeight: 700 }}>Falling back to Backup UPI:</span>
                          <code style={{ color: "#166534", background: "#dcfce7", padding: "0.05rem 0.25rem", borderRadius: 3 }}>
                            {envelope.payload.backup_vpa}
                          </code>
                        </div>
                      )}
                    </div>
                  )}

                  {/* WEBHOOK_RECEIVED */}
                  {envelope.type === "WEBHOOK_RECEIVED" && (
                    <div
                      style={{
                        background: "#faf5ff",
                        border: "1px solid #e9d5ff",
                        borderRadius: 6,
                        padding: "0.55rem 0.75rem",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: "0.25rem",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                          <span
                            style={{
                              fontSize: "0.68rem",
                              fontWeight: 800,
                              padding: "0.1rem 0.4rem",
                              borderRadius: 4,
                              background: envelope.payload.event === "payment.captured" ? "#dcfce7" : "#fee2e2",
                              color: envelope.payload.event === "payment.captured" ? "#15803d" : "#b91c1c",
                              border: `1px solid ${envelope.payload.event === "payment.captured" ? "#86efac" : "#fca5a5"}`,
                            }}
                          >
                            EVENT: {envelope.payload.event}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: "0.66rem",
                            color: "#7e22ce",
                            fontWeight: 700,
                            background: "#f3e8ff",
                            padding: "0.1rem 0.4rem",
                            borderRadius: 4,
                            border: "1px solid #d8b4fe",
                          }}
                        >
                          ✓ HMAC-SHA256 Signature Verified
                        </span>
                      </div>
                      <p style={{ fontSize: "0.74rem", color: "#475569", margin: "0.2rem 0" }}>
                        {envelope.payload.narrative ||
                          `Webhook received and validated for order ${envelope.payload.orderId}`}
                      </p>
                      <div
                        style={{
                          fontSize: "0.68rem",
                          color: "#6b21a8",
                          fontFamily: "var(--font-mono)",
                          display: "flex",
                          gap: "0.6rem",
                          marginTop: "0.25rem",
                          flexWrap: "wrap",
                        }}
                      >
                        <span>Order: {envelope.payload.orderId}</span>
                        {envelope.payload.paymentId && <span>Payment: {envelope.payload.paymentId}</span>}
                        {envelope.payload.error_code && (
                          <span style={{ color: "#dc2626" }}>Error: {envelope.payload.error_code}</span>
                        )}
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
                          justifyContent: "space-between",
                          marginBottom: "0.25rem",
                        }}
                      >
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
                              : envelope.payload.error_code
                              ? `Payment Failed: ${envelope.payload.error_code}`
                              : envelope.payload.message ||
                                envelope.payload.reason ||
                                "Transaction Blocked"}
                          </strong>
                        </div>
                        {envelope.payload.webhook_verified && (
                          <span
                            style={{
                              fontSize: "0.65rem",
                              fontWeight: 700,
                              color: "#b91c1c",
                              background: "#fee2e2",
                              padding: "0.1rem 0.35rem",
                              borderRadius: 4,
                              border: "1px solid #fecaca",
                            }}
                          >
                            Webhook Verified ✓
                          </span>
                        )}
                      </div>

                      <p
                        style={{
                          fontSize: "0.74rem",
                          color: "#475569",
                          marginTop: "0.25rem",
                          marginBottom: envelope.payload.error_code ? "0.4rem" : 0,
                        }}
                      >
                        {envelope.payload.error_description ||
                          envelope.payload.message ||
                          envelope.payload.narrative ||
                          "Zero money transferred."}
                      </p>

                      {/* Genuine Razorpay Error Diagnostics Grid */}
                      {envelope.payload.error_code && (
                        <div
                          style={{
                            background: "#fff1f2",
                            border: "1px solid #fecdd3",
                            borderRadius: 6,
                            padding: "0.4rem 0.6rem",
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                            gap: "0.35rem",
                            fontSize: "0.68rem",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          <div>
                            <span style={{ color: "#9f1239" }}>code: </span>
                            <strong>{envelope.payload.error_code}</strong>
                          </div>
                          {envelope.payload.error_step && (
                            <div>
                              <span style={{ color: "#9f1239" }}>step: </span>
                              <strong>{envelope.payload.error_step}</strong>
                            </div>
                          )}
                          {envelope.payload.error_source && (
                            <div>
                              <span style={{ color: "#9f1239" }}>source: </span>
                              <strong>{envelope.payload.error_source}</strong>
                            </div>
                          )}
                          {envelope.payload.idempotency_key && (
                            <div>
                              <span style={{ color: "#9f1239" }}>key: </span>
                              <strong>{envelope.payload.idempotency_key}</strong>
                            </div>
                          )}
                        </div>
                      )}
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
