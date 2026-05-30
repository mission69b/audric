"use client";

import { CardShell } from "./primitives";
import { AssetRow } from "./shared";

/**
 * RatesCardV2 — `rates_info` tool renderer (NAVI supply + borrow APYs).
 *
 * [R6.4 / A4 — 2026-05-30] Rebuilt to the phase2 read-card spec
 * (`t2000-AFI/audric/phase2-read-cards.html` R3): a live eyebrow and a
 * compact AssetRow list — one green supply row + one amber borrow row
 * per asset. Input shape + `apyToBps`/decimal handling preserved from
 * the prior `apps/web` port.
 *
 * Input shape: `{ [asset: string]: { saveApy, borrowApy, ... } }`.
 * Engine emits `saveApy` / `borrowApy` as DECIMALS (e.g. 0.0462).
 */

interface RateEntry {
  borrowApy: number;
  ltv?: number;
  price?: number;
  saveApy: number;
}

function fmtApy(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) {
    return "—";
  }
  const pct = rate < 1 ? rate * 100 : rate;
  return `${pct.toFixed(2)}%`;
}

export function RatesCardV2({ data }: { data: Record<string, RateEntry> }) {
  const entries = Object.entries(data)
    .filter(([, v]) => v && typeof v.saveApy === "number")
    .sort(([, a], [, b]) => b.saveApy - a.saveApy);

  if (!entries.length) {
    return null;
  }

  return (
    <CardShell badge={<span className="font-mono text-[11px] text-muted-foreground">live</span>} live title="Lending rates">
      <div>
        {entries.map(([symbol, rate]) => (
          <AssetRow
            amount="supply"
            key={`${symbol}-supply`}
            symbol={symbol}
            tone="success"
            value={fmtApy(rate.saveApy)}
          />
        ))}
        {entries.map(([symbol, rate]) => (
          <AssetRow
            amount="borrow"
            key={`${symbol}-borrow`}
            symbol={symbol}
            tone="warning"
            value={fmtApy(rate.borrowApy)}
          />
        ))}
      </div>
    </CardShell>
  );
}
