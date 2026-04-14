'use client';

import { useState, useCallback } from 'react';
import type { BalanceHeaderData } from '@/components/dashboard/BalanceHeader';

type PortfolioTab = 'overview' | 'timeline' | 'activity' | 'simulate';

interface PortfolioPanelProps {
  address: string;
  balance: BalanceHeaderData;
  onSendMessage: (text: string) => void;
}

function fmtUsd(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtToken(n: number): string {
  if (n > 0 && n < 0.01) return n.toFixed(8);
  if (n < 1) return n.toFixed(6);
  return n.toFixed(4);
}

const TABS: { id: PortfolioTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'activity', label: 'Activity' },
  { id: 'simulate', label: 'Simulate' },
];

const CANVAS_LAUNCHERS = [
  { label: 'Portfolio Heatmap', icon: '🗓️', prompt: 'Show me my portfolio activity as a heatmap' },
  { label: 'Yield Projector', icon: '📈', prompt: 'Show me a yield projection chart for my savings' },
  { label: 'Asset Distribution', icon: '🍩', prompt: 'Show me a chart of my asset distribution' },
  { label: 'DeFi Overview', icon: '🏦', prompt: 'Show me an overview of Sui DeFi protocols with TVL and yields' },
];

export function PortfolioPanel({ address, balance, onSendMessage }: PortfolioPanelProps) {
  const [activeTab, setActiveTab] = useState<PortfolioTab>('overview');

  const holdings: { symbol: string; amount: string; usd: string }[] = [];
  if (balance.sui > 0) {
    holdings.push({ symbol: 'SUI', amount: fmtToken(balance.sui), usd: `$${fmtUsd(balance.suiUsd)}` });
  }
  if (balance.usdc > 0) {
    holdings.push({ symbol: 'USDC', amount: fmtUsd(balance.usdc), usd: `$${fmtUsd(balance.usdc)}` });
  }
  for (const [symbol, amt] of Object.entries(balance.assetBalances)) {
    const usdVal = balance.assetUsdValues[symbol] ?? 0;
    if (amt > 0 && (usdVal >= 0.01 || amt >= 0.01)) {
      holdings.push({ symbol, amount: fmtToken(amt), usd: usdVal > 0 ? `$${fmtUsd(usdVal)}` : '' });
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 space-y-6">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              px-3 py-2 font-mono text-[11px] tracking-[0.08em] uppercase transition-colors
              ${activeTab === tab.id
                ? 'text-foreground border-b-2 border-foreground -mb-px'
                : 'text-muted hover:text-foreground'}
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Net Worth" value={`$${fmtUsd(balance.total)}`} />
            <StatCard label="Available" value={`$${fmtUsd(balance.cash)}`} />
            <StatCard label="Earning" value={`$${fmtUsd(balance.savings)}`} accent={balance.savings > 0} />
            {balance.borrows > 0 ? (
              <StatCard label="Debt" value={`$${fmtUsd(balance.borrows)}`} warn />
            ) : (
              <StatCard label="Savings APY" value={balance.savingsRate > 0 ? `${(balance.savingsRate * 100).toFixed(1)}%` : '--'} accent={balance.savingsRate > 0} />
            )}
          </div>

          {/* Holdings */}
          {holdings.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted">Holdings</h3>
              <div className="rounded-lg border border-border bg-surface divide-y divide-border">
                {holdings.map((h) => (
                  <div key={h.symbol} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <span className="font-mono text-sm text-foreground">{h.symbol}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm text-foreground">{h.amount}</p>
                      {h.usd && <p className="font-mono text-[11px] text-muted">{h.usd}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Savings breakdown */}
          {balance.savingsBreakdown && balance.savingsBreakdown.filter((s) => s.amount >= 0.01).length > 0 && (
            <div className="space-y-2">
              <h3 className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted">Savings Positions</h3>
              <div className="rounded-lg border border-border bg-surface divide-y divide-border">
                {balance.savingsBreakdown!.filter((s) => s.amount >= 0.01).map((s) => (
                  <div key={`${s.protocolId}-${s.asset}`} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <span className="text-sm text-foreground">{s.protocol}</span>
                      {s.asset !== 'USDC' && <span className="text-xs text-muted ml-1.5">({s.asset})</span>}
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm text-foreground">${fmtUsd(s.amount)}</p>
                      <p className="font-mono text-[11px] text-success">{(s.apy * 100).toFixed(1)}% APY</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Canvas launchers */}
          <div className="space-y-2">
            <h3 className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted">Visualizations</h3>
            <div className="grid grid-cols-2 gap-2">
              {CANVAS_LAUNCHERS.map((c) => (
                <button
                  key={c.label}
                  onClick={() => onSendMessage(c.prompt)}
                  className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-4 py-3 text-left transition hover:bg-[var(--n700)] hover:border-border-bright"
                >
                  <span className="text-xl shrink-0">{c.icon}</span>
                  <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-muted">{c.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab !== 'overview' && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted text-sm mb-4">{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} view coming soon</p>
          <button
            onClick={() => onSendMessage(`Show me my portfolio ${activeTab}`)}
            className="font-mono text-[11px] tracking-[0.08em] uppercase text-foreground border border-border rounded-full px-4 py-2 hover:bg-surface transition"
          >
            Ask Audric
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent, warn }: { label: string; value: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-3">
      <p className="font-mono text-[9px] tracking-[0.1em] uppercase text-muted mb-1">{label}</p>
      <p className={`font-mono text-sm ${warn ? 'text-warning' : accent ? 'text-success' : 'text-foreground'}`}>
        {value}
      </p>
    </div>
  );
}
