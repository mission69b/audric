"use client";

import { useMemo, useState } from "react";
import { fmtUsd } from "../primitives";
import {
  CanvasButton,
  CanvasFooterMeta,
  CanvasMetric,
  CanvasMetricGrid,
  CanvasShell,
  RangeTabs,
} from "./canvas-shell";

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
    <CanvasShell
      controls={
        <RangeTabs
          onChange={(v) =>
            setDurationIdx(DURATIONS.findIndex((d) => d.label === v))
          }
          options={DURATIONS.map((d) => d.label)}
          value={duration.label}
        />
      }
      eyebrow="Planner · DCA"
      footer={
        onAction ? (
          <>
            <CanvasFooterMeta>
              ${fmtUsd(monthly * duration.months)} deposited over{" "}
              {duration.label} at {apy.toFixed(2)}% APY
            </CanvasFooterMeta>
            <CanvasButton
              onClick={() =>
                onAction(`Save $${monthly.toLocaleString()} USDC into NAVI`)
              }
              variant="primary"
            >
              Start ${monthly.toLocaleString()}/mo →
            </CanvasButton>
          </>
        ) : undefined
      }
      name={`$${fmtUsd(currentPlan.total)}`}
      summary={{
        value: `+$${fmtUsd(currentPlan.yield)}`,
        label: `yield · ${duration.label}`,
      }}
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
            Monthly deposit
          </span>
          <span className="font-mono text-[13px] text-foreground tabular-nums">
            ${monthly.toLocaleString()} USDC
          </span>
        </div>
        <input
          className="h-1.5 w-full cursor-pointer accent-foreground"
          max={5000}
          min={10}
          onChange={(e) => setMonthly(Number(e.target.value))}
          step={10}
          type="range"
          value={monthly}
        />
        <div className="flex justify-between font-mono text-[9px] text-muted-foreground">
          <span>$10</span>
          <span>$5,000</span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-muted px-3.5 py-2.5">
        <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
          Current APY
        </span>
        <span className="font-mono text-[14px] text-success tabular-nums">
          {apy.toFixed(2)}%
        </span>
      </div>

      <div className="mt-4 rounded-[10px] border border-border bg-muted p-4">
        <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.06em]">
          Balance · {duration.label}
        </span>
        <svg
          aria-label="Savings projection curve"
          className="mt-2 h-[110px] w-full"
          preserveAspectRatio="none"
          role="img"
          viewBox={`0 0 ${W} ${H}`}
        >
          <defs>
            <linearGradient id="dca-grad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.15" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon
            className="text-success"
            fill="url(#dca-grad)"
            points={`0,${H} ${curvePoints} ${W},${H}`}
          />
          <polyline
            className="text-success"
            fill="none"
            points={curvePoints}
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
        </svg>
      </div>

      <div className="mt-5">
        <CanvasMetricGrid cols={3}>
          <CanvasMetric label="After 1Y" value={`$${fmtUsd(plan1y.total)}`} />
          <CanvasMetric label="After 2Y" value={`$${fmtUsd(plan2y.total)}`} />
          <CanvasMetric label="After 5Y" value={`$${fmtUsd(plan5y.total)}`} />
        </CanvasMetricGrid>
      </div>
    </CanvasShell>
  );
}
