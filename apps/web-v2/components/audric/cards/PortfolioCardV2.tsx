'use client';

import {
  AddressBadge,
  CardShell,
  MiniBar,
  TrendIndicator,
  fmtUsd,
  fmtYield,
} from './primitives';
import { AssetAmountBlock, APYBlock, HFGauge } from './shared';

// PortfolioCardV2 — `portfolio_analysis` tool renderer (TOOL_UX_DESIGN
// baseline shape). Ported from
// `apps/web/components/engine/cards/PortfolioCardV2.tsx` by Phase 5a.3
// (renderer migration sweep, 2026-05-19). Verbatim except import paths.

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
  'text-[9px] font-mono uppercase tracking-[0.14em] text-muted-foreground';

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
    data.dailyEarning != null &&
    data.dailyEarning > 0 &&
    data.savingsValue > 0;
  const showDefi = (data.defiValue ?? 0) > 0;
  const hasDebt = data.debtValue > 0;
  const hasHealthFactor =
    hasDebt && data.healthFactor != null && Number.isFinite(data.healthFactor);

  return (
    <CardShell title={title} badge={badge}>
      <div className="space-y-4">
        {/* HERO — total value + week trend */}
        <div className="text-center">
          <span className="text-2xl font-semibold font-mono text-foreground tabular-nums">
            ${fmtUsd(data.totalValue)}
          </span>
          {data.weekChange && data.weekChange.absoluteUsd !== 0 && (
            <div className="mt-0.5">
              <TrendIndicator value={data.weekChange.percentChange} />
              <span className="text-muted-foreground text-[10px] ml-1">this week</span>
            </div>
          )}
        </div>

        {/* ALLOCATION BAR */}
        {segments.length > 0 && <MiniBar segments={segments} />}

        {/* WALLET SECTION */}
        {walletAllocations.length > 0 && (
          <div className="pt-3 border-t border-border">
            <div className={`${SECTION_LABEL} mb-2`}>Wallet</div>
            <div className="space-y-2">
              {walletAllocations.map((a) => (
                <AssetAmountBlock
                  key={a.symbol}
                  asset={a.symbol}
                  amount={a.amount}
                  usdValue={a.usdValue}
                />
              ))}
            </div>
            <div className="flex justify-between items-baseline mt-2 pt-2 border-t border-border">
              <span className={SECTION_LABEL}>Wallet total</span>
              <span className="text-foreground font-mono text-sm tabular-nums">
                ${fmtUsd(data.walletValue)}
              </span>
            </div>
          </div>
        )}

        {/* SAVINGS SECTION */}
        {data.savingsValue > 0 && (
          <div className="pt-3 border-t border-border">
            <div className={`${SECTION_LABEL} mb-2`}>Savings</div>
            <AssetAmountBlock
              asset="USDC"
              amount={data.savingsValue}
              usdValue={data.savingsValue}
            />
            {showSavingsApy && (
              <div className="flex justify-between items-baseline mt-2">
                <span className={SECTION_LABEL}>Pool APY</span>
                <APYBlock asset="USDC" apyBps={savingsApyBps} />
              </div>
            )}
            {showDailyYield && (
              <div className="flex justify-between items-baseline mt-1">
                <span className={SECTION_LABEL}>Daily yield</span>
                <span className="text-foreground font-mono text-[11px] tabular-nums">
                  {fmtYield(data.dailyEarning!)}/day
                </span>
              </div>
            )}
          </div>
        )}

        {/* DEFI SECTION */}
        {showDefi && (
          <div className="pt-3 border-t border-border flex justify-between items-baseline">
            <span className={SECTION_LABEL}>DeFi</span>
            <span className="text-foreground font-mono text-sm tabular-nums">
              ${fmtUsd(data.defiValue!)}
              {data.defiSource === 'partial' && (
                <span className="text-warning ml-1 text-[10px]">
                  (partial)
                </span>
              )}
              {data.defiSource === 'partial-stale' && (
                <span className="text-warning ml-1 text-[10px]">
                  (cached)
                </span>
              )}
            </span>
          </div>
        )}

        {/* DEBT + HEALTH FACTOR */}
        {hasDebt && (
          <div className="pt-3 border-t border-border space-y-3">
            <div className="flex justify-between items-baseline">
              <span className={SECTION_LABEL}>Debt</span>
              <span className="text-warning font-mono text-sm tabular-nums">
                -${fmtUsd(data.debtValue)}
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

        {/* NET WORTH FOOTER */}
        <div className="pt-3 border-t border-border flex justify-between items-baseline">
          <span className={SECTION_LABEL}>Net worth</span>
          <span className="text-foreground font-mono text-sm font-medium tabular-nums">
            ${fmtUsd(data.totalValue)}
          </span>
        </div>

        {/* INSIGHTS */}
        {data.insights.length > 0 && (
          <div className="pt-3 border-t border-border space-y-1 text-[11px]">
            {data.insights.map((i, idx) => (
              <div
                key={idx}
                className={
                  i.type === 'warning' ? 'text-warning' : 'text-muted-foreground'
                }
              >
                {i.type === 'warning' ? '⚠ ' : '→ '}
                {i.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </CardShell>
  );
}
