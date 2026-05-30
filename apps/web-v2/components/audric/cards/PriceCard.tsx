"use client";

import { CardShell, fmtAmt } from "./primitives";
import { AssetRow, MetricBlock } from "./shared";

// PriceCard — `token_prices` tool renderer. Handles both the price-array
// shape and the single-token change shape.
// [R6.4 / A4 — 2026-05-30] Rebuilt to the phase2 read-card spec
// (`phase2-read-cards.html` R10): array → AssetRow rows; single-token →
// hero MetricBlock + signed delta pill. Data shapes preserved.

interface TokenPrice {
  coinType?: string;
  symbol: string;
  price: number | null;
}

interface PriceChangeData {
  symbol: string;
  currentPrice: number;
  historicalPrice?: number | null;
  change: number | null;
  period?: string;
}

type PriceData = TokenPrice[] | PriceChangeData;

function isPriceArray(data: PriceData): data is TokenPrice[] {
  return Array.isArray(data);
}

function fmtPrice(n: number): string {
  if (n >= 1000) {
    return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0, minimumFractionDigits: 0 })}`;
  }
  if (n >= 1) {
    return `$${fmtAmt(n, 2)}`;
  }
  if (n >= 0.01) {
    return `$${fmtAmt(n, 4)}`;
  }
  return `$${fmtAmt(n, 6)}`;
}

export function PriceCard({ data }: { data: PriceData }) {
  if (isPriceArray(data)) {
    const valid = data.filter((t) => t.price != null);
    if (valid.length === 0) {
      return null;
    }

    return (
      <CardShell
        badge={
          <span className="font-mono text-[11px] text-muted-foreground">
            {valid.length} tokens
          </span>
        }
        live
        title="Token prices"
      >
        <div>
          {valid.map((t) => (
            <AssetRow
              key={t.symbol}
              symbol={t.symbol}
              value={t.price == null ? "—" : fmtPrice(t.price)}
            />
          ))}
        </div>
      </CardShell>
    );
  }

  if (data.currentPrice === 0 && data.change == null) {
    return null;
  }

  const delta =
    data.change == null
      ? undefined
      : ({
          direction: data.change >= 0 ? "up" : "down",
          value: `${data.change >= 0 ? "+" : ""}${data.change.toFixed(1)}%`,
        } as const);

  return (
    <CardShell live title="Price">
      <MetricBlock
        delta={delta}
        label={`${data.symbol} / USD`}
        sub={data.period ? `over ${data.period}` : undefined}
        value={fmtPrice(data.currentPrice)}
      />
    </CardShell>
  );
}
