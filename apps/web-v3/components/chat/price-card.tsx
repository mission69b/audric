"use client";

import { memo } from "react";
import { fmtPct, fmtPrice, fmtUsdCompact, pctColor } from "./finance-format";

/**
 * PriceCard — renders `crypto_market` output (live quote for one coin) as a
 * compact stat card: price + 24h/7d deltas + cap/volume/ATH grid. The model
 * still narrates the numbers in text; this is the scannable visual anchor.
 */

export type CryptoMarketOutput = {
  name?: string;
  symbol?: string;
  priceUsd?: number;
  change24hPct?: number;
  change7dPct?: number;
  marketCapUsd?: number;
  marketCapRank?: number | null;
  volume24hUsd?: number;
  allTimeHighUsd?: number;
  fromAthPct?: number;
  error?: string;
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <span className="text-[12.5px] text-foreground tabular-nums">
        {value}
      </span>
    </div>
  );
}

function PurePriceCard({ output }: { output: CryptoMarketOutput }) {
  if (output.error || typeof output.priceUsd !== "number") {
    return null;
  }
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
        {typeof output.marketCapRank === "number" && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            #{output.marketCapRank}
          </span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-semibold text-[22px] text-foreground tabular-nums tracking-tight">
          {fmtPrice(output.priceUsd)}
        </span>
        <span
          className={`text-[13px] tabular-nums ${pctColor(output.change24hPct)}`}
        >
          {fmtPct(output.change24hPct)} 24h
        </span>
        {typeof output.change7dPct === "number" && (
          <span
            className={`text-[12px] tabular-nums ${pctColor(output.change7dPct)}`}
          >
            {fmtPct(output.change7dPct)} 7d
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 border-border/40 border-t pt-3 sm:grid-cols-4">
        <Stat label="Market cap" value={fmtUsdCompact(output.marketCapUsd)} />
        <Stat label="24h volume" value={fmtUsdCompact(output.volume24hUsd)} />
        <Stat label="ATH" value={fmtPrice(output.allTimeHighUsd)} />
        <Stat
          label="From ATH"
          value={
            typeof output.fromAthPct === "number"
              ? fmtPct(output.fromAthPct)
              : "—"
          }
        />
      </div>
    </div>
  );
}

export const PriceCard = memo(PurePriceCard);
