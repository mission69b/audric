'use client';

import { AddressBadge, CardShell, fmtUsd } from './primitives';
import { HFGauge } from './shared';

// ───────────────────────────────────────────────────────────────────────────
// HealthCardV2 — `health_check` tool renderer (design-baseline shape).
//
// Ported from `apps/web/components/engine/cards/HealthCardV2.tsx` by
// Phase 5a.3 (renderer migration sweep, 2026-05-19). Verbatim except
// import paths.
//
// V1/V2 absorption note (founder lock 2026-05-19, see S.178): the
// `variant?: 'default' | 'post-write'` prop is accepted for API
// forward-compatibility; the `post-write` branch is deferred to Phase
// 5c when PostWriteRefreshSurface lands. Until then `variant` is a
// no-op.
// ───────────────────────────────────────────────────────────────────────────

const DEBT_DUST_USD = 0.01;

export interface HealthAssetRow {
  symbol: string;
  amount: number;
  valueUsd: number;
}

export interface HealthCardV2Data {
  healthFactor: number | null | undefined;
  supplied: number;
  borrowed: number;
  maxBorrow?: number;
  liquidationThreshold?: number;
  address?: string;
  isSelfQuery?: boolean;
  suinsName?: string | null;
  suppliedAssets?: HealthAssetRow[];
  borrowedAssets?: HealthAssetRow[];
}

interface HealthCardV2Props {
  data: HealthCardV2Data;
  /** Reserved for Phase 5c. No-op today. */
  variant?: 'default' | 'post-write';
}

const SECTION_LABEL =
  'text-[9px] font-mono uppercase tracking-[0.14em] text-fg-muted';

function resolveHFForGauge(
  hf: number | null | undefined,
  borrowed: number,
): number {
  if (borrowed <= DEBT_DUST_USD) return Number.POSITIVE_INFINITY;
  if (hf == null || !Number.isFinite(hf)) return Number.POSITIVE_INFINITY;
  return hf;
}

export function HealthCardV2({ data }: HealthCardV2Props) {
  const hfForGauge = resolveHFForGauge(data.healthFactor, data.borrowed);
  const liqThreshold =
    data.liquidationThreshold != null && data.liquidationThreshold > 0
      ? data.liquidationThreshold
      : null;
  const liqThresholdForGauge = liqThreshold ?? 1.0;
  const isWatched = data.isSelfQuery === false && !!data.address;
  const badge = isWatched ? (
    <AddressBadge address={data.address!} suinsName={data.suinsName} />
  ) : undefined;

  const hasDebt = data.borrowed > DEBT_DUST_USD;
  const hasBorrowingCapacity =
    data.maxBorrow != null &&
    data.maxBorrow > 0 &&
    data.maxBorrow >= data.borrowed;
  const remainingCapacity = hasBorrowingCapacity
    ? Math.max(0, data.maxBorrow! - data.borrowed)
    : null;

  return (
    <CardShell title="Health factor" noHeader>
      <div className="space-y-3">
        {badge && <div className="flex justify-end">{badge}</div>}
        {/* HERO — HFGauge */}
        <HFGauge
          healthFactor={hfForGauge}
          liquidationThreshold={liqThresholdForGauge}
        />

        {/* COLLATERAL / DEBT 2-COL */}
        <div className="grid grid-cols-2 pt-2 border-t border-border-subtle">
          <div className="pr-3">
            <div className={`${SECTION_LABEL} mb-1`}>Collateral</div>
            <div className="text-fg-primary font-mono text-sm tabular-nums">
              ${fmtUsd(data.supplied)}
            </div>
            {data.suppliedAssets && data.suppliedAssets.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {data.suppliedAssets.map((row) => (
                  <div
                    key={`supply-${row.symbol}`}
                    className="font-mono text-[10px] tabular-nums text-fg-muted flex items-baseline justify-between"
                  >
                    <span>{row.symbol}</span>
                    <span>${fmtUsd(row.valueUsd)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="pl-3 border-l border-border-subtle">
            <div className={`${SECTION_LABEL} mb-1`}>Debt</div>
            <div
              className={`font-mono text-sm tabular-nums ${
                hasDebt ? 'text-warning-solid' : 'text-fg-primary'
              }`}
            >
              ${fmtUsd(data.borrowed)}
            </div>
            {data.borrowedAssets && data.borrowedAssets.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {data.borrowedAssets.map((row) => (
                  <div
                    key={`borrow-${row.symbol}`}
                    className="font-mono text-[10px] tabular-nums text-fg-muted flex items-baseline justify-between"
                  >
                    <span>{row.symbol}</span>
                    <span>${fmtUsd(row.valueUsd)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* BORROWING CAPACITY — only when maxBorrow > 0 */}
        {remainingCapacity != null && (
          <div className="pt-2 border-t border-border-subtle flex items-baseline justify-between">
            <span className={SECTION_LABEL}>Borrowing capacity remaining</span>
            <span className="text-fg-primary font-mono text-xs tabular-nums">
              ${fmtUsd(remainingCapacity)}
            </span>
          </div>
        )}

        {/* LIQUIDATION THRESHOLD — only when known + not NAVI default 1.0 */}
        {liqThreshold != null && liqThreshold !== 1.0 && (
          <div className="flex items-baseline justify-between text-[11px]">
            <span className={SECTION_LABEL}>Liquidation threshold</span>
            <span className="text-fg-muted font-mono tabular-nums">
              {liqThreshold.toFixed(2)}
            </span>
          </div>
        )}
      </div>
    </CardShell>
  );
}
