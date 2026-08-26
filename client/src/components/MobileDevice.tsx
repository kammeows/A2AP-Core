import React from 'react';
import {
  Shield,
  Zap,
  CheckCircle,
  AlertCircle,
  Wifi,
  Battery,
  ShoppingBag,
  Store,
  CreditCard,
  XCircle,
  ArrowRight,
  TrendingUp,
  PackageX,
  Lock,
} from 'lucide-react';
import { NegotiationResult, OfferPayload } from '../types';

interface MobileDeviceProps {
  delegationMode: 'full' | 'partial';
  setDelegationMode: (mode: 'full' | 'partial') => void;
  pendingOffer: OfferPayload | null;
  onConfirmTransaction: (action: 'approve' | 'decline') => void;
  isConfirming: boolean;
  latestResult: NegotiationResult | null;
  weekSpentSoFar: number;
  weeklyBudgetCap: number;
  perTransactionCap: number;
  simulatePaymentFail: boolean;
  setSimulatePaymentFail: (val: boolean) => void;
}

export const MobileDevice: React.FC<MobileDeviceProps> = ({
  delegationMode,
  setDelegationMode,
  pendingOffer,
  onConfirmTransaction,
  isConfirming,
  latestResult,
  weekSpentSoFar,
  weeklyBudgetCap,
  perTransactionCap,
  simulatePaymentFail,
  setSimulatePaymentFail,
}) => {
  const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const remainingBudget = Math.max(0, weeklyBudgetCap - weekSpentSoFar);
  const budgetPct = Math.min(100, Math.round((weekSpentSoFar / weeklyBudgetCap) * 100));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Device Bezel */}
      <div className="mobile-device-frame">
        {/* Notch / Dynamic Island */}
        <div className="mobile-notch">
          <div className="mobile-notch-camera" />
          <div style={{ width: 40, height: 4, background: '#222', borderRadius: 2 }} />
        </div>

        {/* Mobile Screen */}
        <div className="mobile-screen">
          {/* Status Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.74rem',
            fontWeight: 600,
            color: '#cbd5e1',
            marginBottom: '1rem',
            padding: '0 0.25rem'
          }}>
            <span>{currentTime}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Wifi size={13} />
              <span style={{ fontSize: '0.7rem' }}>5G</span>
              <Battery size={15} />
            </div>
          </div>

          {/* App Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1.15rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(2, 132, 199, 0.4)'
              }}>
                <ShoppingBag size={16} color="#fff" />
              </div>
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#f8fafc', lineHeight: 1.2 }}>
                  A2A Procurement
                </h3>
                <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                  Restaurant #42 Manager
                </span>
              </div>
            </div>

            <span style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              padding: '0.2rem 0.5rem',
              borderRadius: 6,
              background: 'rgba(2, 132, 199, 0.15)',
              color: '#38bdf8',
              border: '1px solid rgba(2, 132, 199, 0.3)'
            }}>
              LIVE
            </span>
          </div>

          {/* Mode Switcher */}
          <div style={{ marginBottom: '1.15rem' }}>
            <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginBottom: '0.35rem', fontWeight: 600 }}>
              Delegation Authorization Mode
            </div>
            <div className="toggle-group">
              <button
                className={`toggle-option ${delegationMode === 'partial' ? 'active partial' : ''}`}
                onClick={() => setDelegationMode('partial')}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                  <Lock size={12} />
                  <span>Partial Mode</span>
                </div>
              </button>
              <button
                className={`toggle-option ${delegationMode === 'full' ? 'active' : ''}`}
                onClick={() => setDelegationMode('full')}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                  <Zap size={12} />
                  <span>Fully Autonomous</span>
                </div>
              </button>
            </div>

            {/* Mode Explainer Pill */}
            <div style={{
              marginTop: '0.5rem',
              padding: '0.45rem 0.65rem',
              borderRadius: 8,
              background: delegationMode === 'partial' ? 'rgba(217, 119, 6, 0.1)' : 'rgba(2, 132, 199, 0.1)',
              border: `1px solid ${delegationMode === 'partial' ? 'rgba(217, 119, 6, 0.3)' : 'rgba(2, 132, 199, 0.3)'}`,
              fontSize: '0.72rem',
              color: delegationMode === 'partial' ? '#fcd34d' : '#7dd3fc',
              lineHeight: 1.35
            }}>
              {delegationMode === 'partial' ? (
                <span>
                  🔒 <strong>Partial Mode:</strong> Asks human confirmation for each transaction before executing payment.
                </span>
              ) : (
                <span>
                  ⚡ <strong>Fully Autonomous:</strong> Policy engine auto-authorizes and executes payments instantly.
                </span>
              )}
            </div>
          </div>

          {/* Wallet / Spend Caps Card */}
          <div style={{
            background: 'linear-gradient(145deg, #131b2c 0%, #0d1424 100%)',
            border: '1px solid #233048',
            borderRadius: 14,
            padding: '0.9rem',
            marginBottom: '1rem',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
              <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600 }}>Weekly Spend Budget</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#38bdf8' }}>
                ₹{weekSpentSoFar} <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 400 }}>/ ₹{weeklyBudgetCap}</span>
              </span>
            </div>

            {/* Budget Progress Bar */}
            <div style={{ width: '100%', height: 6, background: '#1e293b', borderRadius: 4, overflow: 'hidden', marginBottom: '0.65rem' }}>
              <div style={{
                width: `${budgetPct}%`,
                height: '100%',
                background: budgetPct > 80 ? '#ef4444' : '#0284c7',
                borderRadius: 4,
                transition: 'width 0.3s ease'
              }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#94a3b8' }}>
              <span>Remaining: <strong style={{ color: '#34d399' }}>₹{remainingBudget}</strong></span>
              <span>Txn Cap: <strong style={{ color: '#f1f5f9' }}>₹{perTransactionCap}</strong></span>
            </div>
          </div>

          {/* INTERACTIVE ACTION: Pending Confirmation in Partial Mode */}
          {pendingOffer && delegationMode === 'partial' && (
            <div className="fade-in" style={{
              background: 'linear-gradient(145deg, #1c1505 0%, #291c06 100%)',
              border: '1.5px solid #d97706',
              borderRadius: 14,
              padding: '1rem',
              marginBottom: '1rem',
              boxShadow: '0 6px 20px rgba(217, 119, 6, 0.25)',
              position: 'relative'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.5rem' }}>
                <AlertCircle size={16} color="#fbbf24" />
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase' }}>
                  Confirmation Required
                </span>
              </div>

              <div style={{ fontSize: '0.82rem', color: '#fef3c7', marginBottom: '0.65rem', lineHeight: 1.4 }}>
                Buyer agent negotiated <strong>{pendingOffer.quantity_kg}kg {pendingOffer.item}</strong> for{' '}
                <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#34d399' }}>₹{pendingOffer.total_price}</span>.
              </div>

              <div style={{
                background: 'rgba(0, 0, 0, 0.4)',
                padding: '0.5rem 0.65rem',
                borderRadius: 8,
                fontSize: '0.72rem',
                color: '#d4d4d8',
                marginBottom: '0.75rem',
                display: 'flex',
                justifyContent: 'space-between'
              }}>
                <span>Rate: ₹{pendingOffer.final_price_per_kg}/kg</span>
                <span style={{ color: '#c084fc' }}>-{pendingOffer.discount_pct}% volume tier</span>
                <span style={{ color: '#34d399' }}>Policy: Passed ✓</span>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => onConfirmTransaction('approve')}
                  disabled={isConfirming}
                  style={{
                    flex: 1,
                    padding: '0.6rem 0.5rem',
                    borderRadius: 8,
                    background: '#10b981',
                    border: 'none',
                    color: '#fff',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: isConfirming ? 'not-allowed' : 'pointer',
                    boxShadow: '0 3px 10px rgba(16, 185, 129, 0.4)'
                  }}
                >
                  {isConfirming ? 'Authorizing...' : `Confirm & Pay ₹${pendingOffer.total_price}`}
                </button>
                <button
                  onClick={() => onConfirmTransaction('decline')}
                  disabled={isConfirming}
                  style={{
                    padding: '0.6rem 0.75rem',
                    borderRadius: 8,
                    background: '#27272a',
                    border: '1px solid #3f3f46',
                    color: '#f87171',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: isConfirming ? 'not-allowed' : 'pointer'
                  }}
                >
                  Decline
                </button>
              </div>
            </div>
          )}

          {/* STATUS NOTIFICATIONS FEED */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginBottom: '0.45rem', fontWeight: 600 }}>
              Recent Agent Activity
            </div>

            {/* Case 1: Out of Stock / No Seller Found */}
            {latestResult?.status === 'NO_SELLER_FOUND' && (
              <div className="fade-in" style={{
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                borderRadius: 12,
                padding: '0.85rem',
                marginBottom: '0.75rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#f87171', marginBottom: '0.25rem' }}>
                  <PackageX size={16} />
                  <strong style={{ fontSize: '0.82rem' }}>No seller found</strong>
                </div>
                <p style={{ fontSize: '0.74rem', color: '#cbd5e1' }}>
                  Vendor has 0kg available stock. AI procurement terminated safely with zero financial exposure.
                </p>
              </div>
            )}

            {/* Case 2: Payment Succeeded */}
            {(latestResult?.status === 'CONFIRMED' || latestResult?.status === 'RENEGOTIATED_AND_CONFIRMED') && (
              <div className="fade-in" style={{
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                borderRadius: 12,
                padding: '0.85rem',
                marginBottom: '0.75rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#34d399' }}>
                    <CheckCircle size={16} />
                    <strong style={{ fontSize: '0.82rem' }}>Payment Succeeded!</strong>
                  </div>
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#34d399' }}>
                    ₹{latestResult.total_amount}
                  </span>
                </div>
                <p style={{ fontSize: '0.72rem', color: '#cbd5e1', fontFamily: 'var(--font-mono)' }}>
                  Razorpay Order: {latestResult.order_id}
                </p>
                <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 3 }}>
                  {latestResult.status === 'RENEGOTIATED_AND_CONFIRMED'
                    ? '✓ Bounded renegotiation succeeded & confirmed'
                    : '✓ Policy approved & test-mode order created'}
                </div>
              </div>
            )}

            {/* Case 3: Payment Failed */}
            {latestResult?.status === 'PAYMENT_FAILED' && (
              <div className="fade-in" style={{
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                borderRadius: 12,
                padding: '0.85rem',
                marginBottom: '0.75rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#f87171', marginBottom: '0.25rem' }}>
                  <XCircle size={16} />
                  <strong style={{ fontSize: '0.82rem' }}>Payment Failed</strong>
                </div>
                <p style={{ fontSize: '0.74rem', color: '#cbd5e1' }}>
                  Razorpay gateway simulated payment authorization error.
                </p>
              </div>
            )}

            {/* Case 4: No Purchase Needed */}
            {latestResult?.status === 'NO_PURCHASE_NEEDED' && (
              <div className="fade-in" style={{
                background: 'rgba(2, 132, 199, 0.12)',
                border: '1px solid rgba(2, 132, 199, 0.35)',
                borderRadius: 12,
                padding: '0.85rem',
                marginBottom: '0.75rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#38bdf8', marginBottom: '0.25rem' }}>
                  <CheckCircle size={16} />
                  <strong style={{ fontSize: '0.82rem' }}>Inventory Healthy</strong>
                </div>
                <p style={{ fontSize: '0.74rem', color: '#cbd5e1' }}>
                  Current stock meets target threshold. Buyer agent skipped RFQ initiation.
                </p>
              </div>
            )}

            {/* Case 5: Policy Violation Escalated */}
            {latestResult?.status === 'ESCALATED_POLICY_VIOLATION' && (
              <div className="fade-in" style={{
                background: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                borderRadius: 12,
                padding: '0.85rem',
                marginBottom: '0.75rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#fbbf24', marginBottom: '0.25rem' }}>
                  <AlertCircle size={16} />
                  <strong style={{ fontSize: '0.82rem' }}>Blocked by Policy Cap</strong>
                </div>
                <p style={{ fontSize: '0.74rem', color: '#cbd5e1' }}>
                  Proposed deal breached spending limit. Order blocked & escalated without moving money.
                </p>
              </div>
            )}

            {/* Default Placeholder */}
            {!latestResult && (
              <div style={{
                padding: '1.5rem 1rem',
                textAlign: 'center',
                background: 'rgba(255, 255, 255, 0.02)',
                borderRadius: 12,
                border: '1px dashed #1e293b',
                color: '#64748b',
                fontSize: '0.78rem'
              }}>
                <Store size={24} style={{ margin: '0 auto 0.5rem', opacity: 0.4 }} />
                <span>Ready for agent procurement cycle</span>
              </div>
            )}
          </div>

          {/* Failure Simulation Switcher in Mobile Footer */}
          <div style={{
            marginTop: 'auto',
            paddingTop: '0.75rem',
            borderTop: '1px solid #1a2334',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.7rem',
            color: '#64748b'
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={simulatePaymentFail}
                onChange={(e) => setSimulatePaymentFail(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <span style={{ color: simulatePaymentFail ? '#f87171' : '#94a3b8' }}>
                Simulate Payment Failure
              </span>
            </label>
            <span style={{ color: '#475569' }}>v1.0 (Test Mode)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
