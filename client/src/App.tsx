import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { StockConfigurator } from './components/StockConfigurator';
import { EnvelopeTrace } from './components/EnvelopeTrace';
import { MobileDevice } from './components/MobileDevice';
import {
  fetchInventory,
  fetchPolicy,
  triggerNegotiation,
  confirmTransaction,
  fetchThread,
  resetSystemState,
  updatePolicy,
} from './api/client';
import { Envelope, NegotiationResult, OfferPayload } from './types';

export const App: React.FC = () => {
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

  // UI Status
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [simulatePaymentFail, setSimulatePaymentFail] = useState<boolean>(false);

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
  const handleRunAi = async (scenario: 'happy' | 'failure' | 'custom' = 'custom') => {
    setIsRunning(true);
    setPendingOffer(null);
    setLatestResult(null);

    try {
      const result = await triggerNegotiation({
        scenario,
        buyerStockKg,
        sellerStockKg,
        buyerTargetStockKg,
        delegationMode,
        simulatePaymentFail,
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
    } catch (err: any) {
      console.error('Error executing AI procurement:', err);
      setLatestResult({
        success: false,
        thread_id: '',
        scenario,
        status: 'PAYMENT_FAILED',
        final_message_type: 'ORDER_FAIL',
        message: err.message || 'Execution failed',
      });
    } finally {
      setIsRunning(false);
    }
  };

  // Handle Human Confirmation in Partial Mode
  const handleConfirmTransaction = async (action: 'approve' | 'decline') => {
    if (!activeThreadId || !pendingOffer) return;
    setIsConfirming(true);

    try {
      const res = await confirmTransaction({
        threadId: activeThreadId,
        offer: pendingOffer,
        action,
        simulatePaymentFail,
      });

      // Update state
      setPendingOffer(null);

      if (res.status === 'CONFIRMED') {
        setLatestResult((prev) => ({
          success: true,
          thread_id: activeThreadId,
          scenario: prev?.scenario || 'custom',
          status: 'CONFIRMED',
          final_message_type: 'ORDER_CONFIRM',
          order_id: res.order_id,
          total_amount: res.total_amount,
        }));

        if (res.buyer_stock !== undefined) setBuyerStockKg(res.buyer_stock);
        if (res.seller_stock !== undefined) setSellerStockKg(res.seller_stock);
      } else if (res.status === 'DECLINED') {
        setLatestResult((prev) => ({
          success: true,
          thread_id: activeThreadId,
          scenario: prev?.scenario || 'custom',
          status: 'REJECTED',
          final_message_type: 'ORDER_FAIL',
          message: 'Transaction declined by user',
        }));
      } else if (res.status === 'PAYMENT_FAILED') {
        setLatestResult((prev) => ({
          success: false,
          thread_id: activeThreadId,
          scenario: prev?.scenario || 'custom',
          status: 'PAYMENT_FAILED',
          final_message_type: 'ORDER_FAIL',
          message: 'Payment gateway error',
        }));
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
    } catch (err) {
      console.error('Error confirming transaction:', err);
    } finally {
      setIsConfirming(false);
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
      await loadInitialData();
    } catch (err) {
      console.error('Error resetting system:', err);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="app-container">
      {/* Top Header */}
      <Header
        onReset={handleReset}
        isResetting={isResetting}
        delegationMode={delegationMode}
      />

      {/* 2-Column Split Layout */}
      <div className="main-grid">
        {/* Left Column: Stock Sliders + Audit Trace */}
        <div>
          {/* 1. Stock Configurator */}
          <StockConfigurator
            buyerStockKg={buyerStockKg}
            setBuyerStockKg={setBuyerStockKg}
            sellerStockKg={sellerStockKg}
            setSellerStockKg={setSellerStockKg}
            buyerTargetStockKg={buyerTargetStockKg}
            setBuyerTargetStockKg={setBuyerTargetStockKg}
            onRunAi={handleRunAi}
            isRunning={isRunning}
            delegationMode={delegationMode}
          />

          {/* 2. Explainable Envelope Trace */}
          <EnvelopeTrace
            messages={messages}
            threadId={activeThreadId}
            isLoading={isRunning}
          />
        </div>

        {/* Right Column: Mobile Interface */}
        <div>
          <MobileDevice
            delegationMode={delegationMode}
            setDelegationMode={handleModeChange}
            pendingOffer={pendingOffer}
            onConfirmTransaction={handleConfirmTransaction}
            isConfirming={isConfirming}
            latestResult={latestResult}
            weekSpentSoFar={weekSpentSoFar}
            weeklyBudgetCap={weeklyBudgetCap}
            perTransactionCap={perTransactionCap}
            simulatePaymentFail={simulatePaymentFail}
            setSimulatePaymentFail={setSimulatePaymentFail}
          />
        </div>
      </div>
    </div>
  );
};

export default App;
