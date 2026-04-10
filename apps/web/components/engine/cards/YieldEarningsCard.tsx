'use client';

import { CardShell, DetailRow, fmtUsd } from './primitives';

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
        <span className="text-2xl font-semibold font-mono text-foreground">
          ${fmtUsd(data.allTime)}
        </span>
        <p className="text-[10px] font-mono uppercase tracking-widest text-dim mt-0.5">
          All-time earnings
        </p>
      </div>

      {data.sparkline && data.sparkline.length > 1 && (
        <Sparkline data={data.sparkline} />
      )}

      <div className="space-y-1 font-mono text-[11px]">
        <DetailRow label="Today">${fmtUsd(data.today)}</DetailRow>
        <DetailRow label="This Week">${fmtUsd(data.thisWeek)}</DetailRow>
        <DetailRow label="This Month">${fmtUsd(data.thisMonth)}</DetailRow>
        <DetailRow label="All Time">${fmtUsd(data.allTime)}</DetailRow>
      </div>

      <div className="mt-2 pt-2 border-t border-border/50 space-y-1 font-mono text-[11px]">
        <DetailRow label="Current APY">{fmtApy(data.currentApy)}</DetailRow>
        <DetailRow label="Deposited">${fmtUsd(data.deposited)}</DetailRow>
        <DetailRow label="Projected / Year">${fmtUsd(data.projectedYear)}</DetailRow>
      </div>
    </CardShell>
  );
}
