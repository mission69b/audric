"use client";

import { useMemo, useState } from "react";
import { fmtUsd } from "../primitives";

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
  { label: "1Y", months: 12 },
  { label: "2Y", months: 24 },
  { label: "5Y", months: 60 },
] as const;

function calcSavingsPlan(monthly: number, apyPct: number, months: number) {
  const r = apyPct / 100 / 12;
  if (r === 0) {
    return { total: monthly * months, yield: 0 };
  }
  const fv = (monthly * ((1 + r) ** months - 1)) / r;
  const deposited = monthly * months;
  return { total: fv, yield: fv - deposited };
}

function buildSavingsCurve(
  monthly: number,
  apyPct: number,
  months: number,
  W: number,
  H: number
): string {
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
  return points.join(" ");
}

export function DCAPlanner({ data, onAction }: Props) {
  const [monthly, setMonthly] = useState(data.initialMonthly);
  const [durationIdx, setDurationIdx] = useState(0);
  const apy = data.initialApy;

  const duration = DURATIONS[durationIdx];

  const plan1y = useMemo(() => calcSavingsPlan(monthly, apy, 12), [monthly, apy]);
  const plan2y = useMemo(() => calcSavingsPlan(monthly, apy, 24), [monthly, apy]);
  const plan5y = useMemo(() => calcSavingsPlan(monthly, apy, 60), [monthly, apy]);
  const currentPlan = useMemo(
    () => calcSavingsPlan(monthly, apy, duration.months),
    [monthly, apy, duration.months]
  );

  const W = 320;
  const H = 80;
  const curvePoints = useMemo(
    () => buildSavingsCurve(monthly, apy, duration.months, W, H),
    [monthly, apy, duration.months]
  );

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="font-mono text-[10px] text-fg-muted uppercase tracking-wider">
            Monthly deposit
          </label>
          <span className="font-mono text-fg-primary text-sm">
            ${monthly.toLocaleString()} USDC
          </span>
        </div>
        <input
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border-subtle accent-foreground"
          max={5000}
          min={10}
          onChange={(e) => setMonthly(Number(e.target.value))}
          step={10}
          type="range"
          value={monthly}
        />
        <div className="flex justify-between font-mono text-[9px] text-fg-muted">
          <span>$10</span>
          <span>$5,000</span>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-md border border-border-subtle bg-surface-page px-3 py-2">
        <span className="font-mono text-[10px] text-fg-muted uppercase tracking-wider">
          Current APY
        </span>
        <span className="font-mono text-sm text-success-solid">
          {apy.toFixed(2)}%
        </span>
      </div>

      <div className="flex gap-1">
        {DURATIONS.map((d, i) => (
          <button
            className={`flex-1 rounded py-1 font-mono text-[10px] uppercase tracking-wider transition ${
              durationIdx === i
                ? "bg-fg-primary text-fg-inverse"
                : "border border-border-subtle text-fg-secondary hover:border-fg-primary/30 hover:text-fg-primary"
            }`}
            key={d.label}
            onClick={() => setDurationIdx(i)}
            type="button"
          >
            {d.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-border-subtle bg-surface-page">
        <svg
          aria-label="Savings projection curve"
          className="h-20"
          preserveAspectRatio="none"
          role="img"
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
        >
          <defs>
            <linearGradient id="dca-grad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.15" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon
            className="text-success-solid"
            fill="url(#dca-grad)"
            points={`0,${H} ${curvePoints} ${W},${H}`}
          />
          <polyline
            className="text-success-solid"
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
          <span className="text-fg-muted">After 1 year</span>
          <span className="text-fg-primary">
            ${fmtUsd(plan1y.total)}{" "}
            <span className="text-success-solid">
              (+${fmtUsd(plan1y.yield)} yield)
            </span>
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-fg-muted">After 2 years</span>
          <span className="text-fg-primary">
            ${fmtUsd(plan2y.total)}{" "}
            <span className="text-success-solid">
              (+${fmtUsd(plan2y.yield)} yield)
            </span>
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-fg-muted">After 5 years</span>
          <span className="text-fg-primary">
            ${fmtUsd(plan5y.total)}{" "}
            <span className="text-success-solid">
              (+${fmtUsd(plan5y.yield)} yield)
            </span>
          </span>
        </div>
        <div className="flex justify-between border-border-subtle/50 border-t pt-0.5">
          <span className="text-fg-muted">
            Total deposited ({duration.label})
          </span>
          <span className="text-fg-primary">
            ${fmtUsd(monthly * duration.months)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-fg-muted">Yield earned ({duration.label})</span>
          <span className="text-success-solid">
            ${fmtUsd(currentPlan.yield)}
          </span>
        </div>
      </div>

      {onAction && (
        <button
          className="w-full rounded-md bg-fg-primary py-2 font-mono text-[10px] text-fg-inverse uppercase tracking-wider transition hover:opacity-90"
          onClick={() =>
            onAction(`Save $${monthly.toLocaleString()} USDC into NAVI`)
          }
          type="button"
        >
          Start saving ${monthly.toLocaleString()}/mo →
        </button>
      )}
    </div>
  );
}
