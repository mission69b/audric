"use client";

import dynamic from "next/dynamic";
import { memo } from "react";
import { fmtPct, fmtPrice, pctColor } from "./finance-format";
import type { PricePoint } from "./price-chart-inner";

/**
 * PriceChart — renders `crypto_history` output (daily OHLCV series) as a
 * Perplexity-style price chart card. recharts loads on demand (next/dynamic):
 * chats that never chart pay zero bundle cost.
 */

const ChartInner = dynamic(() => import("./price-chart-inner"), {
  ssr: false,
  loading: () => (
    <div className="h-[176px] w-full animate-pulse rounded-lg bg-muted/40" />
  ),
});

export type PriceHistoryOutput = {
  name?: string;
  symbol?: string;
  days?: number;
  series?: {
    date?: string;
    close?: number;
  }[];
  summary?: {
    startUsd?: number;
    endUsd?: number;
    highUsd?: number;
    lowUsd?: number;
    changePct?: number;
  };
  error?: string;
};

function PurePriceChart({ output }: { output: PriceHistoryOutput }) {
  if (output.error) {
    return null;
  }
  const data: PricePoint[] = (output.series ?? []).flatMap((p) =>
    p.date && typeof p.close === "number"
      ? [{ date: p.date, close: p.close }]
      : []
  );
  if (data.length < 2) {
    return null;
  }
  const change = output.summary?.changePct;
  const up = typeof change === "number" ? change >= 0 : true;

  return (
    <div className="w-full max-w-xl rounded-2xl border border-border/40 bg-card/40 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-[15px] text-foreground">
            {output.symbol ?? output.name ?? ""}
          </span>
          {output.name && output.symbol && (
            <span className="text-muted-foreground text-xs">{output.name}</span>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground">
          {output.days ? `${output.days}d` : ""}
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-semibold text-[22px] text-foreground tabular-nums tracking-tight">
          {fmtPrice(output.summary?.endUsd)}
        </span>
        <span className={`text-[13px] tabular-nums ${pctColor(change)}`}>
          {fmtPct(change)}
        </span>
      </div>
      <div className="mt-2">
        <ChartInner data={data} up={up} />
      </div>
      <div className="mt-2 flex gap-4 text-[11px] text-muted-foreground tabular-nums">
        <span>H {fmtPrice(output.summary?.highUsd)}</span>
        <span>L {fmtPrice(output.summary?.lowUsd)}</span>
      </div>
    </div>
  );
}

export const PriceChart = memo(PurePriceChart);
