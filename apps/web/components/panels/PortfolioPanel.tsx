'use client';

import { useState } from 'react';
import type { BalanceHeaderData } from '@/components/dashboard/BalanceHeader';
import { generatePortfolioInsights } from '@/lib/portfolio-insights';

type PortfolioTab = 'overview' | 'timeline' | 'activity' | 'simulate';

interface PortfolioPanelProps {
  address: string;
  balance: BalanceHeaderData;
  onSendMessage: (text: string) => void;
  goals?: Array<{ name: string; targetAmount: number; currentAmount: number; deadline?: string }>;
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

const ANALYTICS_CANVASES = [
  { title: 'Net worth timeline', desc: 'Wallet / savings / debt over time', action: '7D 30D 90D 1Y', prompt: 'Show my portfolio timeline for the last 90 days' },
  { title: 'Activity heatmap', desc: 'GitHub-style transaction grid', action: 'Full year view', prompt: 'Show my on-chain activity heatmap' },
  { title: 'Spending breakdown', desc: 'MPP API spend by service', action: 'Week/Month/Year', prompt: 'Show my spending breakdown by category' },
];

const SIMULATOR_CANVASES = [
  { title: 'Yield projector', desc: 'Simulate compound returns with sliders', action: 'Adjust amount + APY', prompt: 'Show the yield projector' },
  { title: 'Health simulator', desc: 'Model borrow scenarios before executing', action: 'Collateral + debt sliders', prompt: 'Open the health factor simulator' },
  { title: 'DCA planner', desc: 'Recurring savings projection', action: 'Set amount + cadence', prompt: 'Show me a DCA savings plan: $200 per month for 2 years' },
];

export function PortfolioPanel({ balance, onSendMessage, goals }: PortfolioPanelProps) {
  const [activeTab, setActiveTab] = useState<PortfolioTab>('overview');

  const holdings: { symbol: string; amount: string; usd: string }[] = [];
  if (balance.sui > 0) holdings.push({ symbol: 'SUI', amount: fmtToken(balance.sui), usd: `$${fmtUsd(balance.suiUsd)}` });
  if (balance.usdc > 0) holdings.push({ symbol: 'USDC', amount: fmtUsd(balance.usdc), usd: `$${fmtUsd(balance.usdc)}` });
  for (const [symbol, amt] of Object.entries(balance.assetBalances)) {
    const usdVal = balance.assetUsdValues[symbol] ?? 0;
    if (amt > 0 && (usdVal >= 0.01 || amt >= 0.01)) {
      holdings.push({ symbol, amount: fmtToken(amt), usd: usdVal > 0 ? `$${fmtUsd(usdVal)}` : '' });
    }
  }

  const allocation = buildAllocation(balance);
  const insights = generatePortfolioInsights({
    idleUsdc: balance.usdc,
    savings: balance.savings,
    savingsApy: balance.savingsRate,
    total: balance.total,
    debt: balance.borrows,
    healthFactor: balance.healthFactor ?? null,
    goals: goals ?? [],
  });

  const statCards = [
    {
      label: 'Savings',
      value: `$${fmtUsd(balance.savings)}`,
      sub: balance.savingsRate > 0 ? `${(balance.savingsRate * 100).toFixed(1)}% APY` : '--',
      accent: balance.savings > 0,
      prompt: 'Show me my savings position and NAVI yield details',
      drill: 'NAVI',
    },
    {
      label: 'Health',
      value: balance.healthFactor != null ? balance.healthFactor.toFixed(1) : '--',
      sub: balance.borrows > 0 ? `$${fmtUsd(balance.borrows)} debt` : '$0 debt',
      warn: balance.healthFactor != null && balance.healthFactor < 2,
      accent: balance.healthFactor != null && balance.healthFactor >= 2,
      prompt: 'Open the health factor simulator',
      drill: 'Simulate',
    },
    {
      label: 'Available',
      value: `$${fmtUsd(balance.cash)}`,
      sub: 'wallet balance',
      prompt: 'What is my current balance breakdown?',
      drill: 'Details',
    },
    {
      label: 'Savings APY',
      value: balance.savingsRate > 0 ? `${(balance.savingsRate * 100).toFixed(1)}%` : '--',
      sub: 'current NAVI rate',
      accent: balance.savingsRate > 0,
      prompt: 'What are the current savings rates?',
      drill: 'Rates',
    },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 space-y-6">
      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 font-mono text-[11px] tracking-[0.08em] uppercase transition-colors ${
              activeTab === tab.id ? 'text-foreground border-b-2 border-foreground -mb-px' : 'text-muted hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* 4-stat drill-down grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {statCards.map((card) => (
              <button
                key={card.label}
                onClick={() => onSendMessage(card.prompt)}
                className="rounded-lg border border-border bg-surface px-3 py-3 text-left hover:border-border-bright transition group"
              >
                <p className="font-mono text-[9px] tracking-[0.1em] uppercase text-muted mb-1">{card.label}</p>
                <p className={`font-mono text-sm ${card.warn ? 'text-warning' : card.accent ? 'text-success' : 'text-foreground'}`}>
                  {card.value}
                </p>
                <p className="text-[10px] text-dim mt-0.5">{card.sub}</p>
                <p className="font-mono text-[9px] tracking-[0.08em] uppercase text-muted mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {card.drill} &rarr;
                </p>
              </button>
            ))}
          </div>

          {/* Allocation bar */}
          {allocation.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted">Allocation</h3>
              <div className="h-2 rounded-full overflow-hidden flex bg-border">
                {allocation.map((seg) => (
                  <div
                    key={seg.label}
                    className="h-full transition-all"
                    style={{ width: `${seg.pct}%`, backgroundColor: seg.color }}
                    title={`${seg.label}: ${seg.pct.toFixed(0)}%`}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {allocation.map((seg) => (
                  <div key={seg.label} className="flex items-center gap-1.5 text-[10px] text-dim">
                    <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: seg.color }} />
                    {seg.label} {seg.pct.toFixed(0)}%
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Insights */}
          {insights.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted">Audric noticed</h3>
              {insights.map((insight, i) => (
                <p key={i} className="text-[12px] text-dim leading-relaxed">
                  &rarr; {insight}
                </p>
              ))}
            </div>
          )}

          {/* Holdings */}
          {holdings.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted">Holdings</h3>
              <div className="rounded-lg border border-border bg-surface divide-y divide-border">
                {holdings.map((h) => (
                  <div key={h.symbol} className="flex items-center justify-between px-4 py-3">
                    <span className="font-mono text-sm text-foreground">{h.symbol}</span>
                    <div className="text-right">
                      <p className="font-mono text-sm text-foreground">{h.amount}</p>
                      {h.usd && <p className="font-mono text-[11px] text-muted">{h.usd}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Savings positions */}
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
            <h3 className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted">Analytics</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {ANALYTICS_CANVASES.map((c) => (
                <CanvasCard key={c.title} {...c} onClick={() => onSendMessage(c.prompt)} />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted">Simulators</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {SIMULATOR_CANVASES.map((c) => (
                <CanvasCard key={c.title} {...c} onClick={() => onSendMessage(c.prompt)} />
              ))}
            </div>
          </div>

          {/* Full overview launcher */}
          <button
            onClick={() => onSendMessage('Show me my full portfolio overview')}
            className="w-full rounded-lg border border-border bg-surface px-4 py-4 text-left hover:border-border-bright transition group"
          >
            <p className="font-mono text-[11px] tracking-[0.06em] uppercase text-foreground">Full portfolio overview</p>
            <p className="text-[11px] text-dim mt-0.5">4-panel canvas: savings, health, activity, spending</p>
          </button>
        </div>
      )}

      {activeTab === 'timeline' && (
        <TabPlaceholder
          label="Timeline"
          desc="Net worth over time — wallet, savings, and debt"
          prompt="Show my portfolio timeline for the last 90 days"
          onSendMessage={onSendMessage}
        />
      )}

      {activeTab === 'activity' && (
        <TabPlaceholder
          label="Activity"
          desc="On-chain transaction heatmap — GitHub-style grid"
          prompt="Show my on-chain activity heatmap"
          onSendMessage={onSendMessage}
        />
      )}

      {activeTab === 'simulate' && (
        <div className="space-y-4">
          <p className="text-sm text-muted">Interactive financial simulators — adjust sliders and see real-time projections.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {SIMULATOR_CANVASES.map((c) => (
              <CanvasCard key={c.title} {...c} onClick={() => onSendMessage(c.prompt)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CanvasCard({ title, desc, action, onClick }: { title: string; desc: string; action: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col rounded-lg border border-border bg-surface px-4 py-3 text-left transition hover:bg-[var(--n700)] hover:border-border-bright"
    >
      <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-foreground">{title}</span>
      <span className="text-[10px] text-dim mt-0.5 leading-relaxed">{desc}</span>
      <span className="font-mono text-[9px] tracking-[0.08em] uppercase text-muted mt-2">{action} &rarr;</span>
    </button>
  );
}

function TabPlaceholder({ label, desc, prompt, onSendMessage }: { label: string; desc: string; prompt: string; onSendMessage: (t: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-sm text-muted mb-2">{desc}</p>
      <button
        onClick={() => onSendMessage(prompt)}
        className="font-mono text-[11px] tracking-[0.08em] uppercase text-foreground border border-border rounded-full px-4 py-2 hover:bg-surface transition mt-2"
      >
        Open {label} &rarr;
      </button>
    </div>
  );
}

function buildAllocation(balance: BalanceHeaderData): Array<{ label: string; pct: number; color: string }> {
  const total = balance.total;
  if (total <= 0) return [];

  const segments: Array<{ label: string; pct: number; color: string }> = [];
  if (balance.usdc > 0) segments.push({ label: 'Wallet USDC', pct: (balance.usdc / total) * 100, color: 'var(--n500)' });
  if (balance.suiUsd > 0) segments.push({ label: 'SUI', pct: (balance.suiUsd / total) * 100, color: '#4DA2FF' });
  if (balance.savings > 0) segments.push({ label: 'NAVI Savings', pct: (balance.savings / total) * 100, color: 'var(--color-success)' });
  if (balance.borrows > 0) segments.push({ label: 'Debt', pct: (balance.borrows / total) * 100, color: 'var(--color-warning)' });

  let otherUsd = 0;
  for (const [, usd] of Object.entries(balance.assetUsdValues)) {
    otherUsd += usd ?? 0;
  }
  if (otherUsd > 0.01) segments.push({ label: 'Other', pct: (otherUsd / total) * 100, color: 'var(--color-purple)' });

  return segments.filter((s) => s.pct >= 0.5);
}
