'use client';

import { CardShell } from './primitives';
import { APYBlock } from './shared';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 37 v0.7a Phase 2 Day 23 — RatesCardV2 (TOOL_UX_DESIGN baseline)
//
// Per TOOL_UX_DESIGN_v07a.md (locked 2026-05-15):
//   Pattern: generative-UI
//   componentKey: `RatesCard`
//   Shared components: APYBlock × 2 per asset row (supply + borrow)
//   Audric assembly: Heading "Lending rates", per-asset row with two
//                    APYBlocks (Supply + Borrow), sorted by supply APY desc.
//
// Layout:
//   ┌─────────────────────────────────────────────┐
//   │ Lending rates                               │
//   ├─────────────────────────────────────────────┤
//   │ SUPPLY                BORROW                │
//   │ USDC · 4.62% APY      USDC · 5.20% APY      │
//   │ USDsui · 5.10% APY    USDsui · 6.40% APY    │
//   │ SUI · 3.20% APY       SUI · 4.80% APY       │
//   │ …                                           │
//   └─────────────────────────────────────────────┘
//
// APYBlock already renders the asset label inline (small uppercase
// prefix). RatesCardV2 leans on that — no redundant asset column.
//
// Why parallel to RatesCard.tsx (not a replacement): same flag-gated
// rollout pattern as the prior V2 cards.
//
// V2 ADDS over v1:
//   - APYBlock per cell (consistent rendering across cards — same
//     "X.XX% APY" format Save/Withdraw/Portfolio use)
//   - Slightly larger per-asset row layout for readability
//
// V2 PRESERVES:
//   - Engine-side `applyFilters` ordering (sorted by saveApy desc)
//   - "Render whatever the engine sends" — no hardcoded topN cap
//   - Asset-symbol display from the data key (NAVI ticker style)
//
// Note on input shape: engine emits `saveApy` / `borrowApy` as DECIMALS
// (e.g. `0.0462` for 4.62%) — sourced from `transformRates()` in
// `packages/engine/src/navi/transforms.ts:169` (`toNum(pool.supplyApy) / 100`)
// and consumed by V1 RatesCard via `fmtPct(rate * 100)`.
//
// `apyToBps` defensively handles both formats (decimal AND raw percentage)
// to match `PortfolioCardV2.apyToBps` — when the engine path emits a
// decimal, multiply by 10_000; when an upstream surface emits a raw
// percentage, multiply by 100. The `< 1` heuristic is safe because
// no NAVI pool exceeds 100% APY (the realistic tail is 0–25%).
// ───────────────────────────────────────────────────────────────────────────

interface RateEntry {
  saveApy: number;
  borrowApy: number;
  ltv?: number;
  price?: number;
}

const SECTION_LABEL =
  'text-[9px] font-mono uppercase tracking-[0.14em] text-fg-muted';

function apyToBps(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return rate < 1 ? Math.round(rate * 10_000) : Math.round(rate * 100);
}

export function RatesCardV2({ data }: { data: Record<string, RateEntry> }) {
  const entries = Object.entries(data)
    .filter(([, v]) => v && typeof v.saveApy === 'number')
    .sort(([, a], [, b]) => b.saveApy - a.saveApy);

  if (!entries.length) return null;

  return (
    <CardShell title="Lending rates">
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2 pb-1 border-b border-border-subtle">
          <span className={SECTION_LABEL}>Supply</span>
          <span className={SECTION_LABEL}>Borrow</span>
        </div>
        {entries.map(([symbol, rate]) => (
          <div
            key={symbol}
            className="grid grid-cols-2 gap-2 items-baseline"
          >
            <APYBlock asset={symbol} apyBps={apyToBps(rate.saveApy)} />
            <APYBlock asset={symbol} apyBps={apyToBps(rate.borrowApy)} />
          </div>
        ))}
      </div>
    </CardShell>
  );
}
