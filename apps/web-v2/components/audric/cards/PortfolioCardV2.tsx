'use client';

import {
  AddressBadge,
  CardShell,
  fmtUsd,
  fmtYield,
  MiniBar,
  QRow,
} from './primitives';
import { APYBlock, AssetRow, HFGauge, MetricBlock } from './shared';

// PortfolioCardV2 — `portfolio_analysis` tool renderer.
//
// [R6.4 / A3 — 2026-05-30] Rebuilt to the phase2 read-card spec
// (`t2000-AFI/audric/phase2-read-cards.html` R4): a "Total value" hero
// MetricBlock with a 24h/week delta pill, the allocation MiniBar,
// compact allocation AssetRows (% + USD), and the savings / DeFi /
// debt+HF sections in dotted rows, closing on a "Net worth" footer.
// Data shape + derivations preserved from the prior `apps/web` port.

interface PortfolioDataV2 {
  totalValue: number;
  walletValue: number;
  savingsValue: number;
  defiValue?: number;
  defiSource?: 'blockvision' | 'partial' | 'partial-stale' | 'degraded';
  debtValue: number;
  healthFactor: number | null;
  allocations: {
    symbol: string;
    amount: number;
    usdValue: number;
    percentage: number;
  }[];
  stablePercentage: number;
  insights: { type: string; message: string }[];
  savingsApy?: number;
  dailyEarning?: number;
  weekChange?: { absoluteUsd: number; percentChange: number };
  address?: string;
  isSelfQuery?: boolean;
  suinsName?: string | null;
}

const SECTION_LABEL =
  'text-[10px] font-mono uppercase tracking-[0.08em] text-muted-foreground';

const DUST_USD = 0.01;
const TOP_WALLET_ALLOCATIONS = 5;
const DEFAULT_LIQUIDATION_THRESHOLD = 1.0;

function apyToBps(rate: number | undefined): number {
  if (rate == null || rate <= 0) return 0;
  const pct = rate < 1 ? rate * 100 : rate;
  return Math.round(pct * 100);
}

export function PortfolioCardV2({ data }: { data: PortfolioDataV2 }) {
  const topAllocations = [...data.allocations]
    .filter((a) => a.usdValue > DUST_USD)
    .sort((a, b) => b.usdValue - a.usdValue);

  const segments = topAllocations.slice(0, 4).map((a) => ({
    label: a.symbol,
    value: a.usdValue,
    percentage: a.percentage,
  }));

  const walletAllocations = topAllocations.slice(0, TOP_WALLET_ALLOCATIONS);

  const isWatched = data.isSelfQuery === false && !!data.address;
  const badge = isWatched ? (
    <AddressBadge address={data.address!} suinsName={data.suinsName} />
  ) : undefined;
  const title = isWatched ? 'Portfolio' : 'Your portfolio';

  const savingsApyBps = apyToBps(data.savingsApy);
  const showSavingsApy = data.savingsValue > 0 && savingsApyBps > 0;
  const showDailyYield =
    data.dailyEarning != null && data.dailyEarning > 0 && data.savingsValue > 0;
  const showDefi = (data.defiValue ?? 0) > 0;
  const hasDebt = data.debtValue > 0;
  const hasHealthFactor =
    hasDebt && data.healthFactor != null && Number.isFinite(data.healthFactor);

  const week = data.weekChange;
  const weekDelta =
    week && week.absoluteUsd !== 0
      ? ({
          direction: week.absoluteUsd >= 0 ? 'up' : 'down',
          value: `${week.absoluteUsd >= 0 ? '+' : '−'}$${fmtUsd(Math.abs(week.absoluteUsd))}`,
        } as const)
      : undefined;

  return (
    <CardShell
      title={title}
      badge={badge}
      footer={
        <>
          <span>Net worth</span>
          <span className="font-medium text-foreground">
            ${fmtUsd(data.totalValue)}
          </span>
        </>
      }
    >
      <div className="space-y-4">
        {/* HERO — total value + week trend */}
        <MetricBlock
          label="Total value"
          value={`$${fmtUsd(data.totalValue)}`}
          delta={weekDelta}
          sub={
            week && week.percentChange !== 0 ? (
              <span
                className={week.percentChange >= 0 ? 'text-success' : 'text-destructive'}
              >
                {week.percentChange >= 0 ? '+' : ''}
                {week.percentChange.toFixed(2)}% this week
              </span>
            ) : undefined
          }
        />

        {/* ALLOCATION BAR */}
        {segments.length > 0 && <MiniBar segments={segments} />}

        {/* WALLET SECTION */}
        {walletAllocations.length > 0 && (
          <div className="border-border border-t pt-3">
            <div className={`${SECTION_LABEL} mb-1`}>Wallet</div>
            {walletAllocations.map((a) => (
              <AssetRow
                key={a.symbol}
                symbol={a.symbol}
                amount={`${a.percentage.toFixed(0)}%`}
                value={`$${fmtUsd(a.usdValue)}`}
              />
            ))}
          </div>
        )}

        {/* SAVINGS SECTION */}
        {data.savingsValue > 0 && (
          <div className="border-border border-t pt-3">
            <div className={`${SECTION_LABEL} mb-1`}>Savings</div>
            <AssetRow
              symbol="USDC"
              sub="deposited"
              value={`$${fmtUsd(data.savingsValue)}`}
              tone="success"
            />
            {showSavingsApy && (
              <div className="mt-2 flex items-baseline justify-between">
                <span className={SECTION_LABEL}>Pool APY</span>
                <APYBlock asset="USDC" apyBps={savingsApyBps} />
              </div>
            )}
            {showDailyYield && (
              <QRow label="Daily yield" tone="up">
                {fmtYield(data.dailyEarning!)}/day
              </QRow>
            )}
          </div>
        )}

        {/* DEFI SECTION */}
        {showDefi && (
          <div className="border-border border-t pt-3">
            <QRow label="DeFi">
              ${fmtUsd(data.defiValue!)}
              {data.defiSource === 'partial' && (
                <span className="ml-1 text-[10px] text-warning">(partial)</span>
              )}
              {data.defiSource === 'partial-stale' && (
                <span className="ml-1 text-[10px] text-warning">(cached)</span>
              )}
            </QRow>
          </div>
        )}

        {/* DEBT + HEALTH FACTOR */}
        {hasDebt && (
          <div className="space-y-3 border-border border-t pt-3">
            <div className="flex items-baseline justify-between">
              <span className={SECTION_LABEL}>Debt</span>
              <span className="font-medium font-mono text-sm text-warning tabular-nums">
                −${fmtUsd(data.debtValue)}
              </span>
            </div>
            {hasHealthFactor && (
              <HFGauge
                healthFactor={data.healthFactor!}
                liquidationThreshold={DEFAULT_LIQUIDATION_THRESHOLD}
              />
            )}
          </div>
        )}

        {/* INSIGHTS */}
        {data.insights.length > 0 && (
          <div className="space-y-1 border-border border-t pt-3 text-[11px]">
            {data.insights.map((insight) => (
              <div
                className={
                  insight.type === 'warning'
                    ? 'text-warning'
                    : 'text-muted-foreground'
                }
                key={insight.message}
              >
                {insight.type === 'warning' ? '⚠ ' : '→ '}
                {insight.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </CardShell>
  );
}
