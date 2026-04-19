'use client';

// [PHASE 5] Portfolio panel — re-skinned to match the new design system.
//
// Visual language now matches `design_handoff_audric/.../portfolio.jsx`:
//   • <BalanceHero> at top (large serif total + AVAILABLE / EARNING eyebrow)
//   • Centered 4-tab nav (OVERVIEW / TIMELINE / ACTIVITY / SIMULATE)
//   • 4-up "panel-2" stat cards (SAVINGS / HEALTH / ACTIVITY / SPENDING)
//     rendered as full-card <button>s so the entire surface is the click
//     target (matches the engine-routing behavior from the previous panel)
//   • 8px allocation bar with hover dim-out (legend mirrors the bar)
//   • HOLDINGS / SAVINGS POSITIONS list cards via <Card surface="sunken">
//     with pad=0 + internal divide-y rows
//   • INTERACTIVE TOOLS grid (existing 6-card + full-width prompt set
//     preserved — each card still routes to engine via `onSendMessage`)
//
// Behavior is unchanged: every clickable surface fires the same prompt
// string into the engine that it did before. Tab routing, stat-card
// prompts, tool-card prompts, and SIMULATE prompts are all byte-identical.

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { BalanceHero } from '@/components/ui/BalanceHero';
import type { BalanceHeaderData } from '@/components/dashboard/BalanceHeader';

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

const SIMULATE_TOOLS: { category: string; title: string; desc: string; prompt: string }[] = [
  { category: 'Yield', title: 'Yield projector', desc: 'Sliders for principal, APY, time period \u00B7 compound returns', prompt: 'Show the yield projector \u2014 how much would I earn if I saved $5000 for a year?' },
  { category: 'Risk', title: 'Health factor simulator', desc: 'Collateral + debt sliders \u00B7 liquidation scenario modelling', prompt: 'Open the health factor simulator' },
  { category: 'Plan', title: 'DCA planner', desc: 'Set amount + cadence \u00B7 project savings curve over time', prompt: 'Show me a DCA savings plan: $200 per month for 2 years' },
];

export function PortfolioPanel({ balance, onSendMessage, activityCount, activityHasMore }: PortfolioPanelProps) {
  const [activeTab, setActiveTab] = useState<PortfolioTab>('overview');
  const [allocHover, setAllocHover] = useState<string | null>(null);

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
      value: '\u2014',
      sub: '40+ services',
      trend: 'This month',
      prompt: 'Show my API spending breakdown by category',
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[820px] px-4 sm:px-6 md:px-8 py-6 flex flex-col gap-[18px]">
      {/* Top: BalanceHero matches design's <BalanceHeader/> primitive (large
          serif total + uppercase AVAILABLE/EARNING eyebrow). Wrapper padding
          mirrors the design's internal `padding:'20px 0 16px'`. */}
      <div className="pt-5 pb-4">
        <BalanceHero
          total={balance.total}
          available={balance.cash}
          earning={balance.savings}
          size="lg"
        />
      </div>

      {/* Centered tab bar — sits on top of a thin underline that runs the
          full panel width so the active tab's 2px under-bar visually merges
          with the divider. */}
      <div className="flex gap-1.5 justify-center border-b border-border-subtle">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={[
                'px-4 py-2.5 -mb-px font-mono text-[11px] tracking-[0.1em] uppercase transition-colors border-b-2 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] rounded-t',
                isActive
                  ? 'text-fg-primary border-fg-primary'
                  : 'text-fg-muted border-transparent hover:text-fg-primary',
              ].join(' ')}
              aria-current={isActive ? 'page' : undefined}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'overview' && (
        <div className="flex flex-col gap-[18px]">
          {/* 4-up stat cards. Sunken surface == design's `var(--panel-2)`.
              Rendered as `<button>` so the full card is the click target
              (avoids a dead 14px gutter that a Card+inner-button pattern
              creates). */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {statCards.map((card) => (
              <button
                key={card.label}
                type="button"
                onClick={() => onSendMessage(card.prompt)}
                className="text-left rounded-md border border-border-subtle bg-surface-sunken p-[14px] transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
              >
                <div className="flex items-center justify-between font-mono text-[9px] tracking-[0.1em] uppercase text-fg-muted">
                  <span>{card.label}</span>
                  <span className="text-fg-muted">{card.drill} &#8599;</span>
                </div>
                <div
                  className={[
                    'text-[22px] tracking-[-0.02em] mt-2.5 leading-none',
                    card.warn
                      ? 'text-warning-solid'
                      : card.accent
                        ? 'text-success-solid'
                        : 'text-fg-primary',
                  ].join(' ')}
                >
                  {card.value}
                </div>
                <div className="text-[11px] text-fg-muted mt-1">{card.sub}</div>
                {card.trend && (
                  <div className="text-[11px] text-fg-muted">{card.trend}</div>
                )}
              </button>
            ))}
          </div>

          {/* Allocation: 8px bar + legend with synchronized hover dim-out. */}
          {allocation.length > 0 && (
            <div>
              <div className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted mb-2.5">
                Allocation
              </div>
              <div className="flex h-2 rounded-[4px] overflow-hidden bg-border-subtle">
                {allocation.map((seg) => {
                  const dim = allocHover && allocHover !== seg.key;
                  return (
                    <div
                      key={seg.key}
                      onMouseEnter={() => setAllocHover(seg.key)}
                      onMouseLeave={() => setAllocHover(null)}
                      className="h-full transition-opacity duration-150"
                      style={{
                        width: `${seg.pct}%`,
                        backgroundColor: seg.color,
                        opacity: dim ? 0.25 : 1,
                      }}
                      title={`${seg.label}: ${seg.pct.toFixed(0)}%`}
                    />
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5">
                {allocation.map((seg) => {
                  const dim = allocHover && allocHover !== seg.key;
                  return (
                    <span
                      key={seg.key}
                      onMouseEnter={() => setAllocHover(seg.key)}
                      onMouseLeave={() => setAllocHover(null)}
                      className="inline-flex items-center gap-1.5 text-[11px] text-fg-secondary transition-opacity duration-150"
                      style={{ opacity: dim ? 0.35 : 1 }}
                    >
                      <span
                        className="inline-block w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: seg.color }}
                      />
                      {seg.label} {seg.pct.toFixed(0)}%
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* HOLDINGS list — sunken-surface card with divider rows. */}
          {holdings.length > 0 && (
            <div>
              <div className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted mb-2.5">
                Holdings
              </div>
              <Card surface="sunken" pad={0}>
                <ul className="divide-y divide-border-subtle">
                  {holdings.map((h) => (
                    <li
                      key={h.symbol}
                      className="flex items-center justify-between px-4 py-3.5"
                    >
                      <span className="text-[14px] text-fg-primary">{h.symbol}</span>
                      <div className="text-right">
                        <div className="font-mono text-[14px] text-fg-primary">{h.amount}</div>
                        {h.usd && (
                          <div className="font-mono text-[11px] text-fg-muted">{h.usd}</div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          )}

          {/* SAVINGS POSITIONS — same chrome as Holdings. */}
          {balance.savingsBreakdown && balance.savingsBreakdown.filter((s) => s.amount >= 0.01).length > 0 && (
            <div>
              <div className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted mb-2.5">
                Savings positions
              </div>
              <Card surface="sunken" pad={0}>
                <ul className="divide-y divide-border-subtle">
                  {balance.savingsBreakdown!.filter((s) => s.amount >= 0.01).map((s) => (
                    <li
                      key={`${s.protocolId}-${s.asset}`}
                      className="flex items-center justify-between px-4 py-3.5"
                    >
                      <div className="text-[14px] text-fg-primary">
                        {s.protocol}
                        {s.asset !== 'USDC' && (
                          <span className="text-fg-muted text-[12px] ml-1.5">({s.asset})</span>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-[14px] text-fg-primary">${fmtUsd(s.amount)}</div>
                        <div className="font-mono text-[11px] text-success-solid">
                          {(s.apy * 100).toFixed(1)}% APY
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          )}

          {/* INTERACTIVE TOOLS — 2-up grid + full-width "overview" tile.
              Each tile is a button that routes its `prompt` into the engine. */}
          <div>
            <div className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted mb-2.5">
              Interactive tools
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {TOOL_GRID.map((t) => (
                <button
                  key={t.title}
                  type="button"
                  onClick={() => onSendMessage(t.prompt)}
                  className="flex flex-col rounded-md border border-border-subtle bg-surface-sunken px-[14px] py-3.5 text-left transition-colors hover:border-border-strong hover:bg-surface-card focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
                >
                  <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-fg-muted">
                    {t.category}
                  </span>
                  <span className="text-[14px] text-fg-primary mt-1.5">{t.title}</span>
                  <span className="text-[12px] text-fg-muted leading-tight mt-0.5">
                    {t.desc}
                  </span>
                  <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-fg-muted mt-3">
                    {t.action} &#8594;
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => onSendMessage('Show me my full portfolio overview')}
              className="mt-2 w-full flex items-center justify-between rounded-md border border-border-subtle bg-surface-sunken px-[14px] py-3.5 text-left transition-colors hover:border-border-strong hover:bg-surface-card focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
            >
              <div>
                <span className="block font-mono text-[9px] tracking-[0.1em] uppercase text-fg-muted">
                  Overview
                </span>
                <span className="block text-[14px] text-fg-primary mt-1.5">
                  Full portfolio overview
                </span>
                <span className="block text-[12px] text-fg-muted leading-tight mt-0.5">
                  4-panel canvas: savings, health, activity, spending
                </span>
              </div>
              <span aria-hidden="true" className="font-mono text-[18px] text-fg-disabled ml-4">
                &#8594;
              </span>
            </button>
          </div>
        </div>
      )}

      {activeTab === 'timeline' && (
        <TabPlaceholder
          label="Timeline"
          desc={'Net worth over time \u2014 wallet, savings, and debt'}
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
        <div className="flex flex-col gap-2">
          <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted mb-1">
            Simulators &#8212; adjust and explore before acting
          </p>
          {SIMULATE_TOOLS.map((t) => (
            <button
              key={t.title}
              type="button"
              onClick={() => onSendMessage(t.prompt)}
              className="w-full flex items-center justify-between rounded-md border border-border-subtle bg-surface-sunken px-[14px] py-3.5 text-left transition-colors hover:border-border-strong hover:bg-surface-card focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
            >
              <div>
                <span className="block font-mono text-[9px] tracking-[0.1em] uppercase text-fg-muted">
                  {t.category}
                </span>
                <span className="block text-[14px] text-fg-primary mt-1.5">{t.title}</span>
                <span className="block text-[12px] text-fg-muted leading-tight mt-0.5">
                  {t.desc}
                </span>
              </div>
              <span aria-hidden="true" className="font-mono text-[14px] text-fg-disabled ml-4">
                &#8250;
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TabPlaceholder({
  label,
  desc,
  subtext,
  prompt,
  onSendMessage,
}: {
  label: string;
  desc: string;
  subtext?: string;
  prompt: string;
  onSendMessage: (t: string) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
      <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted">{label}</p>
      <p className="text-[12px] text-fg-muted leading-relaxed">
        {desc}
        {subtext && (
          <>
            <br />
            {subtext}
          </>
        )}
      </p>
      <button
        type="button"
        onClick={() => onSendMessage(prompt)}
        className="mt-2 inline-flex items-center gap-1.5 h-[30px] px-3.5 rounded-pill bg-fg-primary font-mono text-[10px] tracking-[0.1em] uppercase text-fg-inverse transition hover:opacity-80 active:scale-[0.97] focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
      >
        Show {label} &#8594;
      </button>
    </div>
  );
}

interface AllocationSegment {
  key: string;
  label: string;
  pct: number;
  color: string;
}

// Legend colors mirror design/portfolio.jsx:
//   USDC  → primary text (var(--fg-primary))
//   SUI   → blue (var(--info-solid))
//   NAVI  → green (var(--success-solid))
//   Debt  → amber (var(--warning-solid)) — extra row when applicable
//   Other → purple (var(--color-purple))
function buildAllocation(balance: BalanceHeaderData): AllocationSegment[] {
  const total = balance.total;
  if (total <= 0) return [];

  const segments: AllocationSegment[] = [];
  if (balance.usdc > 0) {
    segments.push({
      key: 'usdc',
      label: 'Wallet USDC',
      pct: (balance.usdc / total) * 100,
      color: 'var(--fg-primary)',
    });
  }
  if (balance.suiUsd > 0) {
    segments.push({
      key: 'sui',
      label: 'SUI',
      pct: (balance.suiUsd / total) * 100,
      color: 'var(--info-solid)',
    });
  }
  if (balance.savings > 0) {
    segments.push({
      key: 'navi',
      label: 'NAVI Savings',
      pct: (balance.savings / total) * 100,
      color: 'var(--success-solid)',
    });
  }
  if (balance.borrows > 0) {
    segments.push({
      key: 'debt',
      label: 'Debt',
      pct: (balance.borrows / total) * 100,
      color: 'var(--warning-solid)',
    });
  }

  let otherUsd = 0;
  for (const [, usd] of Object.entries(balance.assetUsdValues)) {
    otherUsd += usd ?? 0;
  }
  if (otherUsd > 0.01) {
    segments.push({
      key: 'other',
      label: 'Other',
      pct: (otherUsd / total) * 100,
      color: 'var(--color-purple)',
    });
  }

  return segments.filter((s) => s.pct >= 0.5);
}
