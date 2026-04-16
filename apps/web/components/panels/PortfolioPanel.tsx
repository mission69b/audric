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
  activityCount?: number;
  activityHasMore?: boolean;
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

const TOOL_GRID: { category: string; title: string; desc: string; action: string; prompt: string }[] = [
  { category: 'Analytics', title: 'Net worth timeline', desc: 'Wallet / savings / debt over time', action: '7D 30D 90D 1Y', prompt: 'Show my portfolio timeline for the last 90 days' },
  { category: 'Simulator', title: 'Yield projector', desc: 'Simulate compound returns', action: 'Adjust amount + APY', prompt: 'Show the yield projector' },
  { category: 'Analytics', title: 'Activity heatmap', desc: 'GitHub-style transaction grid', action: 'Full year view', prompt: 'Show my on-chain activity heatmap' },
  { category: 'Simulator', title: 'Health simulator', desc: 'Model borrow scenarios', action: 'Collateral + debt sliders', prompt: 'Open the health factor simulator' },
  { category: 'Analytics', title: 'Spending breakdown', desc: 'MPP API spend by service', action: 'Week / Month / Year', prompt: 'Show my spending breakdown by category' },
  { category: 'Simulator', title: 'DCA planner', desc: 'Recurring savings projection', action: 'Set amount + cadence', prompt: 'Show me a DCA savings plan: $200 per month for 2 years' },
];

const SIMULATE_TOOLS: { icon: string; title: string; desc: string; prompt: string }[] = [
  { icon: '⚡', title: 'Yield projector', desc: 'Sliders for principal, APY, time period · compound returns', prompt: 'Show the yield projector — how much would I earn if I saved $5000 for a year?' },
  { icon: '🩺', title: 'Health factor simulator', desc: 'Collateral + debt sliders · liquidation scenario modelling', prompt: 'Open the health factor simulator' },
  { icon: '📅', title: 'DCA planner', desc: 'Set amount + cadence · project savings curve over time', prompt: 'Show me a DCA savings plan: $200 per month for 2 years' },
];

export function PortfolioPanel({ balance, onSendMessage, goals, activityCount, activityHasMore }: PortfolioPanelProps) {
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

  const dailyEarning = balance.savings * (balance.savingsRate / 365);

  const statCards = [
    {
      label: 'Savings',
      drill: 'NAVI',
      value: `$${fmtUsd(balance.savings)}`,
      sub: balance.savingsRate > 0 ? `${(balance.savingsRate * 100).toFixed(1)}% APY` : '--',
      trend: dailyEarning > 0 ? `$${dailyEarning.toFixed(4)}/day` : undefined,
      accent: balance.savings > 0,
      prompt: 'Show me my savings position and NAVI yield details',
    },
    {
      label: 'Health',
      drill: 'Simulate',
      value: balance.healthFactor != null ? balance.healthFactor.toFixed(1) : '--',
      sub: balance.borrows > 0 ? `$${fmtUsd(balance.borrows)} debt` : '$0 debt',
      trend: balance.healthFactor != null && balance.healthFactor > 100 ? 'No liquidation risk' : balance.borrows > 0 ? 'Monitor closely' : undefined,
      warn: balance.healthFactor != null && balance.healthFactor < 2,
      accent: balance.healthFactor != null && balance.healthFactor >= 2,
      prompt: 'Open the health factor simulator',
    },
    {
      label: 'Activity (30D)',
      drill: 'Heatmap',
      value: activityCount != null ? `${activityCount}${activityHasMore ? '+' : ''}` : '--',
      sub: 'transactions',
      trend: undefined,
      prompt: 'Show my on-chain activity heatmap for the past year',
    },
    {
      label: 'Spending',
      drill: 'Breakdown',
      value: '--',
      sub: '40+ services',
      trend: 'This month',
      prompt: 'Show my API spending breakdown by category',
    },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 space-y-6">
      {/* Tab bar */}
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
                <div className="flex items-center justify-between mb-2">
                  <p className="font-mono text-[9px] tracking-[0.1em] uppercase text-muted">{card.label}</p>
                  <p className="font-mono text-[9px] text-dim">{card.drill} →</p>
                </div>
                <p className={`font-mono text-sm ${card.warn ? 'text-warning' : card.accent ? 'text-success' : 'text-foreground'}`}>
                  {card.value}
                </p>
                <p className="text-[10px] text-dim mt-0.5">{card.sub}</p>
                {card.trend && (
                  <p className="font-mono text-[9px] text-muted mt-1">{card.trend}</p>
                )}
              </button>
            ))}
          </div>

          {/* Allocation bar */}
          {allocation.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted">Allocation</h3>
              <div className="h-[5px] rounded-[3px] overflow-hidden flex bg-border">
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
                    <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                    {seg.label} {seg.pct.toFixed(0)}%
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Insights — green-tinted bordered panel */}
          {insights.length > 0 && (
            <div className="rounded-lg border border-success/15 bg-success/[0.04] px-4 py-3 space-y-1">
              <h3 className="font-mono text-[9px] tracking-[0.1em] uppercase text-success mb-2">Audric noticed</h3>
              {insights.map((insight, i) => (
                <div key={i} className="flex gap-2 text-[11px] text-dim leading-relaxed py-0.5">
                  <span className="text-success shrink-0">→</span>
                  <span>{insight}</span>
                </div>
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

          {/* Interactive tools — 2x3 grid with category labels */}
          <div className="space-y-2">
            <h3 className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted">Interactive tools</h3>
            <div className="grid grid-cols-2 gap-[7px]">
              {TOOL_GRID.map((t) => (
                <button
                  key={t.title}
                  onClick={() => onSendMessage(t.prompt)}
                  className="flex flex-col rounded-lg border border-border bg-surface px-4 py-3 text-left transition hover:bg-[var(--n700)] hover:border-border-bright"
                >
                  <span className="font-mono text-[8px] tracking-[0.08em] uppercase text-border-bright mb-1">{t.category}</span>
                  <span className="text-[12px] font-medium text-[var(--n300)] mb-0.5">{t.title}</span>
                  <span className="text-[10px] text-dim leading-relaxed">{t.desc}</span>
                  <span className="font-mono text-[9px] text-border-bright mt-1.5">{t.action} →</span>
                </button>
              ))}
            </div>
            {/* Full portfolio overview — full width */}
            <button
              onClick={() => onSendMessage('Show me my full portfolio overview')}
              className="w-full flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-left hover:bg-[var(--n700)] hover:border-border-bright transition"
            >
              <div>
                <span className="font-mono text-[8px] tracking-[0.08em] uppercase text-border-bright block mb-1">Overview</span>
                <span className="text-[12px] font-medium text-[var(--n300)] block mb-0.5">Full portfolio overview</span>
                <span className="text-[10px] text-dim">4-panel canvas: savings, health, activity, spending</span>
              </div>
              <span className="font-mono text-[18px] text-border ml-4">→</span>
            </button>
          </div>
        </div>
      )}

      {activeTab === 'timeline' && (
        <TabPlaceholder
          label="Timeline"
          desc="Net worth over time — wallet, savings, and debt"
          subtext="Opens canvas in chat"
          prompt="Show my portfolio timeline for the last 90 days"
          onSendMessage={onSendMessage}
        />
      )}

      {activeTab === 'activity' && (
        <TabPlaceholder
          label="Activity heatmap"
          desc="GitHub-style on-chain activity grid"
          subtext="Opens canvas in chat"
          prompt="Show my on-chain activity heatmap for the past year"
          onSendMessage={onSendMessage}
        />
      )}

      {activeTab === 'simulate' && (
        <div className="space-y-2">
          <p className="font-mono text-[9px] tracking-[0.1em] uppercase text-dim mb-1">Simulators — adjust and explore before acting</p>
          {SIMULATE_TOOLS.map((t) => (
            <button
              key={t.title}
              onClick={() => onSendMessage(t.prompt)}
              className="w-full flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-left hover:bg-[var(--n700)] hover:border-border-bright transition"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg shrink-0">{t.icon}</span>
                <div>
                  <span className="text-[12px] font-medium text-[var(--n300)] block">{t.title}</span>
                  <span className="text-[10px] text-dim leading-relaxed">{t.desc}</span>
                </div>
              </div>
              <span className="text-border-bright text-lg ml-4">›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TabPlaceholder({ label, desc, subtext, prompt, onSendMessage }: { label: string; desc: string; subtext?: string; prompt: string; onSendMessage: (t: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] uppercase text-dim">{label}</p>
      <p className="text-[12px] text-border-bright text-center leading-relaxed">
        {desc}
        {subtext && <><br />{subtext}</>}
      </p>
      <button
        onClick={() => onSendMessage(prompt)}
        className="font-mono text-[11px] tracking-[0.08em] uppercase text-background bg-foreground rounded-full px-4 py-2 hover:opacity-90 transition mt-2"
      >
        Show {label} →
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
