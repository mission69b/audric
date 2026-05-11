'use client';

import { CardShell, DetailRow, fmtYield } from './primitives';

interface YieldData {
  today: number;
  thisWeek: number;
  thisMonth: number;
  allTime: number;
  currentApy: number;
  deposited: number;
  projectedYear: number;
  sparkline?: number[];
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;

  const max = Math.max(...data, 0.01);
  const w = 200;
  const h = 40;
  const step = w / (data.length - 1);

  const points = data.map((v, i) => `${i * step},${h - (v / max) * h * 0.9}`).join(' ');
  const fillPoints = `0,${h} ${points} ${w},${h}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10 mt-1 mb-2" preserveAspectRatio="none">
      <polygon points={fillPoints} fill="currentColor" className="text-chart-1/10" />
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-chart-1" />
    </svg>
  );
}

function fmtApy(rate: number): string {
  const pct = rate < 1 ? rate * 100 : rate;
  return `${pct.toFixed(2)}%`;
}

export function YieldEarningsCard({ data }: { data: YieldData }) {
  return (
    <CardShell title="Yield Earnings">
      <div className="text-center mb-1">
        <span className="text-2xl font-semibold font-mono text-fg-primary">
          {fmtYield(data.allTime)}
        </span>
        <p className="text-[10px] font-mono uppercase tracking-widest text-fg-muted mt-0.5">
          All-time earnings
        </p>
      </div>

      {data.sparkline && data.sparkline.length > 1 && (
        <Sparkline data={data.sparkline} />
      )}

      <div className="space-y-1 font-mono text-[11px]">
        <DetailRow label="Today">{fmtYield(data.today)}</DetailRow>
        <DetailRow label="This Week">{fmtYield(data.thisWeek)}</DetailRow>
        <DetailRow label="This Month">{fmtYield(data.thisMonth)}</DetailRow>
        <DetailRow label="All Time">{fmtYield(data.allTime)}</DetailRow>
      </div>

      <div className="mt-2 pt-2 border-t border-border-subtle/50 space-y-1 font-mono text-[11px]">
        <DetailRow label="Current APY">{fmtApy(data.currentApy)}</DetailRow>
        {/*
          [SPEC 23B-polish audit, 2026-05-11] Migrated from inline `val < 0.01`
          floor to shared `fmtYield`. Pre-fix the inline branch used a strict
          threshold (`val < 0.01` → "< $0.01") while the sibling rows above
          use `fmtYield` (rounding-based: `fmtUsd === '0.00'` → "< $0.01").
          For values in [0.005, 0.01) the inline branch printed "< $0.01"
          while the same value on Today/Week/Month/AllTime rendered "$0.01" —
          a within-card inconsistency. fmtYield unifies both rows on the
          rounding-based floor and removes the duplicate logic.
        */}
        <DetailRow label="Deposited">{fmtYield(data.deposited)}</DetailRow>
        <DetailRow label="Projected / Year">{fmtYield(data.projectedYear)}</DetailRow>
      </div>
    </CardShell>
  );
}
