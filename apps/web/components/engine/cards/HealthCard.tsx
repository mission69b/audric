'use client';

import { AddressBadge, CardShell, DetailRow, Gauge, StatusBadge, fmtUsd } from './primitives';

interface HealthData {
  /**
   * Numeric HF value. Note: when there is no debt the engine sends
   * `Infinity`, but `JSON.stringify(Infinity) === "null"`, so by the time
   * the value reaches this card it can be `null` / `undefined` / `0`. The
   * card treats any non-finite value as "no-debt" and renders ∞ to avoid
   * the "Critical 0.00" misclassification (an account with zero borrows
   * is maximally safe, not near liquidation).
   */
  healthFactor: number | null | undefined;
  supplied: number;
  borrowed: number;
  maxBorrow?: number;
  liquidationThreshold?: number;
  status?: string;
  /** [v0.49] Stamped by the engine's health_check tool. */
  address?: string;
  /** [v0.49] False for watched-address reads. */
  isSelfQuery?: boolean;
  /**
   * [v1.2 SuiNS] Original SuiNS name when the user passed
   * `address: "alex.sui"`. Surfaced on the watched-address chip.
   */
  suinsName?: string | null;
}

/**
 * Anything below this USD threshold is treated as "no debt" — needed
 * because NAVI accrues sub-cent dust between blocks even after a full
 * repay, and we don't want the card flipping to "warning" because of
 * $0.000018 that the user can't even repay through the standard flow.
 */
const DEBT_DUST_USD = 0.01;

// Exported for unit testing — these are pure functions that should be
// covered without spinning up the React renderer.
export function getHfStatus(
  hf: number | null | undefined,
  borrowed: number,
): 'healthy' | 'warning' | 'danger' | 'critical' {
  // Zero-debt (or dust-only debt) accounts are always healthy regardless
  // of what the HF number says — math gives ∞, JSON gives null, and the
  // adapter sometimes returns 0 as a sentinel for "no debt". Any of those
  // should NOT be rendered as "Critical".
  if (borrowed <= DEBT_DUST_USD) return 'healthy';
  if (hf == null || !Number.isFinite(hf)) return 'healthy';
  if (hf < 1.2) return 'critical';
  if (hf < 1.5) return 'danger';
  if (hf < 2.0) return 'warning';
  return 'healthy';
}

export function formatHf(
  hf: number | null | undefined,
  borrowed: number,
): { display: string; gaugeValue: number } {
  if (borrowed <= DEBT_DUST_USD || hf == null || !Number.isFinite(hf)) {
    // Pin the gauge to the right edge (max value) so the visual matches the
    // ∞ semantics — the user is "off the chart" safe, not at zero.
    return { display: '∞', gaugeValue: 5 };
  }
  return { display: hf.toFixed(2), gaugeValue: hf };
}

// ───────────────────────────────────────────────────────────────────────────
// SPEC 23B HealthSummary — post-write variant (2026-05-12)
//
// `default`    → 2xl HF hero + Gauge + 4-row detail (Supplied / Borrowed /
//                Max Borrow / Liq. Threshold) + "Health Factor" title +
//                StatusBadge. Unchanged. Always-on standalone card the
//                user gets when they ask "what's my health?".
//
// `post-write` → 3-col grid (HF · Supplied · Borrowed) with a status pill
//                in the HF cell. No gauge, no Max Borrow / Liq.
//                Threshold rows, no title bar, tighter padding. Rendered
//                by `<PostWriteRefreshSurface>` below a borrow / repay /
//                harvest receipt to communicate "where your collateral
//                & debt landed" without duplicating the full standalone
//                card 100px below the receipt.
//
// Why drop the gauge in post-write? The gauge eats ~50px of vertical
// space and re-renders the same number that's also in the HF cell.
// Inline below a receipt that already shows the action (borrow / repay)
// + the Suiscan link, the gauge becomes noise. The status pill carries
// the "are you safe?" signal; the columns carry the actual numbers.
//
// Why drop Max Borrow + Liq. Threshold? Both are "what's possible
// next" data points — useful when the user is exploring borrow
// capacity, useless after a write that just changed exactly those
// numbers. The user already saw the action; what they want is "did it
// land where I expected?" — and HF / Supplied / Borrowed answers that.
//
// Mirrors W1 BalanceCard's post-write contract: same grid pattern,
// same `noHeader`, same tighter cell padding (px-2.5 py-1.5), same
// smaller value typography (text-[13px] vs text-[15px]).
// ───────────────────────────────────────────────────────────────────────────

interface HealthCardProps {
  data: HealthData;
  variant?: 'default' | 'post-write';
}

export function HealthCard({ data, variant = 'default' }: HealthCardProps) {
  const status = getHfStatus(data.healthFactor, data.borrowed);
  const { display, gaugeValue } = formatHf(data.healthFactor, data.borrowed);
  const isPostWrite = variant === 'post-write';
  const isWatched = data.isSelfQuery === false && !!data.address;

  if (isPostWrite) {
    // Post-write: 3-col grid mirroring BalanceCard W1. The status pill
    // sits in the HF column header (same row as the "HF" label) so the
    // user reads "HF · Healthy · 4.21" as one coherent unit. Watched-
    // address badge intentionally dropped (writes can't sign on watched
    // addresses; isWatched is always false here in production — same
    // invariant as BalanceCard W1).
    return (
      <CardShell title="Health Factor" noPadding noHeader>
        <div className="grid grid-cols-3">
          <div
            className="px-2.5 py-1.5"
            style={{ borderRight: '0.5px solid var(--border-subtle)' }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-fg-muted text-[10px]">HF</span>
              <StatusBadge status={status} />
            </div>
            <div className="font-mono font-medium text-[13px] text-fg-primary">
              {display}
            </div>
          </div>
          <div
            className="px-2.5 py-1.5"
            style={{ borderRight: '0.5px solid var(--border-subtle)' }}
          >
            <div className="text-fg-muted mb-1 text-[10px]">Supplied</div>
            <div className="font-mono font-medium text-[13px] text-fg-primary">
              ${fmtUsd(data.supplied)}
            </div>
          </div>
          <div className="px-2.5 py-1.5">
            <div className="text-fg-muted mb-1 text-[10px]">Borrowed</div>
            <div
              className={`font-mono font-medium text-[13px] ${
                data.borrowed > DEBT_DUST_USD
                  ? 'text-warning-solid'
                  : 'text-fg-primary'
              }`}
            >
              ${fmtUsd(data.borrowed)}
            </div>
          </div>
        </div>
      </CardShell>
    );
  }

  // CardShell only accepts a single ReactNode for `badge`; on watched
  // reads we surface the chip alongside the status pip so the user can
  // see both at a glance. Self-reads keep the original status-only badge.
  const badge = isWatched ? (
    <span className="inline-flex items-center gap-2">
      <AddressBadge address={data.address!} suinsName={data.suinsName} />
      <StatusBadge status={status} />
    </span>
  ) : (
    <StatusBadge status={status} />
  );

  return (
    <CardShell title="Health Factor" badge={badge}>
      <div className="text-center mb-2">
        <span className="text-2xl font-semibold font-mono text-fg-primary">{display}</span>
      </div>

      <div className="mb-3">
        <Gauge
          value={gaugeValue}
          min={0}
          max={5}
          thresholds={[
            { value: 1.0, label: 'Liq.' },
            { value: gaugeValue, label: `You: ${display}` },
          ]}
        />
      </div>

      <div className="space-y-1 font-mono text-[11px]">
        <DetailRow label="Supplied">${fmtUsd(data.supplied)}</DetailRow>
        <DetailRow label="Borrowed">${fmtUsd(data.borrowed)}</DetailRow>
        {data.maxBorrow != null && (
          <DetailRow label="Max Borrow">${fmtUsd(data.maxBorrow)}</DetailRow>
        )}
        {/* [Days 10-16 audit V1 follow-up / 2026-05-16] The engine emits
            `liquidationThreshold: 0` from its positionFetcher path
            (audric production today, see `health.ts:122`) as a sentinel
            for "unknown" — NOT as a real threshold. Pre-fix V1 rendered
            "Liq. Threshold · 0.00" on every health check. Treat any
            value ≤ 0 as the unknown sentinel and hide the row. */}
        {data.liquidationThreshold != null && data.liquidationThreshold > 0 && (
          <DetailRow label="Liq. Threshold">{data.liquidationThreshold.toFixed(2)}</DetailRow>
        )}
      </div>
    </CardShell>
  );
}
