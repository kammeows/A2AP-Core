import React from 'react';
import { Sliders, ShoppingBag, Store, Play, Sparkles, AlertTriangle, CheckCircle, PackageX, TrendingDown } from 'lucide-react';

interface StockConfiguratorProps {
  buyerStockKg: number;
  setBuyerStockKg: (val: number) => void;
  sellerStockKg: number;
  setSellerStockKg: (val: number) => void;
  buyerTargetStockKg: number;
  setBuyerTargetStockKg: (val: number) => void;
  onRunAi: (scenario?: 'happy' | 'failure' | 'custom') => void;
  isRunning: boolean;
  delegationMode: 'full' | 'partial';
}

export const StockConfigurator: React.FC<StockConfiguratorProps> = ({
  buyerStockKg,
  setBuyerStockKg,
  sellerStockKg,
  setSellerStockKg,
  buyerTargetStockKg,
  setBuyerTargetStockKg,
  onRunAi,
  isRunning,
  delegationMode,
}) => {
  const deficitKg = Math.max(0, buyerTargetStockKg - buyerStockKg);
  const isHealthyStock = deficitKg === 0;
  const isSellerOutOfStock = sellerStockKg === 0;

  // Preset Handlers
  const applyPreset = (preset: 'standard' | 'healthy' | 'no_seller' | 'over_cap') => {
    if (preset === 'standard') {
      setBuyerStockKg(15);
      setSellerStockKg(500);
      setBuyerTargetStockKg(65);
    } else if (preset === 'healthy') {
      setBuyerStockKg(70);
      setSellerStockKg(500);
      setBuyerTargetStockKg(65);
    } else if (preset === 'no_seller') {
      setBuyerStockKg(15);
      setSellerStockKg(0);
      setBuyerTargetStockKg(65);
    } else if (preset === 'over_cap') {
      setBuyerStockKg(15);
      setSellerStockKg(500);
      setBuyerTargetStockKg(90); // 75kg deficit
    }
  };

  return (
    <div className="glass-card" style={{ marginBottom: '1.75rem' }}>
      <div className="glass-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'rgba(2, 132, 199, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#38bdf8'
          }}>
            <Sliders size={18} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc' }}>
              Agent Stock & Inventory Controls
            </h2>
            <p style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
              Adjust live stock levels to trigger autonomous agent negotiation and explainability
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => applyPreset('standard')}
            style={{
              padding: '0.25rem 0.6rem',
              borderRadius: 6,
              background: '#1e293b',
              border: '1px solid #334155',
              fontSize: '0.72rem',
              color: '#38bdf8',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            🍅 Reorder (50kg)
          </button>
          <button
            onClick={() => applyPreset('healthy')}
            style={{
              padding: '0.25rem 0.6rem',
              borderRadius: 6,
              background: '#1e293b',
              border: '1px solid #334155',
              fontSize: '0.72rem',
              color: '#34d399',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            ⚡ Full Stock
          </button>
          <button
            onClick={() => applyPreset('no_seller')}
            style={{
              padding: '0.25rem 0.6rem',
              borderRadius: 6,
              background: '#1e293b',
              border: '1px solid #334155',
              fontSize: '0.72rem',
              color: '#f87171',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            🚫 Zero Seller Stock
          </button>
          <button
            onClick={() => applyPreset('over_cap')}
            style={{
              padding: '0.25rem 0.6rem',
              borderRadius: 6,
              background: '#1e293b',
              border: '1px solid #334155',
              fontSize: '0.72rem',
              color: '#fbbf24',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            ⚠️ Cap Breach (75kg)
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
        {/* Buyer Stock Slider */}
        <div style={{
          background: '#0d1524',
          border: '1px solid #1e2c44',
          borderRadius: 12,
          padding: '1.1rem',
          position: 'relative'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShoppingBag size={16} color="#38bdf8" />
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f1f5f9' }}>
                Buyer Agent Stock
              </span>
            </div>
            <div style={{
              padding: '0.2rem 0.6rem',
              borderRadius: 6,
              background: isHealthyStock ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              border: `1px solid ${isHealthyStock ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
              fontSize: '0.75rem',
              fontWeight: 700,
              color: isHealthyStock ? '#34d399' : '#fbbf24'
            }}>
              {buyerStockKg} kg / {buyerTargetStockKg} kg
            </div>
          </div>

          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={buyerStockKg}
            onChange={(e) => setBuyerStockKg(Number(e.target.value))}
            style={{ marginBottom: '0.6rem' }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#64748b' }}>
            <span>0 kg (Empty)</span>
            <span style={{ color: '#94a3b8' }}>Target: {buyerTargetStockKg} kg</span>
            <span>100 kg (Max)</span>
          </div>

          <div style={{
            marginTop: '0.75rem',
            padding: '0.5rem 0.65rem',
            borderRadius: 8,
            background: isHealthyStock ? 'rgba(16, 185, 129, 0.08)' : 'rgba(2, 132, 199, 0.08)',
            border: `1px solid ${isHealthyStock ? 'rgba(16, 185, 129, 0.2)' : 'rgba(2, 132, 199, 0.2)'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.75rem'
          }}>
            {isHealthyStock ? (
              <>
                <CheckCircle size={14} color="#10b981" />
                <span style={{ color: '#34d399' }}>Stock is optimal ({buyerStockKg}kg). No purchase needed.</span>
              </>
            ) : (
              <>
                <TrendingDown size={14} color="#38bdf8" />
                <span style={{ color: '#93c5fd' }}>
                  Low stock: <strong>{deficitKg} kg deficit</strong> will trigger RFQ negotiation.
                </span>
              </>
            )}
          </div>
        </div>

        {/* Seller Stock Slider */}
        <div style={{
          background: '#0d1524',
          border: '1px solid #1e2c44',
          borderRadius: 12,
          padding: '1.1rem',
          position: 'relative'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Store size={16} color="#c084fc" />
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f1f5f9' }}>
                Seller Agent Stock
              </span>
            </div>
            <div style={{
              padding: '0.2rem 0.6rem',
              borderRadius: 6,
              background: isSellerOutOfStock ? 'rgba(239, 68, 68, 0.15)' : 'rgba(168, 85, 247, 0.15)',
              border: `1px solid ${isSellerOutOfStock ? 'rgba(239, 68, 68, 0.3)' : 'rgba(168, 85, 247, 0.3)'}`,
              fontSize: '0.75rem',
              fontWeight: 700,
              color: isSellerOutOfStock ? '#f87171' : '#c084fc'
            }}>
              {sellerStockKg} kg Available
            </div>
          </div>

          <input
            type="range"
            min="0"
            max="500"
            step="5"
            value={sellerStockKg}
            onChange={(e) => setSellerStockKg(Number(e.target.value))}
            style={{ marginBottom: '0.6rem' }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#64748b' }}>
            <span>0 kg (Out of stock)</span>
            <span style={{ color: '#94a3b8' }}>Base: ₹32/kg</span>
            <span>500 kg (Full)</span>
          </div>

          <div style={{
            marginTop: '0.75rem',
            padding: '0.5rem 0.65rem',
            borderRadius: 8,
            background: isSellerOutOfStock ? 'rgba(239, 68, 68, 0.08)' : 'rgba(168, 85, 247, 0.08)',
            border: `1px solid ${isSellerOutOfStock ? 'rgba(239, 68, 68, 0.2)' : 'rgba(168, 85, 247, 0.2)'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.75rem'
          }}>
            {isSellerOutOfStock ? (
              <>
                <PackageX size={14} color="#ef4444" />
                <span style={{ color: '#f87171' }}>Vendor is OUT OF STOCK. Will return "No seller found".</span>
              </>
            ) : (
              <>
                <Sparkles size={14} color="#c084fc" />
                <span style={{ color: '#d8b4fe' }}>
                  Dynamic tiers: <strong>30kg (-10%)</strong>, <strong>75kg (-18%)</strong>.
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: '0.75rem',
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        flexWrap: 'wrap',
        gap: '0.75rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.8rem', color: '#94a3b8' }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#38bdf8' }} />
          <span>Active Mode: <strong style={{ color: '#f8fafc' }}>{delegationMode === 'full' ? 'Fully Autonomous' : 'Partial (Human Confirmation)'}</strong></span>
        </div>

        <button
          onClick={() => onRunAi('custom')}
          disabled={isRunning}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.65rem 1.5rem',
            borderRadius: 10,
            background: isRunning ? '#334155' : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
            border: 'none',
            color: '#fff',
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: isRunning ? 'not-allowed' : 'pointer',
            boxShadow: isRunning ? 'none' : '0 4px 18px rgba(2, 132, 199, 0.45)',
            transition: 'all 0.15s ease'
          }}
        >
          {isRunning ? (
            <>
              <div style={{ width: 16, height: 16, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <span>AI Agents Negotiating...</span>
            </>
          ) : (
            <>
              <Play size={16} fill="#fff" />
              <span>Update & Run AI Evaluation</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
