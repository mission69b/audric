"use client";

import { APYBlock } from "./shared";
import { CardShell } from "./primitives";

/**
 * RatesCardV2 — renders `rates_info` tool output (NAVI supply + borrow
 * APYs per asset). Canary card for Phase 5a — proves the wire-format
 * pattern (port from legacy → `tool-call.output` shape → Agentic
 * Design System tokens) before the rest of the cards follow.
 *
 * Ported from `apps/web/components/engine/cards/RatesCardV2.tsx` by
 * Phase 5a.2 (renderer migration sweep, 2026-05-19). Verbatim except
 * import paths.
 *
 * Input shape: `{ [asset: string]: { saveApy, borrowApy, ... } }`.
 * Engine emits `saveApy` / `borrowApy` as DECIMALS (e.g. 0.0462 for
 * 4.62%) per `packages/engine/src/navi/transforms.ts`. The `apyToBps`
 * helper defensively handles both decimal and raw-percentage inputs.
 */

interface RateEntry {
  borrowApy: number;
  ltv?: number;
  price?: number;
  saveApy: number;
}

const SECTION_LABEL =
  "font-mono text-[9px] text-fg-muted uppercase tracking-[0.14em]";

function apyToBps(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) {
    return 0;
  }
  return rate < 1 ? Math.round(rate * 10_000) : Math.round(rate * 100);
}

export function RatesCardV2({ data }: { data: Record<string, RateEntry> }) {
  const entries = Object.entries(data)
    .filter(([, v]) => v && typeof v.saveApy === "number")
    .sort(([, a], [, b]) => b.saveApy - a.saveApy);

  if (!entries.length) {
    return null;
  }

  return (
    <CardShell title="Lending rates">
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2 border-border-subtle border-b pb-1">
          <span className={SECTION_LABEL}>Supply</span>
          <span className={SECTION_LABEL}>Borrow</span>
        </div>
        {entries.map(([symbol, rate]) => (
          <div
            className="grid grid-cols-2 items-baseline gap-2"
            key={symbol}
          >
            <APYBlock apyBps={apyToBps(rate.saveApy)} asset={symbol} />
            <APYBlock apyBps={apyToBps(rate.borrowApy)} asset={symbol} />
          </div>
        ))}
      </div>
    </CardShell>
  );
}
