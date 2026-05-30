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
  const W = 320;
  const H = 80;
  const curvePoints = useMemo(
    () => buildCurvePoints(amount, apy, period.months, W, H),
    [amount, apy, period.months]
  );

  return (
    <CanvasShell
      controls={
        <RangeTabs
          onChange={(v) => setPeriodIdx(PERIODS.findIndex((p) => p.label === v))}
          options={PERIODS.map((p) => p.label)}
          value={period.label}
        />
      }
      eyebrow="Simulator · Yield"
      footer={
        onAction ? (
          <>
            <CanvasFooterMeta>
              {`Projected at ${apy.toFixed(2)}% APY`}
            </CanvasFooterMeta>
            <CanvasButton
              onClick={() =>
                onAction(`Save $${amount.toLocaleString()} USDC into NAVI`)
              }
              variant="primary"
            >
              Save ${amount.toLocaleString()} now →
            </CanvasButton>
          </>
        ) : undefined
      }
      name={`$${fmtUsd(total)}`}
      summary={{ value: `+$${fmtUsd(earned)}`, label: `after ${period.label}` }}
    >
      <div className="flex flex-col gap-4">
        <SimSlider
          label="Amount"
          max={50_000}
          min={100}
          onChange={setAmount}
          rangeLabels={["$100", "$50,000"]}
          readout={`$${amount.toLocaleString()} USDC`}
          step={100}
          value={amount}
        />
        <SimSlider
          label="APY"
          max={20}
          min={0.5}
          onChange={setApy}
          rangeLabels={["0.5%", "20%"]}
          readout={`${apy.toFixed(2)}%`}
          step={0.1}
          value={apy}
        />
      </div>

      <div className="mt-4 rounded-[10px] border border-border bg-muted p-4">
        <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.06em]">
          Growth · {period.label}
        </span>
        <svg
          aria-label="Yield projection curve"
          className="mt-2 h-[110px] w-full"
          preserveAspectRatio="none"
          role="img"
          viewBox={`0 0 ${W} ${H}`}
        >
          <defs>
            <linearGradient id="yp-grad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.15" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon
            className="text-success"
            fill="url(#yp-grad)"
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
          <CanvasMetric
            label={`Earned · ${period.label}`}
            tone="up"
            value={`+$${fmtUsd(earned)}`}
          />
          <CanvasMetric label="Total value" value={`$${fmtUsd(total)}`} />
          <CanvasMetric
            label="Earned · 5Y"
            tone="up"
            value={`+$${fmtUsd(fiveYearEarned)}`}
          />
        </CanvasMetricGrid>
      </div>
    </CanvasShell>
  );
}

function SimSlider({
  label,
  value,
  min,
  max,
  step,
  readout,
  rangeLabels,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  readout: string;
  rangeLabels: [string, string];
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
          {label}
        </span>
        <span className="font-mono text-[13px] text-foreground tabular-nums">
          {readout}
        </span>
      </div>
      <input
        className="h-1.5 w-full cursor-pointer accent-foreground"
        max={max}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
        step={step}
        type="range"
        value={value}
      />
      <div className="flex justify-between font-mono text-[9px] text-muted-foreground">
        <span>{rangeLabels[0]}</span>
        <span>{rangeLabels[1]}</span>
      </div>
    </div>
  );
}
