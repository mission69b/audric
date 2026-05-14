'use client';

import { useState, useEffect, useMemo } from 'react';
import { fmtUsd } from '../primitives';
import { authFetch } from '@/lib/auth-fetch';

interface TimelineData {
  available: true;
  address: string;
  /**
   * [Bug — 2026-04-27] When the canvas targets a watched / contact
   * address rather than the signed-in user, snapshot history doesn't
   * exist (PortfolioSnapshot rows are keyed by Audric userId, not
   * arbitrary wallets). The API falls back to a single live data
   * point, which produces a degenerate one-point polyline that
   * renders as an empty chart box. We use `isSelfRender` to swap in
   * a clear "current snapshot only" view in that case instead of
   * silently showing an empty chart. Optional for backwards compat
   * with engines that don't emit it (treated as self-render).
   */
  isSelfRender?: boolean;
}

interface Snapshot {
  date: string;
  netWorthUsd: number;
  walletValueUsd: number;
  savingsValueUsd: number;
  debtValueUsd: number;
  /**
   * Net USD value of all aggregated DeFi positions outside NAVI
   * (Bluefin / Suilend / Cetus / Aftermath / Volo / Walrus). Optional
   * for backwards-compat with engines/APIs that don't emit it (treated
   * as 0). Historical snapshots stored before the SSOT learned about
   * DeFi (Apr 28, 2026) are always 0; the rightmost "live" point
   * carries the real value via the API's overlay. See the
   * `[portfolio-history]` route for the rationale on why we don't
   * back-fill historical rows.
   */
  defiValueUsd?: number;
  yieldEarnedUsd: number;
  healthFactor: number | null;
}

interface TimelineResponse {
  snapshots: Snapshot[];
  change: { period: string; absoluteUsd: number; percentChange: number };
}

interface Props {
  data: TimelineData | { available: false; message?: string };
  onAction?: (text: string) => void;
}

const PERIODS = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '1Y', days: 365 },
] as const;

const SERIES = [
  { key: 'walletValueUsd' as const, label: 'Wallet', color: 'text-fg-primary' },
  { key: 'savingsValueUsd' as const, label: 'Savings', color: 'text-success-solid' },
  { key: 'debtValueUsd' as const, label: 'Debt', color: 'text-error-solid' },
];

function buildStackedPaths(
  snapshots: Snapshot[],
  W: number,
  H: number,
): { lines: { key: string; color: string; points: string }[]; maxVal: number } {
  if (snapshots.length === 0) return { lines: [], maxVal: 0 };

  const maxVal = Math.max(...snapshots.map((s) => s.netWorthUsd + s.debtValueUsd), 1);

  const lines: { key: string; color: string; points: string }[] = SERIES.filter((s) => s.key !== 'debtValueUsd').map((series) => {
    const points = snapshots
      .map((s, i) => {
        const x = (i / Math.max(snapshots.length - 1, 1)) * W;
        const y = H - ((s[series.key] ?? 0) / maxVal) * H * 0.85;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    return { key: series.key, color: series.color, points };
  });

  const debtSeries = SERIES.find((s) => s.key === 'debtValueUsd');
  if (debtSeries && snapshots.some((s) => s.debtValueUsd > 0)) {
    const points = snapshots
      .map((s, i) => {
        const x = (i / Math.max(snapshots.length - 1, 1)) * W;
        const y = H - (s.debtValueUsd / maxVal) * H * 0.85;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    lines.push({ key: 'debtValueUsd', color: debtSeries.color, points });
  }

  return { lines, maxVal };
}

export function PortfolioTimelineCanvas({ data, onAction }: Props) {
  const [response, setResponse] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [periodIdx, setPeriodIdx] = useState(1); // default 30D

  const address = 'available' in data && data.available ? data.address : null;
  // Engines older than this build omit the flag — absence == self-render
  // (legacy behavior). Only the explicit `false` switches us into the
  // watched-address copy.
  const isSelfRender = 'available' in data && data.available ? (data.isSelfRender ?? true) : true;
  const period = PERIODS[periodIdx];

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    authFetch(`/api/analytics/portfolio-history?days=${period.days}&address=${address}`)
      .then((r) => r.json())
      .then((d) => setResponse(d))
      .catch(() => setResponse({ snapshots: [], change: { period: `${period.days}d`, absoluteUsd: 0, percentChange: 0 } }))
      .finally(() => setLoading(false));
  }, [address, period.days]);

  // Wrap in useMemo so the `?? []` fallback doesn't allocate a fresh empty
  // array on every render when `response` is null — that fresh array is the
  // dep of the buildStackedPaths memo below, so without this it re-computed
  // every render in the loading state.
  const snapshots = useMemo(() => response?.snapshots ?? [], [response?.snapshots]);
  const change = response?.change;

  const W = 320;
  const H = 80;
  const { lines } = useMemo(() => buildStackedPaths(snapshots, W, H), [snapshots]);

  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

  if (!('available' in data) || !data.available) {
    return (
      <div className="flex flex-col items-center justify-center py-10 space-y-2 text-center">
        <span className="text-3xl">📈</span>
        <p className="text-sm text-fg-primary font-medium">Portfolio Timeline</p>
        <p className="text-xs text-fg-secondary max-w-xs leading-relaxed">
          {'message' in data && data.message ? data.message : 'Portfolio timeline will be available once portfolio snapshot history is collected.'}
        </p>
      </div>
    );
  }

  if (loading && !response) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="animate-pulse font-mono text-xs text-fg-muted">Loading portfolio history...</div>
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 space-y-2 text-center">
        <span className="text-3xl">📈</span>
        <p className="text-sm text-fg-primary font-medium">No Data Yet</p>
        <p className="text-xs text-fg-secondary max-w-xs leading-relaxed">
          {isSelfRender
            ? 'Portfolio snapshots are collected daily. Check back tomorrow for your first data point.'
            : 'No portfolio history is tracked for this address yet.'}
        </p>
      </div>
    );
  }

  // [Bug — 2026-04-27] One snapshot = degenerate <polyline> with a
  // single point, which browsers render as nothing. Show a clear
  // current-state view instead of a silent empty chart. This is the
  // common path for watched / contact addresses that aren't Audric
  // users (no PortfolioSnapshot rows; the API falls back to a single
  // live data point).
  if (snapshots.length < 2) {
    return (
      <div className="space-y-4">
        <div className="space-y-0.5">
          <div className="font-mono text-lg text-fg-primary font-medium">
            ${fmtUsd(latest?.netWorthUsd ?? 0)}
          </div>
          <div className="font-mono text-[10px] text-fg-muted uppercase tracking-wider">
            Current snapshot
          </div>
        </div>

        <div className="rounded-lg border border-border-subtle bg-surface-page py-6 px-3 text-center">
          <p className="font-mono text-[10px] text-fg-secondary leading-relaxed max-w-xs mx-auto">
            {isSelfRender
              ? "Your first snapshot is in. Check back tomorrow once we've collected a second data point and we'll start drawing the trend."
              : "We don't track historical snapshots for this wallet yet — only Audric users get a daily trendline. Showing the live snapshot only."}
          </p>
        </div>

        {latest && (
          <div className="space-y-1 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-fg-muted">Wallet</span>
              <span className="text-fg-primary">${fmtUsd(latest.walletValueUsd)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-muted">Savings</span>
              <span className="text-success-solid">${fmtUsd(latest.savingsValueUsd)}</span>
            </div>
            {(latest.defiValueUsd ?? 0) > 0 && (
              <div className="flex justify-between">
                <span className="text-fg-muted">DeFi</span>
                <span className="text-fg-primary">${fmtUsd(latest.defiValueUsd ?? 0)}</span>
              </div>
            )}
            {latest.debtValueUsd > 0 && (
              <div className="flex justify-between">
                <span className="text-fg-muted">Debt</span>
                <span className="text-error-solid">-${fmtUsd(latest.debtValueUsd)}</span>
              </div>
            )}
          </div>
        )}

        {onAction && (
          <button
            onClick={() => onAction(isSelfRender ? 'Give me a full financial report' : `Give me a full portfolio overview of ${address}`)}
            className="w-full rounded-md border border-border-subtle py-1.5 font-mono text-[10px] tracking-wider uppercase text-fg-secondary hover:text-fg-primary hover:border-fg-primary/30 transition"
          >
            Full report →
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Net worth + change */}
      <div className="space-y-0.5">
        <div className="font-mono text-lg text-fg-primary font-medium">
          ${fmtUsd(latest?.netWorthUsd ?? 0)}
        </div>
        {change && change.absoluteUsd !== 0 && (
          <div className={`font-mono text-xs ${change.absoluteUsd >= 0 ? 'text-success-solid' : 'text-error-solid'}`}>
            {change.absoluteUsd >= 0 ? '+' : ''}{fmtUsd(change.absoluteUsd)} ({change.percentChange >= 0 ? '+' : ''}{change.percentChange.toFixed(1)}%)
          </div>
        )}
      </div>

      {/* Period tabs */}
      <div className="flex gap-1">
        {PERIODS.map((p, i) => (
          <button
            key={p.label}
            onClick={() => setPeriodIdx(i)}
            className={`flex-1 rounded py-1 font-mono text-[10px] tracking-wider uppercase transition ${
              periodIdx === i
                ? 'bg-fg-primary text-fg-inverse'
                : 'border border-border-subtle text-fg-secondary hover:text-fg-primary hover:border-fg-primary/30'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="rounded-lg border border-border-subtle bg-surface-page overflow-hidden">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-20">
          {lines.map((line) => (
            <polyline
              key={line.key}
              points={line.points}
              fill="none"
              stroke="currentColor"
              strokeWidth={line.key === 'debtValueUsd' ? '1' : '1.5'}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={line.key === 'debtValueUsd' ? '4 2' : undefined}
              className={line.color}
            />
          ))}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex gap-3 font-mono text-[9px]">
        {SERIES.map((s) => (
          <div key={s.key} className="flex items-center gap-1">
            <div className={`w-2 h-0.5 rounded-full ${s.color === 'text-fg-primary' ? 'bg-fg-primary' : s.color === 'text-success-solid' ? 'bg-success-solid' : 'bg-error-solid'}`} />
            <span className="text-fg-muted">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Breakdown */}
      {latest && (
        <div className="space-y-1 font-mono text-xs">
          <div className="flex justify-between">
            <span className="text-fg-muted">Wallet</span>
            <span className="text-fg-primary">${fmtUsd(latest.walletValueUsd)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-muted">Savings</span>
            <span className="text-success-solid">${fmtUsd(latest.savingsValueUsd)}</span>
          </div>
          {(latest.defiValueUsd ?? 0) > 0 && (
            <div className="flex justify-between">
              <span className="text-fg-muted">DeFi</span>
              <span className="text-fg-primary">${fmtUsd(latest.defiValueUsd ?? 0)}</span>
            </div>
          )}
          {latest.debtValueUsd > 0 && (
            <div className="flex justify-between">
              <span className="text-fg-muted">Debt</span>
              <span className="text-error-solid">-${fmtUsd(latest.debtValueUsd)}</span>
            </div>
          )}
          {latest.yieldEarnedUsd > 0 && (
            <div className="flex justify-between pt-0.5 border-t border-border-subtle/50">
              <span className="text-fg-muted">Yield earned</span>
              <span className="text-success-solid">+${fmtUsd(latest.yieldEarnedUsd)}</span>
            </div>
          )}
        </div>
      )}

      {/* Action */}
      {onAction && (
        <button
          onClick={() => onAction('Give me a full financial report')}
          className="w-full rounded-md border border-border-subtle py-1.5 font-mono text-[10px] tracking-wider uppercase text-fg-secondary hover:text-fg-primary hover:border-fg-primary/30 transition"
        >
          Full report →
        </button>
      )}
    </div>
  );
}
