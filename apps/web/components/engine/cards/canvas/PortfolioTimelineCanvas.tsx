'use client';

import { useState, useEffect, useMemo } from 'react';
import { fmtUsd } from '../primitives';

interface TimelineData {
  available: true;
  address: string;
}

interface Snapshot {
  date: string;
  netWorthUsd: number;
  walletValueUsd: number;
  savingsValueUsd: number;
  debtValueUsd: number;
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
  { key: 'walletValueUsd' as const, label: 'Wallet', color: 'text-foreground' },
  { key: 'savingsValueUsd' as const, label: 'Savings', color: 'text-success' },
  { key: 'debtValueUsd' as const, label: 'Debt', color: 'text-error' },
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
  const period = PERIODS[periodIdx];

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    fetch(`/api/analytics/portfolio-history?days=${period.days}`, {
      headers: { 'x-sui-address': address },
    })
      .then((r) => r.json())
      .then((d) => setResponse(d))
      .catch(() => setResponse({ snapshots: [], change: { period: `${period.days}d`, absoluteUsd: 0, percentChange: 0 } }))
      .finally(() => setLoading(false));
  }, [address, period.days]);

  const snapshots = response?.snapshots ?? [];
  const change = response?.change;

  const W = 320;
  const H = 80;
  const { lines } = useMemo(() => buildStackedPaths(snapshots, W, H), [snapshots]);

  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

  if (!('available' in data) || !data.available) {
    return (
      <div className="flex flex-col items-center justify-center py-10 space-y-2 text-center">
        <span className="text-3xl">📈</span>
        <p className="text-sm text-foreground font-medium">Portfolio Timeline</p>
        <p className="text-xs text-muted max-w-xs leading-relaxed">
          {'message' in data && data.message ? data.message : 'Portfolio timeline will be available once portfolio snapshot history is collected.'}
        </p>
      </div>
    );
  }

  if (loading && !response) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="animate-pulse font-mono text-xs text-dim">Loading portfolio history...</div>
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 space-y-2 text-center">
        <span className="text-3xl">📈</span>
        <p className="text-sm text-foreground font-medium">No Data Yet</p>
        <p className="text-xs text-muted max-w-xs leading-relaxed">
          Portfolio snapshots are collected daily. Check back tomorrow for your first data point.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Net worth + change */}
      <div className="space-y-0.5">
        <div className="font-mono text-lg text-foreground font-medium">
          ${fmtUsd(latest?.netWorthUsd ?? 0)}
        </div>
        {change && change.absoluteUsd !== 0 && (
          <div className={`font-mono text-xs ${change.absoluteUsd >= 0 ? 'text-success' : 'text-error'}`}>
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
                ? 'bg-foreground text-background'
                : 'border border-border text-muted hover:text-foreground hover:border-foreground/30'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="rounded-lg border border-border bg-background overflow-hidden">
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
            <div className={`w-2 h-0.5 rounded-full ${s.color === 'text-foreground' ? 'bg-foreground' : s.color === 'text-success' ? 'bg-success' : 'bg-error'}`} />
            <span className="text-dim">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Breakdown */}
      {latest && (
        <div className="space-y-1 font-mono text-xs">
          <div className="flex justify-between">
            <span className="text-dim">Wallet</span>
            <span className="text-foreground">${fmtUsd(latest.walletValueUsd)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-dim">Savings</span>
            <span className="text-success">${fmtUsd(latest.savingsValueUsd)}</span>
          </div>
          {latest.debtValueUsd > 0 && (
            <div className="flex justify-between">
              <span className="text-dim">Debt</span>
              <span className="text-error">-${fmtUsd(latest.debtValueUsd)}</span>
            </div>
          )}
          {latest.yieldEarnedUsd > 0 && (
            <div className="flex justify-between pt-0.5 border-t border-border/50">
              <span className="text-dim">Yield earned</span>
              <span className="text-success">+${fmtUsd(latest.yieldEarnedUsd)}</span>
            </div>
          )}
        </div>
      )}

      {/* Action */}
      {onAction && (
        <button
          onClick={() => onAction('Give me a full financial report')}
          className="w-full rounded-md border border-border py-1.5 font-mono text-[10px] tracking-wider uppercase text-muted hover:text-foreground hover:border-foreground/30 transition"
        >
          Full report →
        </button>
      )}
    </div>
  );
}
