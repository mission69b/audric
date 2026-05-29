"use client";

import { useMemo, useState } from "react";
import { fmtUsd } from "../primitives";

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
  { label: "1M", months: 1 },
  { label: "3M", months: 3 },
  { label: "6M", months: 6 },
  { label: "1Y", months: 12 },
  { label: "5Y", months: 60 },
] as const;

function compoundYield(
  principal: number,
  apyPct: number,
  months: number
): number {
  const r = apyPct / 100;
  return principal * ((1 + r) ** (months / 12) - 1);
}

function buildCurvePoints(
  principal: number,
  apyPct: number,
  months: number,
  width: number,
  height: number
): string {
  const steps = Math.min(months, 60);
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * months;
    const earned = compoundYield(principal, apyPct, t);
    const x = (i / steps) * width;
    const y =
      height -
      (earned / Math.max(compoundYield(principal, apyPct, months), 1)) *
        height *
        0.85;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return points.join(" ");
}

export function YieldProjectorCanvas({ data, onAction }: Props) {
  const [amount, setAmount] = useState(data.initialAmount);
  const [apy, setApy] = useState(data.initialApy);
  const [periodIdx, setPeriodIdx] = useState(3);

  const period = PERIODS[periodIdx];
  const earned = useMemo(
    () => compoundYield(amount, apy, period.months),
    [amount, apy, period.months]
  );
  const total = amount + earned;

  const fiveYearEarned = useMemo(
    () => compoundYield(amount, apy, 60),
    [amount, apy]
  );
  const breakEvenNote = apy > 0 ? "Yield exceeds cost from day one." : null;

  const W = 320;
  const H = 80;
  const curvePoints = useMemo(
    () => buildCurvePoints(amount, apy, period.months, W, H),
    [amount, apy, period.months]
  );

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
            Amount
          </label>
          <span className="font-mono text-foreground text-sm">
            ${amount.toLocaleString()} USDC
          </span>
        </div>
        <input
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border accent-foreground"
          max={50_000}
          min={100}
          onChange={(e) => setAmount(Number(e.target.value))}
          step={100}
          type="range"
          value={amount}
        />
        <div className="flex justify-between font-mono text-[9px] text-muted-foreground">
          <span>$100</span>
          <span>$50,000</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
            APY
          </label>
          <span className="font-mono text-foreground text-sm">
            {apy.toFixed(2)}%
          </span>
        </div>
        <input
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border accent-foreground"
          max={20}
          min={0.5}
          onChange={(e) => setApy(Number(e.target.value))}
          step={0.1}
          type="range"
          value={apy}
        />
        <div className="flex justify-between font-mono text-[9px] text-muted-foreground">
          <span>0.5%</span>
          <span>20%</span>
        </div>
      </div>

      <div className="flex gap-1">
        {PERIODS.map((p, i) => (
          <button
            className={`flex-1 rounded py-1 font-mono text-[10px] uppercase tracking-wider transition ${
              periodIdx === i
                ? "bg-foreground text-background"
                : "border border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
            }`}
            key={p.label}
            onClick={() => setPeriodIdx(i)}
            type="button"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <svg
          aria-label="Yield projection curve"
          className="h-20"
          preserveAspectRatio="none"
          role="img"
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
        >
          <defs>
            <linearGradient id="yp-grad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.15" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon
            className="text-foreground"
            fill="url(#yp-grad)"
            points={`0,${H} ${curvePoints} ${W},${H}`}
          />
          <polyline
            className="text-foreground"
            fill="none"
            points={curvePoints}
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
        </svg>
      </div>

      <div className="space-y-1 font-mono text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">After {period.label}</span>
          <span className="text-success">+${fmtUsd(earned)} earned</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total value</span>
          <span className="text-foreground">${fmtUsd(total)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">After 5Y (compound)</span>
          <span className="text-foreground">+${fmtUsd(fiveYearEarned)}</span>
        </div>
        {breakEvenNote && (
          <p className="pt-0.5 text-[10px] text-muted-foreground">{breakEvenNote}</p>
        )}
      </div>

      {onAction && (
        <button
          className="w-full rounded-md bg-foreground py-2 font-mono text-[10px] text-background uppercase tracking-wider transition hover:opacity-90"
          onClick={() =>
            onAction(`Save $${amount.toLocaleString()} USDC into NAVI`)
          }
          type="button"
        >
          Save ${amount.toLocaleString()} now →
        </button>
      )}
    </div>
  );
}
