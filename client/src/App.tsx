import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { RazorSliceArchitecture } from './components/RazorSliceArchitecture';
import { EnvelopeTrace } from './components/EnvelopeTrace';
import { MobileDevice } from './components/MobileDevice';
import { ApiKeyModal } from './components/ApiKeyModal';
import { hasCustomRazorpayKeys } from './utils/keyStore';
import {
  fetchInventory,
  fetchPolicy,
  triggerNegotiation,
  confirmTransaction,
  fetchThread,
  resetSystemState,
  updatePolicy,
  retryPayment,
  cancelOrder,
} from './api/client';
import { Envelope, NegotiationResult, OfferPayload, SimulationMode } from './types';

export const App: React.FC = () => {
  // BYOK Key Modal State
  const [isKeyModalOpen, setIsKeyModalOpen] = useState<boolean>(false);
  const [hasCustomKeys, setHasCustomKeys] = useState<boolean>(hasCustomRazorpayKeys());

  // Stock States
  const [buyerStockKg, setBuyerStockKg] = useState<number>(15);
  const [buyerTargetStockKg, setBuyerTargetStockKg] = useState<number>(65);
  const [sellerStockKg, setSellerStockKg] = useState<number>(500);

  // Policy & Mode States
  const [delegationMode, setDelegationMode] = useState<'full' | 'partial'>('partial');
  const [weeklyBudgetCap, setWeeklyBudgetCap] = useState<number>(2000);
  const [perTransactionCap, setPerTransactionCap] = useState<number>(1600);
  const [weekSpentSoFar, setWeekSpentSoFar] = useState<number>(0);

  // Negotiation & Trace States
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Envelope[]>([]);
  const [pendingOffer, setPendingOffer] = useState<OfferPayload | null>(null);
  const [latestResult, setLatestResult] = useState<NegotiationResult | null>(null);

  // UI Status & Resilience States
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [simulatePaymentFail, setSimulatePaymentFail] = useState<boolean>(false);
  const [simulationMode, setSimulationMode] = useState<SimulationMode>('happy');

  // Initial State Load
  const loadInitialData = useCallback(async () => {
    try {
      const [invData, polData] = await Promise.all([
        fetchInventory(),
        fetchPolicy(),
      ]);

      if (invData?.item) {
        setSellerStockKg(invData.item.stock_kg);
      }
      if (invData?.buyer_inventory) {
        setBuyerStockKg(invData.buyer_inventory.current_stock_kg);
        setBuyerTargetStockKg(invData.buyer_inventory.target_stock_kg || 65);
      }

      if (polData?.config) {
        setDelegationMode(polData.config.delegation_mode || 'partial');
        setWeeklyBudgetCap(polData.config.weekly_budget_cap || 2000);
        setPerTransactionCap(polData.config.per_transaction_cap || 1600);
      }
      if (typeof polData?.week_spent_so_far === 'number') {
        setWeekSpentSoFar(polData.week_spent_so_far);
      }
    } catch (err) {
      console.error('Error loading initial data:', err);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Reactive listener for local BYOK changes
  useEffect(() => {
    const handleKeysUpdated = () => {
      setHasCustomKeys(hasCustomRazorpayKeys());
    };
    window.addEventListener('a2a_keys_updated', handleKeysUpdated);
    return () => window.removeEventListener('a2a_keys_updated', handleKeysUpdated);
  }, []);

  // Mode Change Handler
  const handleModeChange = async (newMode: 'full' | 'partial') => {
    setDelegationMode(newMode);
    try {
      await updatePolicy({ delegation_mode: newMode });
    } catch (err) {
      console.warn('Failed to persist policy mode:', err);
    }
  };

  // Run AI Procurement Run
  const handleRunAi = async (
    scenario: 'happy' | 'failure' | 'custom' = 'custom',
    customOptions?: any
  ): Promise<NegotiationResult | null> => {
    setIsRunning(true);
    setPendingOffer(null);
    setLatestResult(null);

    const effSimMode = customOptions?.simulationMode ?? simulationMode;
    const isFail = effSimMode === 'bank_decline' || (customOptions?.simulatePaymentFail ?? simulatePaymentFail);

    try {
      const result = await triggerNegotiation({
        scenario,
        simulationMode: effSimMode,
        buyerStockKg: customOptions?.buyerStockKg ?? buyerStockKg,
        sellerStockKg: customOptions?.sellerStockKg ?? sellerStockKg,
        buyerTargetStockKg: customOptions?.buyerTargetStockKg ?? buyerTargetStockKg,
        delegationMode,
        simulatePaymentFail: isFail,
        itemToProcure: customOptions?.itemToProcure,
        quantityNeeded: customOptions?.quantityNeeded,
        itemsToProcure: customOptions?.itemsToProcure,
        customRfq: customOptions?.customRfq,
        sellerInventories: customOptions?.sellerInventories,
      });

      setLatestResult(result);
      setActiveThreadId(result.thread_id);

      if (result.pending_offer && result.status === 'AWAITING_CONFIRMATION') {
        setPendingOffer(result.pending_offer);
      }

      if (result.buyer_stock !== undefined) {
        setBuyerStockKg(result.buyer_stock);
      }
      if (result.seller_stock !== undefined) {
        setSellerStockKg(result.seller_stock);
      }

      // Fetch complete envelopes for the thread
      if (result.thread_id) {
        const threadData = await fetchThread(result.thread_id);
        if (threadData?.messages) {
          setMessages(threadData.messages);
        }
      }

      // Refresh policy budget spent
      const polData = await fetchPolicy();
      if (typeof polData?.week_spent_so_far === 'number') {
        setWeekSpentSoFar(polData.week_spent_so_far);
      }

      return result;
    } catch (err: any) {
      console.error('Error executing AI procurement:', err);
      const failRes: NegotiationResult = {
        success: false,
        thread_id: '',
        scenario,
        status: 'PAYMENT_FAILED',
        final_message_type: 'ORDER_FAIL',
        message: err.message || 'Execution failed',
      };
      setLatestResult(failRes);
      return failRes;
    } finally {
      setIsRunning(false);
    }
  };

  // Handle Human Confirmation in Partial Mode
  const handleConfirmTransaction = async (action: 'approve' | 'decline') => {
    if (!activeThreadId || !pendingOffer) return;
    setIsConfirming(true);
    const offerBeingConfirmed = pendingOffer;

    try {
      const res = await confirmTransaction({
        threadId: activeThreadId,
        offer: offerBeingConfirmed,
        action,
        simulatePaymentFail: simulationMode === 'bank_decline' || simulatePaymentFail,
      });

      // Update state
      setPendingOffer(null);

      if (res.status === 'CONFIRMED') {
        const confirmedPurchased = res.purchased_items && res.purchased_items.length > 0
          ? res.purchased_items
          : [
              {
                seller_id: offerBeingConfirmed.seller_id || "agent:seller:razor_pies",
                item: offerBeingConfirmed.item,
                quantity: offerBeingConfirmed.quantity_kg,
                price: offerBeingConfirmed.final_price_per_kg,
              },
            ];

        setLatestResult({
          success: true,
          thread_id: activeThreadId,
          scenario: 'custom',
          status: 'CONFIRMED',
          final_message_type: 'ORDER_CONFIRM',
          order_id: res.order_id,
          total_amount: res.total_amount || offerBeingConfirmed.total_price,
          purchased_items: confirmedPurchased,
          pending_offer: offerBeingConfirmed,
        });

        if (res.buyer_stock !== undefined) setBuyerStockKg(res.buyer_stock);
        if (res.seller_stock !== undefined) setSellerStockKg(res.seller_stock);
      } else if (res.status === 'DECLINED') {
        setLatestResult({
          success: true,
          thread_id: activeThreadId,
          scenario: 'custom',
          status: 'REJECTED',
          final_message_type: 'ORDER_FAIL',
          message: 'Transaction declined by user',
        });
      } else if (res.status === 'PAYMENT_FAILED' || !res.success) {
        setLatestResult({
          success: false,
          thread_id: activeThreadId,
          scenario: 'custom',
          status: 'PAYMENT_FAILED',
          final_message_type: 'ORDER_FAIL',
          order_id: res.order_id,
          payment_id: (res as any).payment_id,
          message: res.message || 'Payment gateway error: Transaction declined',
        });
      }

      // Re-fetch thread messages to show confirmed envelopes
      const threadData = await fetchThread(activeThreadId);
      if (threadData?.messages) {
        setMessages(threadData.messages);
      }

      // Refresh spending numbers
      const polData = await fetchPolicy();
      if (typeof polData?.week_spent_so_far === 'number') {
        setWeekSpentSoFar(polData.week_spent_so_far);
      }
    } catch (err: any) {
      console.error('Error confirming transaction:', err);
      setLatestResult({
        success: false,
        thread_id: activeThreadId,
        scenario: 'custom',
        status: 'PAYMENT_FAILED',
        final_message_type: 'ORDER_FAIL',
        message: err.message || 'Payment processing error at gateway',
      });
    } finally {
      setIsConfirming(false);
    }
  };

  // Handle Retry Payment from Mobile Phone Recovery Card
  const handleRetryPayment = async (orderId: string) => {
    if (!activeThreadId) return;
    setIsRetrying(true);
    try {
      const res = await retryPayment({
        orderId,
        threadId: activeThreadId,
        buyerVpa: 'success@razorpay',
      });
      setLatestResult(res);

      // Re-fetch thread to show confirmed recovery envelopes
      const threadData = await fetchThread(activeThreadId);
      if (threadData?.messages) {
        setMessages(threadData.messages);
      }

      // Refresh spending numbers
      const polData = await fetchPolicy();
      if (typeof polData?.week_spent_so_far === 'number') {
        setWeekSpentSoFar(polData.week_spent_so_far);
      }
    } catch (err: any) {
      console.error('Error retrying payment:', err);
    } finally {
      setIsRetrying(false);
    }
  };

  // Handle Cancel Order from Mobile Phone Recovery Card
  const handleCancelOrder = async (orderId: string) => {
    if (!activeThreadId) return;
    try {
      await cancelOrder({
        orderId,
        threadId: activeThreadId,
        reason: 'ORDER_CANCELLED_BY_USER',
      });

      setLatestResult((prev) =>
        prev
          ? {
              ...prev,
              status: 'REJECTED',
              final_message_type: 'ORDER_FAIL',
              message: 'Order cancelled by restaurant manager. Holds released.',
            }
          : null
      );

      const threadData = await fetchThread(activeThreadId);
      if (threadData?.messages) {
        setMessages(threadData.messages);
      }
    } catch (err: any) {
      console.error('Error cancelling order:', err);
    }
  };

  // Reset System State
  const handleReset = async () => {
    setIsResetting(true);
    try {
      await resetSystemState();
      setBuyerStockKg(15);
      setBuyerTargetStockKg(65);
      setSellerStockKg(500);
      setDelegationMode('partial');
      setWeekSpentSoFar(0);
      setPendingOffer(null);
      setLatestResult(null);
      setMessages([]);
      setActiveThreadId(null);
      setSimulationMode('happy');
      setSimulatePaymentFail(false);
      await loadInitialData();
    } catch (err) {
      console.error('Error resetting system:', err);
    } finally {
      setIsResetting(false);
    }
  };

  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  const handleSelectMessage = (msgId: string) => {
    setHighlightedMessageId(msgId);
  };

  return (
    <div className="app-container">
      {/* 1. Top Navbar: Completely sticking to the top as a proper sharp rectangle */}
      <Header
        onReset={handleReset}
        isResetting={isResetting}
        delegationMode={delegationMode}
        onOpenKeyModal={() => setIsKeyModalOpen(true)}
        hasCustomKeys={hasCustomKeys}
      />

      {/* Main Content Layout */}
      <div className="main-content-wrapper">
        {/* TOP: Simulation occupying the entire horizontal width */}
        <div className="simulation-fullwidth">
          <RazorSliceArchitecture
            onRunAi={handleRunAi}
            isRunning={isRunning}
            delegationMode={delegationMode}
            latestResult={latestResult}
            messages={messages}
            onSelectMessage={handleSelectMessage}
            simulatePaymentFail={simulatePaymentFail || simulationMode === 'bank_decline'}
            simulationMode={simulationMode}
            setSimulationMode={setSimulationMode}
          />
        </div>

        {/* BOTTOM: Horizontal Split between Envelope Trace (Left) and Phone (Right) */}
        <div className="bottom-split-grid">
          <div>
            <EnvelopeTrace
              messages={messages}
              threadId={activeThreadId}
              isLoading={isRunning}
              highlightedMessageId={highlightedMessageId}
            />
          </div>

          <div>
            <MobileDevice
              delegationMode={delegationMode}
              setDelegationMode={handleModeChange}
              pendingOffer={pendingOffer}
              onConfirmTransaction={handleConfirmTransaction}
              isConfirming={isConfirming}
              latestResult={latestResult}
              messages={messages}
              weekSpentSoFar={weekSpentSoFar}
              weeklyBudgetCap={weeklyBudgetCap}
              perTransactionCap={perTransactionCap}
              simulatePaymentFail={simulatePaymentFail || simulationMode === 'bank_decline'}
              setSimulatePaymentFail={(val) => {
                setSimulatePaymentFail(val);
                setSimulationMode(val ? 'bank_decline' : 'happy');
              }}
              simulationMode={simulationMode}
              setSimulationMode={setSimulationMode}
              onRetryPayment={handleRetryPayment}
              onCancelPayment={handleCancelOrder}
              isRetrying={isRetrying}
            />
          </div>
        </div>
      </div>

      {/* BYOK (Bring Your Own Keys) Settings Modal */}
      <ApiKeyModal
        isOpen={isKeyModalOpen}
        onClose={() => setIsKeyModalOpen(false)}
        onKeysChanged={() => setHasCustomKeys(hasCustomRazorpayKeys())}
      />
    </div>
  );
};

export default App;
