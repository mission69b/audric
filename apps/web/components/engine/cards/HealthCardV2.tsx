'use client';

import { AddressBadge, CardShell, fmtUsd } from './primitives';
import { HFGauge } from './shared';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 37 v0.7a Phase 2 Day 14-15 — HealthCardV2 (TOOL_UX_DESIGN baseline)
//
// Per TOOL_UX_DESIGN_v07a.md (locked 2026-05-15):
//   Pattern: generative-UI
//   componentKey: `HealthFactorCard`
//   Shared components: `HFGauge`, `AssetAmountBlock` (collateral + debt summary)
//   Audric assembly: Heading "Health factor", HFGauge as the hero element
//                    (with liquidation threshold marker at 1.0), 2-column
//                    collateral/debt summary using AssetAmountBlock, footer
//                    chip with "borrowing capacity remaining".
//
// Layout:
//   ┌─────────────────────────────────────────────┐
//   │ Health factor          [watched? badge]     │
//   ├─────────────────────────────────────────────┤
//   │  HFGauge — hero element                     │
//   │   • current HF as gauge fill + label        │
//   │   • liquidation marker pinned at 1.0        │
//   ├─────────────────────────────────────────────┤
//   │ COLLATERAL          DEBT                    │
//   │ $X (supplied)       $Y (borrowed)           │
//   ├─────────────────────────────────────────────┤
//   │ Borrowing capacity remaining · $Z           │ (when maxBorrow > 0)
//   ├─────────────────────────────────────────────┤
//   │ Liquidation threshold · NN%                 │ (optional)
//   └─────────────────────────────────────────────┘
//
// [Day 14b / 2026-05-16] Per-asset breakdown landed. Engine
// `health_check` now emits `suppliedAssets` + `borrowedAssets` (engine
// 1.34.11+). When the arrays are present + non-empty V2 renders
// per-asset rows underneath each aggregate USD total (so the user can
// see "USDsui $9.18 / USDC $13.49" instead of just "$22.67"). When
// absent (degraded transports, SDK fallback, pre-1.34.11 engine), V2
// silently falls back to the aggregate-only layout — the design intent
// is preserved either way.
//
// What V2 INTENTIONALLY does NOT cover (deferred):
//   - post-write variant (PostWriteRefreshSurface keeps consuming v1's
//     3-col grid + status pill in HF cell)
//   - 2xl HF hero-text (V2 reads HF off the gauge label which is more
//     visually integrated than a standalone heading)
//   - StatusBadge (HFGauge's color tier already conveys healthy/warning/
//     critical via the fill color; the standalone pill is redundant)
//
// ∞ semantics: when borrowed <= dust ($0.01) OR healthFactor is null /
// non-finite, V2 passes Infinity to HFGauge which renders the ∞ glyph
// (mirrors v1's behavior). HFGauge's max is 5 so the gauge fills to the
// right edge.
// ───────────────────────────────────────────────────────────────────────────

const DEBT_DUST_USD = 0.01;

/**
 * [Day 14b] Per-asset row matching the engine's `HealthPositionAsset`
 * shape (transforms.ts). Optional on `HealthCardV2Data` so older engines
 * and the SDK fallback path degrade to aggregate-only without crashing.
 */
export interface HealthAssetRow {
  symbol: string;
  amount: number;
  valueUsd: number;
}

export interface HealthCardV2Data {
  /** HF value. null/undefined/non-finite when no debt → renders ∞. */
  healthFactor: number | null | undefined;
  supplied: number;
  borrowed: number;
  maxBorrow?: number;
  liquidationThreshold?: number;
  address?: string;
  isSelfQuery?: boolean;
  suinsName?: string | null;
  /** [Day 14b] Per-asset supply rows. Renders beneath aggregate when present. */
  suppliedAssets?: HealthAssetRow[];
  /** [Day 14b] Per-asset borrow rows. Renders beneath aggregate when present. */
  borrowedAssets?: HealthAssetRow[];
}

interface HealthCardV2Props {
  data: HealthCardV2Data;
}

const SECTION_LABEL =
  'text-[9px] font-mono uppercase tracking-[0.14em] text-fg-muted';

function resolveHFForGauge(
  hf: number | null | undefined,
  borrowed: number,
): number {
  // ∞ semantics: zero-debt (or dust) accounts pass Infinity → HFGauge
  // renders ∞ glyph + max-fill (right edge). Same invariant as v1.
  if (borrowed <= DEBT_DUST_USD) return Number.POSITIVE_INFINITY;
  if (hf == null || !Number.isFinite(hf)) return Number.POSITIVE_INFINITY;
  return hf;
}

export function HealthCardV2({ data }: HealthCardV2Props) {
  const hfForGauge = resolveHFForGauge(data.healthFactor, data.borrowed);
  // [Days 10-16 audit fix / 2026-05-16] The engine emits
  // `liquidationThreshold: 0` from its `positionFetcher` path
  // (audric production today — see `health.ts:122-123`) as a
  // sentinel meaning "unknown" rather than "actually 0". Pre-fix
  // V2 read `data.liquidationThreshold ?? 1.0` (nullish-coalescing
  // keeps 0) and rendered both a confusing "Liquidation threshold ·
  // 0.00" row AND drew the HFGauge marker at HF=0. Treat 0 (and any
  // other ≤0 value) as the unknown sentinel: hide the row, fall back
  // to the NAVI-canonical 1.0 threshold for the gauge marker.
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
    data.maxBorrow != null && data.maxBorrow > 0 && data.maxBorrow >= data.borrowed;
  const remainingCapacity = hasBorrowingCapacity
    ? Math.max(0, data.maxBorrow! - data.borrowed)
    : null;

  return (
    <CardShell title="Health factor" badge={badge}>
      <div className="space-y-3">
        {/* HERO — HFGauge */}
        <HFGauge
          healthFactor={hfForGauge}
          liquidationThreshold={liqThresholdForGauge}
        />

        {/* COLLATERAL / DEBT 2-COL — aggregate USD up top, per-asset
            rows underneath when arrays present (Day 14b). Empty arrays
            ([]) and absent arrays both fall back to aggregate-only. */}
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

        {/* LIQUIDATION THRESHOLD — only when known (engine emits 0 as
            an "unknown" sentinel; we hide the row in that case) AND
            not the NAVI default 1.0 (which would be redundant with the
            HFGauge's liquidation marker). */}
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
