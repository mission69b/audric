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

export function HealthCard({ data }: { data: HealthData }) {
  const status = getHfStatus(data.healthFactor, data.borrowed);
  const { display, gaugeValue } = formatHf(data.healthFactor, data.borrowed);
  const isWatched = data.isSelfQuery === false && !!data.address;

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
        {data.liquidationThreshold != null && (
          <DetailRow label="Liq. Threshold">{data.liquidationThreshold.toFixed(2)}</DetailRow>
        )}
      </div>
    </CardShell>
  );
}
