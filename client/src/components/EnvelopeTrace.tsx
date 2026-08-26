import React, { useState } from 'react';
import {
  Envelope,
  MessageType,
  PolicyCheck,
} from '../types';
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
} from 'lucide-react';

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
  const [filter, setFilter] = useState<'all' | 'agents' | 'policy' | 'orders'>('all');
  const [expandedJson, setExpandedJson] = useState<Record<string, boolean>>({});

  const toggleJson = (id: string) => {
    setExpandedJson((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredMessages = messages.filter((msg) => {
    if (filter === 'agents') {
      return ['RFQ', 'OFFER', 'COUNTER_OFFER', 'ACCEPT', 'REJECT'].includes(msg.type);
    }
    if (filter === 'policy') {
      return msg.type === 'POLICY_CHECK';
    }
    if (filter === 'orders') {
      return ['ORDER_CREATE', 'ORDER_CONFIRM', 'ORDER_FAIL'].includes(msg.type);
    }
    return true;
  });

  const getBadgeStyle = (type: MessageType) => {
    switch (type) {
      case 'RFQ':
        return { bg: 'rgba(56, 189, 248, 0.12)', border: '#38bdf8', color: '#38bdf8', label: 'RFQ (Request for Quote)' };
      case 'OFFER':
        return { bg: 'rgba(192, 132, 252, 0.12)', border: '#c084fc', color: '#c084fc', label: 'OFFER (Wholesale Quote)' };
      case 'COUNTER_OFFER':
        return { bg: 'rgba(251, 146, 60, 0.12)', border: '#fb923c', color: '#fb923c', label: 'COUNTER OFFER (Renegotiation)' };
      case 'ACCEPT':
        return { bg: 'rgba(52, 211, 153, 0.12)', border: '#34d399', color: '#34d399', label: 'PROPOSE ACCEPT (Awaiting Policy)' };
      case 'POLICY_CHECK':
        return { bg: 'rgba(251, 191, 36, 0.12)', border: '#fbbf24', color: '#fbbf24', label: 'POLICY CHECK (Deterministic Gate)' };
      case 'ORDER_CREATE':
        return { bg: 'rgba(96, 165, 250, 0.12)', border: '#60a5fa', color: '#60a5fa', label: 'ORDER CREATE (Razorpay Paired)' };
      case 'ORDER_CONFIRM':
        return { bg: 'rgba(16, 185, 129, 0.15)', border: '#10b981', color: '#34d399', label: 'ORDER CONFIRMED (Test Paid)' };
      case 'ORDER_FAIL':
        return { bg: 'rgba(239, 68, 68, 0.12)', border: '#ef4444', color: '#f87171', label: 'ORDER FAILED / BLOCKED' };
      case 'REJECT':
        return { bg: 'rgba(239, 68, 68, 0.12)', border: '#ef4444', color: '#f87171', label: 'REJECT' };
      default:
        return { bg: '#1e293b', border: '#64748b', color: '#94a3b8', label: type };
    }
  };

  const getActorLabel = (actor: string) => {
    if (actor.includes('buyer')) return { label: 'Buyer Agent', icon: <Bot size={13} color="#38bdf8" />, color: '#38bdf8' };
    if (actor.includes('seller')) return { label: 'Seller Agent', icon: <Bot size={13} color="#c084fc" />, color: '#c084fc' };
    if (actor.includes('policy_engine')) return { label: 'Policy Engine', icon: <ShieldCheck size={13} color="#fbbf24" />, color: '#fbbf24' };
    if (actor.includes('razorpay')) return { label: 'Razorpay Orders API', icon: <CreditCard size={13} color="#60a5fa" />, color: '#60a5fa' };
    if (actor.includes('human')) return { label: 'Human Manager', icon: <UserCheck size={13} color="#f59e0b" />, color: '#f59e0b' };
    return { label: actor, icon: null, color: '#94a3b8' };
  };

  return (
    <div className="glass-card">
      <div className="glass-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'rgba(56, 189, 248, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#38bdf8'
          }}>
            <FileText size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc' }}>
                Full Explainability Envelope Trace
              </h2>
              {threadId && (
                <span style={{
                  fontSize: '0.68rem',
                  fontFamily: 'var(--font-mono)',
                  padding: '0.15rem 0.5rem',
                  borderRadius: 4,
                  background: '#1e293b',
                  color: '#94a3b8'
                }}>
                  {threadId}
                </span>
              )}
            </div>
            <p style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
              Cryptographically traceable message logs with rule-by-rule decision explainability
            </p>
          </div>
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '0.35rem', background: '#0b111e', padding: 3, borderRadius: 8, border: '1px solid #1e293b' }}>
          {(['all', 'agents', 'policy', 'orders'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              style={{
                padding: '0.25rem 0.65rem',
                borderRadius: 6,
                fontSize: '0.74rem',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                background: filter === tab ? '#0284c7' : 'transparent',
                color: filter === tab ? '#fff' : '#94a3b8',
                transition: 'all 0.15s ease'
              }}
            >
              {tab === 'all' && `All (${messages.length})`}
              {tab === 'agents' && 'A2A Chat'}
              {tab === 'policy' && 'Policy Engine'}
              {tab === 'orders' && 'Payment & Failures'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: '3rem 1rem', textAlign: 'center', color: '#94a3b8' }}>
          <div style={{
            width: 32,
            height: 32,
            border: '3px solid #0284c7',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem'
          }} />
          <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>Executing Multi-Turn Agent Negotiation...</p>
          <p style={{ fontSize: '0.78rem', color: '#64748b' }}>
            Logging structured envelopes to SQLite audit database
          </p>
        </div>
      ) : filteredMessages.length === 0 ? (
        <div style={{
          padding: '3rem 1rem',
          textAlign: 'center',
          background: '#0a0f1d',
          borderRadius: 12,
          border: '1px dashed #233044',
          color: '#64748b'
        }}>
          <Sparkles size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
          <p style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 600 }}>No Envelopes in Trace Yet</p>
          <p style={{ fontSize: '0.78rem', marginTop: 4 }}>
            Click <strong>"Update & Run AI Evaluation"</strong> above to start agent negotiation.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
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
                  background: '#0d1524',
                  border: `1px solid ${badge.border}44`,
                  borderLeft: `4px solid ${badge.border}`,
                  borderRadius: 12,
                  padding: '1rem 1.15rem',
                  position: 'relative',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)'
                }}
              >
                {/* Envelope Header Bar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{
                      padding: '0.2rem 0.55rem',
                      borderRadius: 6,
                      background: badge.bg,
                      border: `1px solid ${badge.border}66`,
                      color: badge.color,
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      letterSpacing: '0.02em'
                    }}>
                      {badge.label}
                    </span>

                    <span style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontSize: '0.74rem',
                      color: '#94a3b8',
                      fontFamily: 'var(--font-mono)'
                    }}>
                      <span style={{ color: fromActor.color, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {fromActor.icon}
                        <strong>{fromActor.label}</strong>
                      </span>
                      <ArrowRight size={12} color="#64748b" />
                      <span style={{ color: toActor.color, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {toActor.icon}
                        <strong>{toActor.label}</strong>
                      </span>
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <span style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      fontSize: '0.68rem',
                      color: '#64748b',
                      fontFamily: 'var(--font-mono)'
                    }}>
                      <Clock size={11} />
                      {new Date(envelope.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })}
                    </span>

                    <button
                      onClick={() => toggleJson(envelope.message_id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.15rem 0.45rem',
                        borderRadius: 4,
                        background: isJsonOpen ? '#1e293b' : 'transparent',
                        border: '1px solid #334155',
                        color: isJsonOpen ? '#38bdf8' : '#94a3b8',
                        fontSize: '0.68rem',
                        cursor: 'pointer'
                      }}
                      title="Inspect Raw JSON Envelope"
                    >
                      <Code size={11} />
                      <span>{isJsonOpen ? 'Hide JSON' : 'JSON'}</span>
                      {isJsonOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    </button>
                  </div>
                </div>

                {/* Envelope Narrative / Body Details */}
                <div style={{ fontSize: '0.84rem', color: '#e2e8f0', lineHeight: 1.5 }}>
                  {/* RFQ Payload */}
                  {envelope.type === 'RFQ' && (
                    <div>
                      <p style={{ color: '#f1f5f9', fontWeight: 600 }}>
                        {envelope.payload.narrative || `Requested quote for ${envelope.payload.quantity_kg}kg ${envelope.payload.item}.`}
                      </p>
                      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.45rem', flexWrap: 'wrap', fontSize: '0.76rem', color: '#94a3b8' }}>
                        <span>Item: <strong style={{ color: '#fff' }}>{envelope.payload.item}</strong></span>
                        <span>Quantity: <strong style={{ color: '#38bdf8' }}>{envelope.payload.quantity_kg} kg</strong></span>
                        <span>Quality: <strong style={{ color: '#fff' }}>{envelope.payload.quality_min || 'Grade A'}</strong></span>
                        <span>Max Price Ceiling: <strong style={{ color: '#34d399' }}>₹{envelope.payload.buyer_max_price_per_kg || 35}/kg</strong></span>
                      </div>
                    </div>
                  )}

                  {/* OFFER Payload */}
                  {envelope.type === 'OFFER' && (
                    <div>
                      <p style={{ color: '#f1f5f9', fontWeight: 600 }}>
                        {envelope.payload.narrative || `Wholesale offer: ${envelope.payload.quantity_kg}kg at ₹${envelope.payload.final_price_per_kg}/kg.`}
                      </p>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                        gap: '0.5rem',
                        marginTop: '0.5rem',
                        background: '#09101c',
                        padding: '0.6rem 0.75rem',
                        borderRadius: 8,
                        border: '1px solid #1a2538',
                        fontSize: '0.75rem'
                      }}>
                        <div>
                          <span style={{ color: '#64748b' }}>Base Price:</span>
                          <p style={{ fontWeight: 600 }}>₹{envelope.payload.base_price_per_kg}/kg</p>
                        </div>
                        <div>
                          <span style={{ color: '#64748b' }}>Discount Tier:</span>
                          <p style={{ fontWeight: 600, color: '#c084fc' }}>
                            {envelope.payload.discount_pct}% ({envelope.payload.discount_reason})
                          </p>
                        </div>
                        <div>
                          <span style={{ color: '#64748b' }}>Final Rate:</span>
                          <p style={{ fontWeight: 600, color: '#38bdf8' }}>₹{envelope.payload.final_price_per_kg}/kg</p>
                        </div>
                        <div>
                          <span style={{ color: '#64748b' }}>Total Value:</span>
                          <p style={{ fontWeight: 700, color: '#34d399', fontSize: '0.85rem' }}>₹{envelope.payload.total_price}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ACCEPT Payload */}
                  {envelope.type === 'ACCEPT' && (
                    <div>
                      <p style={{ color: '#f1f5f9' }}>
                        {envelope.payload.rationale || 'Buyer agent proposed acceptance of wholesale quote.'}
                      </p>
                      <span style={{
                        display: 'inline-block',
                        marginTop: '0.35rem',
                        fontSize: '0.72rem',
                        color: '#fbbf24',
                        background: 'rgba(251, 191, 36, 0.1)',
                        padding: '0.15rem 0.5rem',
                        borderRadius: 4,
                        border: '1px solid rgba(251, 191, 36, 0.3)'
                      }}>
                        ⚡ LLM cannot move money: Forwarded to Policy Engine for mathematical verification
                      </span>
                    </div>
                  )}

                  {/* POLICY_CHECK Payload */}
                  {envelope.type === 'POLICY_CHECK' && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.45rem' }}>
                        {envelope.payload.approved ? (
                          <ShieldCheck size={18} color="#10b981" />
                        ) : (
                          <ShieldAlert size={18} color="#ef4444" />
                        )}
                        <strong style={{ color: envelope.payload.approved ? '#34d399' : '#f87171' }}>
                          {envelope.payload.summary || (envelope.payload.approved ? 'Policy Checks PASSED' : 'Policy Checks FAILED')}
                        </strong>
                      </div>

                      {/* Rule Checks List */}
                      {Array.isArray(envelope.payload.checks) && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.4rem' }}>
                          {envelope.payload.checks.map((check: PolicyCheck, cIdx: number) => (
                            <div
                              key={cIdx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: '#09101c',
                                padding: '0.35rem 0.65rem',
                                borderRadius: 6,
                                border: `1px solid ${check.passed ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.3)'}`,
                                fontSize: '0.74rem'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                {check.passed ? (
                                  <CheckCircle2 size={13} color="#10b981" />
                                ) : (
                                  <XCircle size={13} color="#ef4444" />
                                )}
                                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#f1f5f9' }}>
                                  {check.rule}
                                </span>
                              </div>
                              <span style={{ color: check.passed ? '#34d399' : '#f87171', fontSize: '0.72rem' }}>
                                {check.detail || (check.passed ? 'PASS' : 'BREACH')}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* COUNTER_OFFER Payload */}
                  {envelope.type === 'COUNTER_OFFER' && (
                    <div>
                      <p style={{ color: '#fb923c', fontWeight: 600 }}>
                        {envelope.payload.reason}
                      </p>
                      <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: '#94a3b8' }}>
                        Proposed revised quantity: <strong style={{ color: '#fff' }}>{envelope.payload.quantity_kg} kg</strong>
                      </div>
                    </div>
                  )}

                  {/* ORDER_CREATE & ORDER_CONFIRM */}
                  {(envelope.type === 'ORDER_CREATE' || envelope.type === 'ORDER_CONFIRM') && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div>
                        <p style={{ color: '#34d399', fontWeight: 700 }}>
                          {envelope.payload.message || `Razorpay Order ${envelope.payload.orderId} executed successfully.`}
                        </p>
                        <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                          Receipt: {envelope.payload.receipt || envelope.payload.orderId}
                        </p>
                      </div>
                      <div style={{
                        padding: '0.25rem 0.65rem',
                        borderRadius: 6,
                        background: 'rgba(16, 185, 129, 0.15)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        color: '#34d399',
                        fontWeight: 700,
                        fontSize: '0.8rem'
                      }}>
                        ₹{envelope.payload.amount_inr || envelope.payload.total_price}
                      </div>
                    </div>
                  )}

                  {/* ORDER_FAIL & REJECT */}
                  {(envelope.type === 'ORDER_FAIL' || envelope.type === 'REJECT') && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#f87171' }}>
                        <AlertOctagon size={16} />
                        <strong style={{ fontSize: '0.85rem' }}>
                          {envelope.payload.reason === 'NO_SELLER_FOUND' ? 'No Seller Found / Out of Stock' : (envelope.payload.message || envelope.payload.reason || 'Transaction Blocked')}
                        </strong>
                      </div>
                      <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.35rem' }}>
                        {envelope.payload.message || envelope.payload.narrative || 'Audit record stored: Zero money transferred.'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Collapsible JSON Drawer */}
                {isJsonOpen && (
                  <div style={{
                    marginTop: '0.75rem',
                    background: '#070b14',
                    border: '1px solid #1e293b',
                    borderRadius: 8,
                    padding: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.72rem',
                    color: '#38bdf8',
                    overflowX: 'auto'
                  }}>
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
