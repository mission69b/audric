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

// ───────────────────────────────────────────────────────────────────────────
// SPEC 37 v0.7a Phase 2 Day 24 — PortfolioCardV2 (TOOL_UX_DESIGN baseline)
//
// Per TOOL_UX_DESIGN_v07a.md (locked 2026-05-15):
//   Pattern: generative-UI (high-value tool 10 of 10)
//   componentKey: `PortfolioCard`
//   Shared components: AssetAmountBlock × N (per-allocation rows),
//                      HFGauge (when borrows present),
//                      APYBlock (savings APY display),
//                      MiniBar (top allocation breakdown — preserved from v1)
//
// Layout (top-to-bottom):
//   ┌──────────────────────────────────────────────┐
//   │ Your Portfolio                  [watched ↗]  │
//   ├──────────────────────────────────────────────┤
//   │           $1,234.56                          │  ← hero
//   │           ↑ 5.2% this week                   │
//   ├──────────────────────────────────────────────┤
//   │ ████████░░░░░░░  (allocation MiniBar)        │
//   ├──────────────────────────────────────────────┤
//   │ WALLET                                       │
//   │   USDC  100.00   $100.00                     │
//   │   SUI   50.0000  $75.00                      │
//   ├──────────────────────────────────────────────┤
//   │ SAVINGS                                      │
//   │   USDC  500.00   $500.00                     │
//   │   POOL APY                       4.62% APY   │
//   │   DAILY YIELD                    $0.06/day   │
//   ├──────────────────────────────────────────────┤
//   │ DEFI            $1,569.00 (partial)          │
//   ├──────────────────────────────────────────────┤
//   │ DEBT            -$200.00                     │
//   │ HEALTH FACTOR   [HFGauge hero]               │
//   ├──────────────────────────────────────────────┤
//   │ Net worth                       $1,234.56    │
//   └──────────────────────────────────────────────┘
//   Insights callout (preserved from v1)
//
// V2 ADDS over v1:
//   - AssetAmountBlock per allocation (instead of one giant comma-list)
//   - APYBlock for savings APY (consistent with rates_info / save_deposit)
//   - HFGauge for the debt section (instead of generic Gauge with manual
//     status badge — HFGauge already encapsulates all liquidation logic)
//   - Tighter section headings
//
// V2 PRESERVES:
//   - Hero total + week trend (TrendIndicator)
//   - MiniBar allocation breakdown (it's still the right primitive)
//   - DeFi row with `partial` / `partial-stale` provenance caveat
//   - Insights callout (engine-driven warnings)
//   - Watched-address badge
//   - Net worth footer
//
// V2 INTENTIONALLY OMITS for now:
//   - Per-pool savings breakdown (engine emits one savingsValue today;
//     when it splits to per-pool, V2 can add multiple AssetAmountBlock
//     rows in the savings section)
//   - HF projection (no projected action in a read-only context)
// ───────────────────────────────────────────────────────────────────────────

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
  'text-[9px] font-mono uppercase tracking-[0.14em] text-fg-muted';

const DUST_USD = 0.01;
const TOP_WALLET_ALLOCATIONS = 5;
const DEFAULT_LIQUIDATION_THRESHOLD = 1.0;

// Engine emits savingsApy in two formats historically: 0.0462 (decimal,
// e.g. 4.62%) OR 4.62 (raw percentage). Treat values <1 as decimal,
// otherwise raw — matches the v1 fmtApy logic.
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

  return (
    <CardShell title={title} badge={badge}>
      <div className="space-y-4">
        {/* HERO — total value + week trend */}
        <div className="text-center">
          <span className="text-2xl font-semibold font-mono text-fg-primary tabular-nums">
            ${fmtUsd(data.totalValue)}
          </span>
          {data.weekChange && data.weekChange.absoluteUsd !== 0 && (
            <div className="mt-0.5">
              <TrendIndicator value={data.weekChange.percentChange} />
              <span className="text-fg-muted text-[10px] ml-1">this week</span>
            </div>
          )}
        </div>

        {/* ALLOCATION BAR — preserved primitive */}
        {segments.length > 0 && <MiniBar segments={segments} />}

        {/* WALLET SECTION */}
        {walletAllocations.length > 0 && (
          <div className="pt-3 border-t border-border-subtle">
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
            <div className="flex justify-between items-baseline mt-2 pt-2 border-t border-border-subtle">
              <span className={SECTION_LABEL}>Wallet total</span>
              <span className="text-fg-primary font-mono text-sm tabular-nums">
                ${fmtUsd(data.walletValue)}
              </span>
            </div>
          </div>
        )}

        {/* SAVINGS SECTION */}
        {data.savingsValue > 0 && (
          <div className="pt-3 border-t border-border-subtle">
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
                <span className="text-fg-primary font-mono text-[11px] tabular-nums">
                  {fmtYield(data.dailyEarning!)}/day
                </span>
              </div>
            )}
          </div>
        )}

        {/* DEFI SECTION — render whenever positive value, regardless of source */}
        {showDefi && (
          <div className="pt-3 border-t border-border-subtle flex justify-between items-baseline">
            <span className={SECTION_LABEL}>DeFi</span>
            <span className="text-fg-primary font-mono text-sm tabular-nums">
              ${fmtUsd(data.defiValue!)}
              {data.defiSource === 'partial' && (
                <span className="text-warning-solid ml-1 text-[10px]">
                  (partial)
                </span>
              )}
              {data.defiSource === 'partial-stale' && (
                <span className="text-warning-solid ml-1 text-[10px]">
                  (cached)
                </span>
              )}
            </span>
          </div>
        )}

        {/* DEBT + HEALTH FACTOR */}
        {hasDebt && (
          <div className="pt-3 border-t border-border-subtle space-y-3">
            <div className="flex justify-between items-baseline">
              <span className={SECTION_LABEL}>Debt</span>
              <span className="text-warning-solid font-mono text-sm tabular-nums">
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
        <div className="pt-3 border-t border-border-subtle flex justify-between items-baseline">
          <span className={SECTION_LABEL}>Net worth</span>
          <span className="text-fg-primary font-mono text-sm font-medium tabular-nums">
            ${fmtUsd(data.totalValue)}
          </span>
        </div>

        {/* INSIGHTS — preserved from v1 */}
        {data.insights.length > 0 && (
          <div className="pt-3 border-t border-border-subtle space-y-1 text-[11px]">
            {data.insights.map((i, idx) => (
              <div
                key={idx}
                className={
                  i.type === 'warning' ? 'text-warning-solid' : 'text-fg-muted'
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
