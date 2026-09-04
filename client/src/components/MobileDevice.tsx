import React from 'react';
import {
  Zap,
  CheckCircle,
  AlertCircle,
  Wifi,
  Battery,
  ShoppingBag,
  Store,
  XCircle,
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
      {/* Device Frame */}
      <div className="mobile-device-frame">
        {/* Notch / Dynamic Island */}
        <div className="mobile-notch">
          <div className="mobile-notch-camera" />
        </div>

        {/* Mobile Screen */}
        <div className="mobile-screen">
          {/* Status Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.74rem',
            fontWeight: 700,
            color: '#012652',
            marginBottom: '0.85rem',
            padding: '0 0.25rem'
          }}>
            <span>{currentTime}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Wifi size={13} color="#012652" />
              <span style={{ fontSize: '0.7rem' }}>5G</span>
              <Battery size={15} color="#012652" />
            </div>
          </div>

          {/* App Header Banner in 012652 */}
          <div style={{
            background: '#012652',
            borderRadius: 10,
            padding: '0.75rem 0.85rem',
            marginBottom: '1rem',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 2px 8px rgba(1, 38, 82, 0.15)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <div style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: '#0D94FB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff'
              }}>
                <ShoppingBag size={15} />
              </div>
              <div>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#ffffff', margin: 0, lineHeight: 1.2 }}>
                  A2A Procurement
                </h3>
                <span style={{ fontSize: '0.66rem', color: '#bae6fd' }}>
                  Restaurant #42
                </span>
              </div>
            </div>

            <span style={{
              fontSize: '0.66rem',
              fontWeight: 800,
              padding: '0.15rem 0.45rem',
              borderRadius: 4,
              background: '#0D94FB',
              color: '#ffffff'
            }}>
              LIVE
            </span>
          </div>

          {/* Mode Switcher */}
          <div style={{ marginBottom: '1rem' }}>
            <h4 style={{ fontSize: '0.8rem', color: '#0D94FB', marginBottom: '0.3rem', fontWeight: 700 }}>
              Delegation Mode
            </h4>
            <div className="toggle-group">
              <button
                className={`toggle-option ${delegationMode === 'partial' ? 'active partial' : ''}`}
                onClick={() => setDelegationMode('partial')}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                  <Lock size={12} />
                  <span>Partial Mode</span>
                </div>
              </button>
              <button
                className={`toggle-option ${delegationMode === 'full' ? 'active' : ''}`}
                onClick={() => setDelegationMode('full')}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                  <Zap size={12} />
                  <span>Autonomous</span>
                </div>
              </button>
            </div>

            {/* Mode Explainer Box */}
            <div style={{
              marginTop: '0.45rem',
              padding: '0.4rem 0.6rem',
              borderRadius: 6,
              background: delegationMode === 'partial' ? '#fffbeb' : '#eff6ff',
              border: `1px solid ${delegationMode === 'partial' ? '#fde68a' : '#bfdbfe'}`,
              fontSize: '0.72rem',
              color: delegationMode === 'partial' ? '#92400e' : '#1e40af',
              lineHeight: 1.35
            }}>
              {delegationMode === 'partial' ? (
                <span>
                  <strong>Partial Mode:</strong> Asks your confirmation for each single transaction before executing payment.
                </span>
              ) : (
                <span>
                  <strong>Fully Autonomous:</strong> Authorizes and executes payment automatically upon policy approval.
                </span>
              )}
            </div>
          </div>

          {/* Wallet / Spend Caps Card */}
          <div style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: '0.8rem',
            marginBottom: '0.85rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '0.72rem', color: '#475569', fontWeight: 600 }}>Weekly Budget</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#012652' }}>
                ₹{weekSpentSoFar} <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 400 }}>/ ₹{weeklyBudgetCap}</span>
              </span>
            </div>

            {/* Progress Bar */}
            <div style={{ width: '100%', height: 5, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden', marginBottom: '0.5rem' }}>
              <div style={{
                width: `${budgetPct}%`,
                height: '100%',
                background: budgetPct > 80 ? '#dc2626' : '#0D94FB',
                borderRadius: 4,
                transition: 'width 0.3s ease'
              }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#475569' }}>
              <span>Remaining: <strong style={{ color: '#059669' }}>₹{remainingBudget}</strong></span>
              <span>Txn Cap: <strong style={{ color: '#012652' }}>₹{perTransactionCap}</strong></span>
            </div>
          </div>

          {/* INTERACTIVE ACTION: Pending Confirmation in Partial Mode */}
          {pendingOffer && delegationMode === 'partial' && (
            <div className="fade-in" style={{
              background: '#fffbeb',
              border: '1.5px solid #d97706',
              borderRadius: 8,
              padding: '0.85rem',
              marginBottom: '0.85rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
                <AlertCircle size={15} color="#b45309" />
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#92400e', textTransform: 'uppercase' }}>
                  Confirmation Required
                </span>
              </div>

              <div style={{ fontSize: '0.82rem', color: '#0f172a', marginBottom: '0.5rem', lineHeight: 1.35 }}>
                Buyer negotiated <strong>{pendingOffer.quantity_kg}kg {pendingOffer.item}</strong> for{' '}
                <span style={{ fontSize: '1rem', fontWeight: 800, color: '#059669' }}>₹{pendingOffer.total_price}</span>.
              </div>

              <div style={{
                background: '#ffffff',
                padding: '0.4rem 0.55rem',
                borderRadius: 6,
                border: '1px solid #fde68a',
                fontSize: '0.72rem',
                color: '#334155',
                marginBottom: '0.65rem',
                display: 'flex',
                justifyContent: 'space-between'
              }}>
                <span>Rate: ₹{pendingOffer.final_price_per_kg}/kg</span>
                <span style={{ color: '#7c3aed', fontWeight: 600 }}>-{pendingOffer.discount_pct}%</span>
                <span style={{ color: '#15803d', fontWeight: 700 }}>Policy Passed ✓</span>
              </div>

              {pendingOffer.rationale && (
                <div style={{
                  fontSize: '0.7rem',
                  color: '#92400e',
                  marginBottom: '0.65rem',
                  padding: '0.35rem 0.5rem',
                  background: 'rgba(254, 243, 199, 0.7)',
                  borderRadius: 4,
                  lineHeight: 1.3
                }}>
                  <strong>Seller:</strong> {pendingOffer.rationale}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.45rem' }}>
                <button
                  onClick={() => onConfirmTransaction('approve')}
                  disabled={isConfirming}
                  style={{
                    flex: 1,
                    padding: '0.55rem 0.5rem',
                    borderRadius: 6,
                    background: '#012652',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: isConfirming ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isConfirming ? 'Authorizing...' : `Confirm & Pay ₹${pendingOffer.total_price}`}
                </button>
                <button
                  onClick={() => onConfirmTransaction('decline')}
                  disabled={isConfirming}
                  style={{
                    padding: '0.55rem 0.65rem',
                    borderRadius: 6,
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    color: '#dc2626',
                    fontSize: '0.8rem',
                    fontWeight: 700,
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
            <h4 style={{ fontSize: '0.78rem', color: '#0D94FB', marginBottom: '0.4rem', fontWeight: 700 }}>
              Transaction Status
            </h4>

            {/* Case 1: Out of Stock / No Seller Found */}
            {latestResult?.status === 'NO_SELLER_FOUND' && (
              <div className="fade-in" style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 8,
                padding: '0.75rem',
                marginBottom: '0.65rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#b91c1c', marginBottom: '0.2rem' }}>
                  <PackageX size={15} />
                  <strong style={{ fontSize: '0.82rem' }}>No seller found</strong>
                </div>
                <p style={{ fontSize: '0.74rem', color: '#475569' }}>
                  Seller has 0kg stock. AI procurement stopped with zero money spent.
                </p>
              </div>
            )}

            {/* Case 2: Payment Succeeded */}
            {(latestResult?.status === 'CONFIRMED' || latestResult?.status === 'RENEGOTIATED_AND_CONFIRMED') && (
              <div className="fade-in" style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: 8,
                padding: '0.75rem',
                marginBottom: '0.65rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#15803d' }}>
                    <CheckCircle size={15} />
                    <strong style={{ fontSize: '0.82rem' }}>Payment Successful</strong>
                  </div>
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#15803d' }}>
                    ₹{latestResult.total_amount}
                  </span>
                </div>
                <p style={{ fontSize: '0.72rem', color: '#334155', fontFamily: 'var(--font-mono)' }}>
                  Order: {latestResult.order_id}
                </p>
                {latestResult.payment_id && (
                  <p style={{ fontSize: '0.72rem', color: '#0369a1', fontFamily: 'var(--font-mono)', marginTop: 1 }}>
                    Payment: {latestResult.payment_id}
                  </p>
                )}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.66rem',
                  color: '#15803d',
                  marginTop: 4,
                  fontWeight: 700,
                  background: 'rgba(34, 197, 94, 0.1)',
                  padding: '0.2rem 0.4rem',
                  borderRadius: 4,
                  width: 'fit-content',
                }}>
                  <span>✓ HMAC-SHA256 Verified • UPI Circle</span>
                </div>
                <div style={{ fontSize: '0.68rem', color: '#059669', marginTop: 4, fontWeight: 600 }}>
                  {latestResult.status === 'RENEGOTIATED_AND_CONFIRMED'
                    ? '✓ Renegotiated to fit cap & settlement captured'
                    : '✓ Policy approved & payment captured'}
                </div>
              </div>
            )}

            {/* Case 3: Payment Failed */}
            {latestResult?.status === 'PAYMENT_FAILED' && (
              <div className="fade-in" style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 8,
                padding: '0.75rem',
                marginBottom: '0.65rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#b91c1c', marginBottom: '0.2rem' }}>
                  <XCircle size={15} />
                  <strong style={{ fontSize: '0.82rem' }}>Payment Failed</strong>
                </div>
                <p style={{ fontSize: '0.74rem', color: '#475569' }}>
                  Razorpay payment processing error.
                </p>
              </div>
            )}

            {/* Case 4: No Purchase Needed */}
            {latestResult?.status === 'NO_PURCHASE_NEEDED' && (
              <div className="fade-in" style={{
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: 8,
                padding: '0.75rem',
                marginBottom: '0.65rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#0369a1', marginBottom: '0.2rem' }}>
                  <CheckCircle size={15} />
                  <strong style={{ fontSize: '0.82rem' }}>Inventory Healthy</strong>
                </div>
                <p style={{ fontSize: '0.74rem', color: '#475569' }}>
                  Current stock meets target threshold. No purchase required.
                </p>
              </div>
            )}

            {/* Case 5: Policy Violation */}
            {latestResult?.status === 'ESCALATED_POLICY_VIOLATION' && (
              <div className="fade-in" style={{
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: 8,
                padding: '0.75rem',
                marginBottom: '0.65rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#b45309', marginBottom: '0.2rem' }}>
                  <AlertCircle size={15} />
                  <strong style={{ fontSize: '0.82rem' }}>Blocked by Policy Cap</strong>
                </div>
                <p style={{ fontSize: '0.74rem', color: '#475569' }}>
                  Deal exceeded transaction cap. Escalated without financial exposure.
                </p>
              </div>
            )}

            {/* Default Placeholder */}
            {!latestResult && (
              <div style={{
                padding: '1.25rem 0.75rem',
                textAlign: 'center',
                background: '#f8fafc',
                borderRadius: 8,
                border: '1px dashed #cbd5e1',
                color: '#64748b',
                fontSize: '0.76rem'
              }}>
                <Store size={22} style={{ margin: '0 auto 0.35rem', opacity: 0.4, color: '#012652' }} />
                <span>Ready for agent procurement cycle</span>
              </div>
            )}
          </div>

          {/* Footer toggle for simulated error */}
          <div style={{
            marginTop: 'auto',
            paddingTop: '0.65rem',
            borderTop: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.7rem',
            color: '#64748b'
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={simulatePaymentFail}
                onChange={(e) => setSimulatePaymentFail(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <span style={{ color: simulatePaymentFail ? '#dc2626' : '#64748b', fontWeight: 600 }}>
                Simulate Payment Error
              </span>
            </label>
            <span style={{ color: '#012652', fontWeight: 700 }}>Razorpay Test</span>
          </div>
        </div>
      </div>
    </div>
  );
};
