'use client';

import { useState, useMemo } from 'react';
import { fmtUsd } from '../primitives';

interface DCAData {
  available: true;
  initialMonthly: number;
  initialApy: number;
}

interface Props {
  data: DCAData;
  onAction?: (text: string) => void;
}

const DURATIONS = [
  { label: '1Y', months: 12 },
  { label: '2Y', months: 24 },
  { label: '5Y', months: 60 },
] as const;

function calcSavingsPlan(monthly: number, apyPct: number, months: number) {
  const r = apyPct / 100 / 12; // monthly rate
  if (r === 0) return { total: monthly * months, yield: 0 };
  const fv = monthly * ((Math.pow(1 + r, months) - 1) / r);
  const deposited = monthly * months;
  return { total: fv, yield: fv - deposited };
}

function buildSavingsCurve(monthly: number, apyPct: number, months: number, W: number, H: number): string {
  const steps = Math.min(months, 60);
  const finalTotal = calcSavingsPlan(monthly, apyPct, months).total;
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = Math.round((i / steps) * months);
    const { total } = calcSavingsPlan(monthly, apyPct, t);
    const x = (i / steps) * W;
    const y = H - (total / Math.max(finalTotal, 1)) * H * 0.85;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return points.join(' ');
}

export function DCAPlanner({ data, onAction }: Props) {
  const [monthly, setMonthly] = useState(data.initialMonthly);
  const [durationIdx, setDurationIdx] = useState(0); // default 1Y
  const apy = data.initialApy;

  const duration = DURATIONS[durationIdx];

  const plan1y = useMemo(() => calcSavingsPlan(monthly, apy, 12), [monthly, apy]);
  const plan2y = useMemo(() => calcSavingsPlan(monthly, apy, 24), [monthly, apy]);
  const plan5y = useMemo(() => calcSavingsPlan(monthly, apy, 60), [monthly, apy]);
  const currentPlan = useMemo(() => calcSavingsPlan(monthly, apy, duration.months), [monthly, apy, duration.months]);

  const W = 320;
  const H = 80;
  const curvePoints = useMemo(
    () => buildSavingsCurve(monthly, apy, duration.months, W, H),
    [monthly, apy, duration.months],
  );

  return (
    <div className="space-y-4">
      {/* Monthly amount slider */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="font-mono text-[10px] tracking-wider text-dim uppercase">Monthly deposit</label>
          <span className="font-mono text-sm text-foreground">${monthly.toLocaleString()} USDC</span>
        </div>
        <input
          type="range"
          min={10}
          max={5000}
          step={10}
          value={monthly}
          onChange={(e) => setMonthly(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none bg-border cursor-pointer accent-foreground"
        />
        <div className="flex justify-between font-mono text-[9px] text-dim">
          <span>$10</span><span>$5,000</span>
        </div>
      </div>

      {/* APY display (read-only, from live rate) */}
      <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
        <span className="font-mono text-[10px] tracking-wider text-dim uppercase">Current APY</span>
        <span className="font-mono text-sm text-success">{apy.toFixed(2)}%</span>
      </div>

      {/* Duration tabs */}
      <div className="flex gap-1">
        {DURATIONS.map((d, i) => (
          <button
            key={d.label}
            onClick={() => setDurationIdx(i)}
            className={`flex-1 rounded py-1 font-mono text-[10px] tracking-wider uppercase transition ${
              durationIdx === i
                ? 'bg-foreground text-background'
                : 'border border-border text-muted hover:text-foreground hover:border-foreground/30'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Savings curve */}
      <div className="rounded-lg border border-border bg-background overflow-hidden">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-20">
          <defs>
            <linearGradient id="dca-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.15" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon
            points={`0,${H} ${curvePoints} ${W},${H}`}
            fill="url(#dca-grad)"
            className="text-success"
          />
          <polyline
            points={curvePoints}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-success"
          />
        </svg>
      </div>

      {/* Projections */}
      <div className="space-y-1 font-mono text-xs">
        <div className="flex justify-between">
          <span className="text-dim">After 1 year</span>
          <span className="text-foreground">${fmtUsd(plan1y.total)} <span className="text-success">(+${fmtUsd(plan1y.yield)} yield)</span></span>
        </div>
        <div className="flex justify-between">
          <span className="text-dim">After 2 years</span>
          <span className="text-foreground">${fmtUsd(plan2y.total)} <span className="text-success">(+${fmtUsd(plan2y.yield)} yield)</span></span>
        </div>
        <div className="flex justify-between">
          <span className="text-dim">After 5 years</span>
          <span className="text-foreground">${fmtUsd(plan5y.total)} <span className="text-success">(+${fmtUsd(plan5y.yield)} yield)</span></span>
        </div>
        <div className="flex justify-between pt-0.5 border-t border-border/50">
          <span className="text-dim">Total deposited ({duration.label})</span>
          <span className="text-foreground">${fmtUsd(monthly * duration.months)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dim">Yield earned ({duration.label})</span>
          <span className="text-success">${fmtUsd(currentPlan.yield)}</span>
        </div>
      </div>

      {/* Action */}
      {onAction && (
        <button
          onClick={() => onAction(`Save $${monthly.toLocaleString()} USDC into NAVI`)}
          className="w-full rounded-md bg-foreground py-2 font-mono text-[10px] tracking-wider text-background uppercase hover:opacity-90 transition"
        >
          Start saving ${monthly.toLocaleString()}/mo →
        </button>
      )}
    </div>
  );
}
