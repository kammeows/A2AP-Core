import React from 'react';
import { Cpu, ShieldCheck, RefreshCw, Layers, CheckCircle2 } from 'lucide-react';

interface HeaderProps {
  onReset: () => void;
  isResetting: boolean;
  delegationMode: 'full' | 'partial';
}

export const Header: React.FC<HeaderProps> = ({ onReset, isResetting, delegationMode }) => {
  return (
    <header className="app-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(2, 132, 199, 0.4)'
        }}>
          <Cpu size={24} color="#fff" />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>
              A2A Bounded Procurement Agent
            </h1>
            <span className="brand-badge">Razorpay Buildathon</span>
          </div>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: 2 }}>
            Deterministic Policy-Gated Agentic Commerce with Multi-Turn Negotiation & Audit Trail
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          padding: '0.35rem 0.75rem',
          borderRadius: 8,
          background: '#131d2e',
          border: '1px solid #1e2e4a',
          fontSize: '0.78rem',
          color: '#38bdf8'
        }}>
          <ShieldCheck size={14} color="#38bdf8" />
          <span>Policy Engine Active</span>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          padding: '0.35rem 0.75rem',
          borderRadius: 8,
          background: delegationMode === 'full' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
          border: `1px solid ${delegationMode === 'full' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
          fontSize: '0.78rem',
          color: delegationMode === 'full' ? '#34d399' : '#fbbf24',
          fontWeight: 600
        }}>
          <Layers size={14} />
          <span>{delegationMode === 'full' ? 'Autonomous Mode' : 'Partial (Human-Gated)'}</span>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          padding: '0.35rem 0.75rem',
          borderRadius: 8,
          background: '#131d2e',
          border: '1px solid #1e2e4a',
          fontSize: '0.78rem',
          color: '#10b981'
        }}>
          <CheckCircle2 size={14} color="#10b981" />
          <span>Razorpay Test API</span>
        </div>

        <button
          onClick={onReset}
          disabled={isResetting}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.4rem 0.85rem',
            borderRadius: 8,
            background: '#1e293b',
            border: '1px solid #334155',
            color: '#cbd5e1',
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          title="Reset database and clear audit threads"
        >
          <RefreshCw size={13} className={isResetting ? 'pulse-animation' : ''} />
          <span>{isResetting ? 'Resetting...' : 'Reset'}</span>
        </button>
      </div>
    </header>
  );
};
