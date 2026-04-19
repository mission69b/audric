'use client';

import { useState, useMemo } from 'react';
import { fmtUsd } from '../primitives';

interface YieldProjectorData {
  available: true;
  initialAmount: number;
  initialApy: number;
}

interface Props {
  data: YieldProjectorData;
  onAction?: (text: string) => void;
}

const PERIODS = [
  { label: '1M', months: 1 },
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '1Y', months: 12 },
  { label: '5Y', months: 60 },
] as const;

function compoundYield(principal: number, apyPct: number, months: number): number {
  const r = apyPct / 100;
  return principal * (Math.pow(1 + r, months / 12) - 1);
}

function buildCurvePoints(
  principal: number,
  apyPct: number,
  months: number,
  width: number,
  height: number,
): string {
  const steps = Math.min(months, 60);
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * months;
    const earned = compoundYield(principal, apyPct, t);
    const x = (i / steps) * width;
    const y = height - (earned / Math.max(compoundYield(principal, apyPct, months), 1)) * height * 0.85;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return points.join(' ');
}

export function YieldProjectorCanvas({ data, onAction }: Props) {
  const [amount, setAmount] = useState(data.initialAmount);
  const [apy, setApy] = useState(data.initialApy);
  const [periodIdx, setPeriodIdx] = useState(3); // default 1Y

  const period = PERIODS[periodIdx];
  const earned = useMemo(() => compoundYield(amount, apy, period.months), [amount, apy, period.months]);
  const total = amount + earned;

  const fiveYearEarned = useMemo(() => compoundYield(amount, apy, 60), [amount, apy]);
  const breakEvenNote = apy > 0 ? 'Yield exceeds cost from day one.' : null;

  const W = 320;
  const H = 80;
  const curvePoints = useMemo(
    () => buildCurvePoints(amount, apy, period.months, W, H),
    [amount, apy, period.months],
  );

  return (
    <div className="space-y-4">
      {/* Amount slider */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="font-mono text-[10px] tracking-wider text-fg-muted uppercase">Amount</label>
          <span className="font-mono text-sm text-fg-primary">${amount.toLocaleString()} USDC</span>
        </div>
        <input
          type="range"
          min={100}
          max={50000}
          step={100}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none bg-border-subtle cursor-pointer accent-foreground"
        />
        <div className="flex justify-between font-mono text-[9px] text-fg-muted">
          <span>$100</span><span>$50,000</span>
        </div>
      </div>

      {/* APY slider */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="font-mono text-[10px] tracking-wider text-fg-muted uppercase">APY</label>
          <span className="font-mono text-sm text-fg-primary">{apy.toFixed(2)}%</span>
        </div>
        <input
          type="range"
          min={0.5}
          max={20}
          step={0.1}
          value={apy}
          onChange={(e) => setApy(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none bg-border-subtle cursor-pointer accent-foreground"
        />
        <div className="flex justify-between font-mono text-[9px] text-fg-muted">
          <span>0.5%</span><span>20%</span>
        </div>
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

      {/* Curve chart */}
      <div className="rounded-lg border border-border-subtle bg-surface-page overflow-hidden">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-20">
          <defs>
            <linearGradient id="yp-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.15" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon
            points={`0,${H} ${curvePoints} ${W},${H}`}
            fill="url(#yp-grad)"
            className="text-fg-primary"
          />
          <polyline
            points={curvePoints}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-fg-primary"
          />
        </svg>
      </div>

      {/* Results */}
      <div className="space-y-1 font-mono text-xs">
        <div className="flex justify-between">
          <span className="text-fg-muted">After {period.label}</span>
          <span className="text-success-solid">+${fmtUsd(earned)} earned</span>
        </div>
        <div className="flex justify-between">
          <span className="text-fg-muted">Total value</span>
          <span className="text-fg-primary">${fmtUsd(total)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-fg-muted">After 5Y (compound)</span>
          <span className="text-fg-primary">+${fmtUsd(fiveYearEarned)}</span>
        </div>
        {breakEvenNote && (
          <p className="text-[10px] text-fg-muted pt-0.5">{breakEvenNote}</p>
        )}
      </div>

      {/* Action */}
      {onAction && (
        <button
          onClick={() => onAction(`Save $${amount.toLocaleString()} USDC into NAVI`)}
          className="w-full rounded-md bg-fg-primary py-2 font-mono text-[10px] tracking-wider text-fg-inverse uppercase hover:opacity-90 transition"
        >
          Save ${amount.toLocaleString()} now →
        </button>
      )}
    </div>
  );
}
