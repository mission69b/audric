"use client";

import { CardShell, fmtYield, QRow } from "./primitives";
import { MetricBlock } from "./shared";

// YieldEarningsCard — `yield_summary` tool renderer.
// [R6.4 / A4 — 2026-05-30] Rebuilt to the phase2 read-card spec
// (`phase2-read-cards.html` R6): hero MetricBlock (all-time, green) +
// sparkline + a 2-up metric grid (Avg APY / Deposited) + QRow detail
// rows. Data shape preserved from the prior `apps/web` port.

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
  if (data.length < 2) {
    return null;
  }

  const max = Math.max(...data, 0.01);
  const w = 200;
  const h = 40;
  const step = w / (data.length - 1);

  const points = data
    .map((v, i) => `${i * step},${h - (v / max) * h * 0.9}`)
    .join(" ");
  const fillPoints = `0,${h} ${points} ${w},${h}`;

  return (
    <svg
      aria-hidden="true"
      className="mt-1 mb-3 h-10 w-full text-success"
      preserveAspectRatio="none"
      viewBox={`0 0 ${w} ${h}`}
    >
      <polygon
        className="text-success/10"
        fill="currentColor"
        points={fillPoints}
      />
      <polyline
        fill="none"
        points={points}
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function fmtApy(rate: number): string {
  const pct = rate < 1 ? rate * 100 : rate;
  return `${pct.toFixed(2)}%`;
}

export function YieldEarningsCard({ data }: { data: YieldData }) {
  return (
    <CardShell live title="Yield earnings">
      <MetricBlock
        label="All-time earnings"
        sub={<span className="text-success">+{fmtApy(data.currentApy)} APY</span>}
        value={<span className="text-success">{fmtYield(data.allTime)}</span>}
      />

      {data.sparkline && data.sparkline.length > 1 && (
        <Sparkline data={data.sparkline} />
      )}

      <div className="mt-3 grid grid-cols-2 gap-4 border-border border-t pt-3">
        <MetricBlock label="Deposited" size="sm" value={fmtYield(data.deposited)} />
        <MetricBlock
          label="Projected / yr"
          size="sm"
          value={fmtYield(data.projectedYear)}
        />
      </div>

      <div className="mt-3">
        <QRow label="Today">{fmtYield(data.today)}</QRow>
        <QRow label="This week">{fmtYield(data.thisWeek)}</QRow>
        <QRow label="This month">{fmtYield(data.thisMonth)}</QRow>
      </div>
    </CardShell>
  );
}
