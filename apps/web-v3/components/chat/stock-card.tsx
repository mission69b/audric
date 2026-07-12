"use client";

import { memo } from "react";
import { fmtPct, fmtPrice, fmtUsdCompact, pctColor } from "./finance-format";

/**
 * StockCard — renders `stock_analysis` output as a compact quote card: price +
 * day change, valuation grid, and an analyst-ratings bar. Earnings/news stay
 * in the model's narration (the card is the scannable anchor, not the essay).
 */

export type StockOutput = {
  symbol?: string;
  name?: string;
  exchange?: string;
  priceUsd?: number;
  change24hPct?: number;
  marketCapUsd?: number | null;
  week52High?: number | null;
  week52Low?: number | null;
  peTTM?: number | null;
  epsTTM?: number | null;
  dividendYieldPct?: number | null;
  analystRatings?: {
    strongBuy?: number;
    buy?: number;
    hold?: number;
    sell?: number;
    strongSell?: number;
  } | null;
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

function RatingsBar({
  ratings,
}: {
  ratings: NonNullable<StockOutput["analystRatings"]>;
}) {
  const buy = (ratings.strongBuy ?? 0) + (ratings.buy ?? 0);
  const hold = ratings.hold ?? 0;
  const sell = (ratings.sell ?? 0) + (ratings.strongSell ?? 0);
  const total = buy + hold + sell;
  if (total === 0) {
    return null;
  }
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="mt-3 border-border/40 border-t pt-3">
      <div className="mb-1.5 flex justify-between text-[10px] text-muted-foreground uppercase tracking-wide">
        <span>Analysts</span>
        <span className="tabular-nums">
          {buy} buy · {hold} hold · {sell} sell
        </span>
      </div>
      <div className="flex h-1.5 w-full gap-px overflow-hidden rounded-full">
        <div className="bg-emerald-500/80" style={{ width: pct(buy) }} />
        <div className="bg-muted-foreground/40" style={{ width: pct(hold) }} />
        <div className="bg-red-500/80" style={{ width: pct(sell) }} />
      </div>
    </div>
  );
}

function PureStockCard({ output }: { output: StockOutput }) {
  if (output.error || typeof output.priceUsd !== "number") {
    return null;
  }
  const range =
    typeof output.week52Low === "number" &&
    typeof output.week52High === "number"
      ? `${fmtPrice(output.week52Low)}–${fmtPrice(output.week52High)}`
      : "—";
  return (
    <div className="w-full max-w-xl rounded-2xl border border-border/40 bg-card/40 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="font-semibold text-[15px] text-foreground">
            {output.symbol}
          </span>
          <span className="truncate text-muted-foreground text-xs">
            {output.name}
            {output.exchange ? ` · ${output.exchange}` : ""}
          </span>
        </div>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-semibold text-[22px] text-foreground tabular-nums tracking-tight">
          {fmtPrice(output.priceUsd)}
        </span>
        <span
          className={`text-[13px] tabular-nums ${pctColor(output.change24hPct)}`}
        >
          {fmtPct(output.change24hPct)}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 border-border/40 border-t pt-3 sm:grid-cols-4">
        <Stat label="Market cap" value={fmtUsdCompact(output.marketCapUsd)} />
        <Stat
          label="P/E (TTM)"
          value={
            typeof output.peTTM === "number" ? output.peTTM.toFixed(1) : "—"
          }
        />
        <Stat
          label="EPS (TTM)"
          value={
            typeof output.epsTTM === "number"
              ? `$${output.epsTTM.toFixed(2)}`
              : "—"
          }
        />
        <Stat label="52w range" value={range} />
      </div>
      {output.analystRatings && <RatingsBar ratings={output.analystRatings} />}
    </div>
  );
}

export const StockCard = memo(PureStockCard);
