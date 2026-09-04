import React, { useState, useEffect } from 'react';
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
  Clock,
  History,
  Layers,
  ShieldCheck,
  Receipt,
} from 'lucide-react';
import { NegotiationResult, OfferPayload, Envelope } from '../types';

interface MobileDeviceProps {
  delegationMode: 'full' | 'partial';
  setDelegationMode: (mode: 'full' | 'partial') => void;
  pendingOffer: OfferPayload | null;
  onConfirmTransaction: (action: 'approve' | 'decline') => void;
  isConfirming: boolean;
  latestResult: NegotiationResult | null;
  messages?: Envelope[];
  weekSpentSoFar: number;
  weeklyBudgetCap: number;
  perTransactionCap: number;
  simulatePaymentFail: boolean;
  setSimulatePaymentFail: (val: boolean) => void;
}

interface PassbookEntry {
  id: string;
  orderId: string;
  paymentId: string;
  timestamp: string;
  totalAmount: number;
  items: Array<{
    sellerId: string;
    sellerName: string;
    vpa: string;
    item: string;
    quantity: number;
    price: number;
    subtotal: number;
  }>;
  method: string;
  status: 'PAID' | 'CAPTURED';
  verified: boolean;
}

const SELLER_DETAILS: Record<string, { name: string; vpa: string }> = {
  'agent:seller:razor_pies': {
    name: 'RazorPies Wholesale',
    vpa: 'razorpies.wholesale@razorpay',
  },
  'agent:seller:razorcery_1': {
    name: 'Razorcery Fresh #1',
    vpa: 'razorcery1@razorpay',
  },
  'agent:seller:razorcery_2': {
    name: 'Razorcery Fresh #2',
    vpa: 'razorcery2@razorpay',
  },
  'agent:seller:veggie_vendor_09': {
    name: 'Veggie Vendor 09',
    vpa: 'veggievendor09@razorpay',
  },
};

const getSellerDetails = (sellerId?: string) => {
  if (!sellerId) return { name: 'Razorcery Fresh #1', vpa: 'razorcery1@razorpay' };
  if (SELLER_DETAILS[sellerId]) return SELLER_DETAILS[sellerId];
  const cleaned = sellerId.replace('agent:seller:', '');
  const formatted = cleaned.replace(/_/g, ' ').toUpperCase();
  return {
    name: formatted,
    vpa: `${cleaned.replace(/_/g, '')}@razorpay`,
  };
};

export const MobileDevice: React.FC<MobileDeviceProps> = ({
  delegationMode,
  setDelegationMode,
  pendingOffer,
  onConfirmTransaction,
  isConfirming,
  latestResult,
  messages,
  weekSpentSoFar,
  weeklyBudgetCap,
  perTransactionCap,
  simulatePaymentFail,
  setSimulatePaymentFail,
}) => {
  const [activeTab, setActiveTab] = useState<'mandate' | 'history'>('mandate');
  const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const remainingBudget = Math.max(0, weeklyBudgetCap - weekSpentSoFar);
  const budgetPct = Math.min(100, Math.round((weekSpentSoFar / weeklyBudgetCap) * 100));

  // Initialize Passbook with seeded ledger entry for instant live audit demonstration
  const [passbook, setPassbook] = useState<PassbookEntry[]>([
    {
      id: 'pb_init_01',
      orderId: 'order_pre_setup_99',
      paymentId: 'pay_pre_setup_01',
      timestamp: '10:30 AM',
      totalAmount: 180,
      items: [
        {
          sellerId: 'agent:seller:razor_pies',
          sellerName: 'RazorPies Wholesale',
          vpa: 'razorpies.wholesale@razorpay',
          item: 'flour',
          quantity: 100,
          price: 1.8,
          subtotal: 180,
        },
      ],
      method: 'upi_circle',
      status: 'CAPTURED',
      verified: true,
    },
  ]);

  // Sync passbook when latestResult confirms a transaction
  useEffect(() => {
    if (
      latestResult &&
      (latestResult.status === 'CONFIRMED' || latestResult.status === 'RENEGOTIATED_AND_CONFIRMED') &&
      latestResult.order_id
    ) {
      setPassbook((prev) => {
        if (prev.some((entry) => entry.orderId === latestResult.order_id)) {
          return prev;
        }

        const items =
          latestResult.purchased_items && latestResult.purchased_items.length > 0
            ? latestResult.purchased_items.map((p) => {
                const details = getSellerDetails(p.seller_id);
                return {
                  sellerId: p.seller_id,
                  sellerName: details.name,
                  vpa: details.vpa,
                  item: p.item,
                  quantity: p.quantity,
                  price: p.price,
                  subtotal: Math.round(p.quantity * p.price * 100) / 100,
                };
              })
            : [
                {
                  sellerId: latestResult.pending_offer?.seller_id || 'agent:seller:razorcery_1',
                  sellerName: getSellerDetails(latestResult.pending_offer?.seller_id).name,
                  vpa: getSellerDetails(latestResult.pending_offer?.seller_id).vpa,
                  item: latestResult.pending_offer?.item || 'flour',
                  quantity: latestResult.pending_offer?.quantity_kg || 25,
                  price: latestResult.pending_offer?.final_price_per_kg || 1.9,
                  subtotal: latestResult.total_amount || 47.5,
                },
              ];

        const newEntry: PassbookEntry = {
          id: `pb_${Date.now()}`,
          orderId: latestResult.order_id || `order_${Date.now()}`,
          paymentId: latestResult.payment_id || `pay_${Date.now().toString(36)}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          totalAmount: latestResult.total_amount || items.reduce((acc, curr) => acc + curr.subtotal, 0),
          items,
          method: 'upi_circle',
          status: 'CAPTURED',
          verified: latestResult.signature_verified ?? true,
        };

        return [newEntry, ...prev];
      });
    }
  }, [latestResult]);

  // Sync passbook with any confirmed orders in messages
  useEffect(() => {
    if (!messages || messages.length === 0) return;
    const confirmMsgs = messages.filter((m) => m.type === 'ORDER_CONFIRM');
    if (confirmMsgs.length === 0) return;

    setPassbook((prev) => {
      let updated = [...prev];
      for (const msg of confirmMsgs) {
        const orderId = msg.payload.orderId;
        if (!orderId || updated.some((e) => e.orderId === orderId)) continue;

        const sellerId = msg.payload.seller_id || msg.payload.sellerId || 'agent:seller:razor_pies';
        const details = getSellerDetails(sellerId);
        const amount = msg.payload.amount_inr || (msg.payload.amount_paise ? msg.payload.amount_paise / 100 : 0);

        const newEntry: PassbookEntry = {
          id: `pb_${msg.message_id || Date.now()}`,
          orderId,
          paymentId: msg.payload.paymentId || `pay_${Math.random().toString(36).slice(2, 8)}`,
          timestamp: msg.timestamp
            ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          totalAmount: amount,
          items: [
            {
              sellerId,
              sellerName: details.name,
              vpa: details.vpa,
              item: msg.payload.item || 'flour',
              quantity: msg.payload.quantity_kg || 25,
              price: msg.payload.price_per_kg || (msg.payload.quantity_kg ? amount / msg.payload.quantity_kg : amount),
              subtotal: amount,
            },
          ],
          method: msg.payload.payment_method || 'upi_circle',
          status: 'CAPTURED',
          verified: msg.payload.signature_verified ?? true,
        };
        updated = [newEntry, ...updated];
      }
      return updated;
    });
  }, [messages]);

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
            marginBottom: '0.75rem',
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
                  UPI Circle
                </h3>
                <span style={{ fontSize: '0.66rem', color: '#bae6fd' }}>
                  Primary User • Pizza #42
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

          {/* Top Navigation Toggle: UPI Mandate vs Passbook */}
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.85rem' }}>
            <button
              onClick={() => setActiveTab('mandate')}
              style={{
                flex: 1,
                padding: '0.45rem 0.4rem',
                borderRadius: 6,
                border: activeTab === 'mandate' ? '1.5px solid #012652' : '1px solid #cbd5e1',
                background: activeTab === 'mandate' ? '#012652' : '#ffffff',
                color: activeTab === 'mandate' ? '#ffffff' : '#475569',
                fontSize: '0.73rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.3rem',
                transition: 'all 0.2s ease',
              }}
            >
              <Zap size={13} />
              <span>Mandates</span>
              {pendingOffer && delegationMode === 'partial' && (
                <span style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: '#f59e0b',
                  display: 'inline-block'
                }} />
              )}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              style={{
                flex: 1,
                padding: '0.45rem 0.4rem',
                borderRadius: 6,
                border: activeTab === 'history' ? '1.5px solid #012652' : '1px solid #cbd5e1',
                background: activeTab === 'history' ? '#012652' : '#ffffff',
                color: activeTab === 'history' ? '#ffffff' : '#475569',
                fontSize: '0.73rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.3rem',
                transition: 'all 0.2s ease',
              }}
            >
              <History size={13} />
              <span>Passbook ({passbook.length})</span>
            </button>
          </div>

          {/* TAB 1: MANDATE VIEW */}
          {activeTab === 'mandate' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
              {/* Mode Switcher */}
              <div style={{ marginBottom: '0.85rem' }}>
                <h4 style={{ fontSize: '0.78rem', color: '#0D94FB', marginBottom: '0.3rem', fontWeight: 700 }}>
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
                  fontSize: '0.71rem',
                  color: delegationMode === 'partial' ? '#92400e' : '#1e40af',
                  lineHeight: 1.35
                }}>
                  {delegationMode === 'partial' ? (
                    <span>
                      <strong>Partial Delegation:</strong> Secondary AI agent negotiates prices; Primary user authorizes the consolidated basket via MPIN before capture.
                    </span>
                  ) : (
                    <span>
                      <strong>Full Delegation:</strong> AI agent executes payment automatically within pre-authorized budget caps via UPI Circle mandate.
                    </span>
                  )}
                </div>
              </div>

              {/* Wallet / Spend Caps Card */}
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '0.75rem',
                marginBottom: '0.85rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '0.72rem', color: '#475569', fontWeight: 600 }}>Weekly Circle Cap</span>
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
                  <span>Per Txn Limit: <strong style={{ color: '#012652' }}>₹{perTransactionCap}</strong></span>
                </div>
              </div>

              {/* INTERACTIVE ACTION: Pending Confirmation in Partial Mode */}
              {pendingOffer && delegationMode === 'partial' && (
                <div className="fade-in" style={{
                  background: '#fffbeb',
                  border: '1.5px solid #d97706',
                  borderRadius: 8,
                  padding: '0.8rem',
                  marginBottom: '0.85rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <AlertCircle size={15} color="#b45309" />
                      <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#92400e', textTransform: 'uppercase' }}>
                        UPI Circle Mandate Request
                      </span>
                    </div>
                    <span style={{
                      fontSize: '0.64rem',
                      fontWeight: 700,
                      padding: '0.15rem 0.4rem',
                      borderRadius: 4,
                      background: '#fef3c7',
                      color: '#b45309',
                      border: '1px solid #fde68a'
                    }}>
                      {pendingOffer.items && pendingOffer.items.length > 1
                        ? `Basket: ${pendingOffer.items.length} Vendors`
                        : 'Single Payee'}
                    </span>
                  </div>

                  {/* Multi-Vendor Basket Breakdown */}
                  {pendingOffer.items && pendingOffer.items.length > 1 ? (
                    <div>
                      <div style={{ fontSize: '0.72rem', color: '#78350f', marginBottom: '0.45rem' }}>
                        AI agent negotiated a <strong>multi-vendor batch</strong>. Authorize once for atomic settlement:
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.6rem' }}>
                        {pendingOffer.items.map((it, idx) => {
                          const seller = getSellerDetails(it.seller_id);
                          const subtotal = Math.round(it.quantity * it.price * 100) / 100;
                          return (
                            <div key={idx} style={{
                              background: '#ffffff',
                              border: '1px solid #fde68a',
                              borderRadius: 6,
                              padding: '0.4rem 0.5rem'
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#012652' }}>
                                  {seller.name}
                                </span>
                                <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#059669' }}>
                                  ₹{subtotal}
                                </span>
                              </div>
                              <div style={{ fontSize: '0.65rem', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                                {seller.vpa}
                              </div>
                              <div style={{ fontSize: '0.7rem', color: '#334155', marginTop: '0.1rem' }}>
                                {it.quantity}kg {it.item} @ ₹{it.price}/kg
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    /* Single Vendor Offer */
                    <div>
                      {(() => {
                        const seller = getSellerDetails(pendingOffer.seller_id);
                        return (
                          <div style={{ marginBottom: '0.5rem' }}>
                            <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '0.2rem' }}>
                              Payee: <strong style={{ color: '#012652' }}>{seller.name}</strong>
                              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem' }}>{seller.vpa}</div>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#0f172a', marginBottom: '0.4rem', lineHeight: 1.35 }}>
                              Negotiated <strong>{pendingOffer.quantity_kg}kg {pendingOffer.item}</strong> for{' '}
                              <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#059669' }}>₹{pendingOffer.total_price}</span>
                            </div>
                            <div style={{
                              background: '#ffffff',
                              padding: '0.35rem 0.5rem',
                              borderRadius: 6,
                              border: '1px solid #fde68a',
                              fontSize: '0.7rem',
                              color: '#334155',
                              marginBottom: '0.5rem',
                              display: 'flex',
                              justifyContent: 'space-between'
                            }}>
                              <span>Rate: ₹{pendingOffer.final_price_per_kg}/kg</span>
                              <span style={{ color: '#7c3aed', fontWeight: 600 }}>-{pendingOffer.discount_pct}%</span>
                              <span style={{ color: '#15803d', fontWeight: 700 }}>Policy Pass ✓</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Architectural Highlight */}
                  <div style={{
                    fontSize: '0.65rem',
                    color: '#92400e',
                    background: 'rgba(254, 243, 199, 0.7)',
                    padding: '0.35rem 0.45rem',
                    borderRadius: 4,
                    marginBottom: '0.65rem',
                    lineHeight: 1.3
                  }}>
                    <strong>Single Atomic Approval:</strong> Fulfills entire recipe in 1 mandate. Prevents partial stock lock-in and MPIN fatigue.
                  </div>

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
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: isConfirming ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {isConfirming
                        ? 'Authorizing...'
                        : pendingOffer.items && pendingOffer.items.length > 1
                        ? `Authorize Basket ₹${pendingOffer.total_price}`
                        : `Confirm & Pay ₹${pendingOffer.total_price}`}
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
                        fontSize: '0.78rem',
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

                {/* Case: Awaiting Confirmation */}
                {latestResult?.status === 'AWAITING_CONFIRMATION' && (
                  <div className="fade-in" style={{
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: 8,
                    padding: '0.75rem',
                    marginBottom: '0.65rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#b45309', marginBottom: '0.2rem' }}>
                      <Clock size={15} />
                      <strong style={{ fontSize: '0.82rem' }}>Awaiting Approval</strong>
                    </div>
                    <p style={{ fontSize: '0.74rem', color: '#475569' }}>
                      A2A negotiation concluded. Review the proposed purchase above and authorize payment.
                    </p>
                  </div>
                )}

                {/* Case: Declined by Manager */}
                {latestResult?.status === 'REJECTED' && (
                  <div className="fade-in" style={{
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: 8,
                    padding: '0.75rem',
                    marginBottom: '0.65rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#b91c1c', marginBottom: '0.2rem' }}>
                      <XCircle size={15} />
                      <strong style={{ fontSize: '0.82rem' }}>Transaction Declined</strong>
                    </div>
                    <p style={{ fontSize: '0.74rem', color: '#475569' }}>
                      Declined by restaurant manager. Zero funds transferred, inventory unchanged.
                    </p>
                  </div>
                )}

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
                      <ShieldCheck size={12} />
                      <span>HMAC-SHA256 Verified • UPI Circle</span>
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
            </div>
          )}

          {/* TAB 2: PASSBOOK / AUDIT HISTORY VIEW */}
          {activeTab === 'history' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '0.6rem'
              }}>
                <div>
                  <h4 style={{ fontSize: '0.8rem', color: '#012652', margin: 0, fontWeight: 800 }}>
                    UPI Circle Passbook
                  </h4>
                  <span style={{ fontSize: '0.65rem', color: '#64748b' }}>
                    Primary User Audit Trail & Settlements
                  </span>
                </div>
                <div style={{
                  fontSize: '0.66rem',
                  fontWeight: 700,
                  color: '#059669',
                  background: '#ecfdf5',
                  padding: '0.15rem 0.45rem',
                  borderRadius: 4,
                  border: '1px solid #a7f3d0'
                }}>
                  {passbook.length} Settled
                </div>
              </div>

              {passbook.length === 0 ? (
                <div style={{
                  padding: '1.5rem 0.75rem',
                  textAlign: 'center',
                  background: '#f8fafc',
                  borderRadius: 8,
                  border: '1px dashed #cbd5e1',
                  color: '#64748b',
                  fontSize: '0.74rem'
                }}>
                  <Receipt size={22} style={{ margin: '0 auto 0.35rem', opacity: 0.4, color: '#012652' }} />
                  <span>No transactions settled yet</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', paddingBottom: '0.5rem' }}>
                  {passbook.map((entry) => (
                    <div
                      key={entry.id}
                      className="fade-in"
                      style={{
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: 8,
                        padding: '0.65rem 0.7rem',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                      }}
                    >
                      {/* Payee Info & Amount */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.3rem' }}>
                        <div>
                          <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#012652' }}>
                            {entry.items.length > 1
                              ? `Split Basket (${entry.items.length} Vendors)`
                              : entry.items[0]?.sellerName || 'Verified Merchant'}
                          </div>
                          <div style={{ fontSize: '0.65rem', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                            {entry.items.length > 1
                              ? 'Atomic Razorpay Route Settlement'
                              : `VPA: ${entry.items[0]?.vpa}`}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#15803d' }}>
                            ₹{entry.totalAmount}
                          </div>
                          <span style={{ fontSize: '0.62rem', color: '#94a3b8' }}>
                            {entry.timestamp}
                          </span>
                        </div>
                      </div>

                      {/* Items Purchased Breakdown */}
                      <div style={{
                        background: '#f8fafc',
                        borderRadius: 6,
                        padding: '0.4rem 0.5rem',
                        margin: '0.35rem 0',
                        border: '1px solid #f1f5f9',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.2rem'
                      }}>
                        {entry.items.map((item, idx) => (
                          <div key={idx} style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '0.67rem',
                            color: '#334155'
                          }}>
                            <span>
                              <strong>{item.quantity}kg {item.item}</strong>
                              {entry.items.length > 1 && (
                                <span style={{ color: '#0284c7', marginLeft: 4 }}>• {item.sellerName}</span>
                              )}
                            </span>
                            <span style={{ fontWeight: 600, color: '#0f172a' }}>
                              ₹{item.subtotal} (@ ₹{item.price}/kg)
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Cryptographic Proof Footer */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.63rem',
                        color: '#64748b',
                        paddingTop: '0.15rem'
                      }}>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>
                          {entry.orderId.substring(0, 15)}...
                        </span>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.2rem',
                          color: '#15803d',
                          fontWeight: 700
                        }}>
                          <ShieldCheck size={11} />
                          <span>HMAC-SHA256 Verified</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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
