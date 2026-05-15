'use client';

import { CardShell } from './primitives';
import { AssetAmountBlock, RouteDiagram } from './shared';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 37 v0.7a Phase 2 Day 12-13 — SwapQuoteCardV2 (TOOL_UX_DESIGN baseline)
//
// Per TOOL_UX_DESIGN_v07a.md (locked 2026-05-15):
//   Pattern: generative-UI
//   componentKey: `SwapQuoteCard`
//   Shared components: AssetAmountBlock (in leg + out leg), RouteDiagram,
//                      fee breakdown rendered inline.
//
// Layout:
//   ┌─────────────────────────────────────────────┐
//   │ Trade SUI → USDC                            │
//   ├─────────────────────────────────────────────┤
//   │ [PAY]      AssetAmountBlock (from leg)      │
//   ├─────────────────────────────────────────────┤
//   │  RouteDiagram (when routeSteps available)   │
//   │  …or "Best route via Cetus + Aftermath"     │
//   ├─────────────────────────────────────────────┤
//   │ [RECEIVE]  AssetAmountBlock (to leg)        │
//   ├─────────────────────────────────────────────┤
//   │ Rate · Impact · Slippage · Fee              │
//   ├─────────────────────────────────────────────┤
//   │ ⓘ Quote valid for ~30 seconds               │
//   └─────────────────────────────────────────────┘
//
// Why parallel to SwapQuoteCard.tsx (not a replacement): same rationale as
// BalanceCardV2 — flag-gated rollout (NEXT_PUBLIC_SWAP_QUOTE_CARD_V2)
// lets the founder review V2 side-by-side before the Day 27-28 cutover.
//
// What V2 ADDS over v1:
//   - AssetAmountBlock for both legs (priced when usdValue is known)
//   - RouteDiagram for multi-hop routes (when routeSteps array is supplied)
//   - Slippage chip (separate from price impact)
//   - Per-leg fee breakdown (when feeBpsByLeg is supplied)
//
// What V2 ACCEPTS but FALLS BACK GRACEFULLY for:
//   - routeSteps?: array → if absent, falls back to the existing
//     single-string `route` field rendered as a one-hop summary line
//   - fromUsdValue / toUsdValue → if absent, AssetAmountBlock renders
//     em-dash for the USD slot
//   - slippage / feeBps → if absent, the chip just doesn't render
//
// The engine `swap_quote` tool today emits SwapQuoteData (single-string
// route, no per-leg USD). V2 reads the existing fields AND the new
// optional fields — engine can start emitting `routeSteps` etc. without
// breaking V2; until then V2 degrades gracefully to the v1-equivalent
// shape rendered with shared primitives.
// ───────────────────────────────────────────────────────────────────────────

export interface SwapQuoteV2RouteStep {
  pool: string;
  fromAsset: string;
  toAsset: string;
  /** Per-leg fee, formatted by the engine (e.g. "0.05%" or "30 bps"). */
  fee: string;
}

export interface SwapQuoteV2Data {
  fromToken: string;
  toToken: string;
  fromAmount: number;
  toAmount: number;
  /** Price impact percentage, e.g. 0.42 for 0.42%. */
  priceImpact: number;
  /** Legacy single-string route, e.g. "Cetus → Aftermath". */
  route?: string;
  /**
   * v0.7a-native multi-hop route. When present, RouteDiagram renders;
   * otherwise V2 falls back to the single-string `route` rendered as a
   * one-line "via Cetus + Aftermath" caption.
   */
  routeSteps?: SwapQuoteV2RouteStep[];
  /**
   * Total route fee in basis points. Used by RouteDiagram's footer
   * summary. Defaults to 10 (0.10% Cetus overlay) when omitted.
   */
  totalFeeBps?: number;
  /** USD value of the from-leg, when available. */
  fromUsdValue?: number | null;
  /** USD value of the to-leg, when available. */
  toUsdValue?: number | null;
  /** Slippage tolerance, e.g. 0.005 for 0.5%. */
  slippage?: number;
}

interface SwapQuoteCardV2Props {
  data: SwapQuoteV2Data;
}

const SECTION_LABEL =
  'text-[9px] font-mono uppercase tracking-[0.14em] text-fg-muted';

function formatPct(v: number, dp = 2): string {
  if (!Number.isFinite(v)) return '—';
  return `${v.toFixed(dp)}%`;
}

function impactColor(impactPct: number): string {
  if (!Number.isFinite(impactPct)) return 'text-fg-primary';
  if (impactPct > 3) return 'text-error-solid';
  if (impactPct > 1) return 'text-warning-solid';
  return 'text-fg-primary';
}

/**
 * [Days 10-16 audit fix / 2026-05-16] Convert the engine's `priceImpact`
 * value into a percentage. The engine emits price impact as a DECIMAL
 * (Cetus' `deviationRatio` semantics) — `0.0042` means 0.42%. The
 * engine's own displayText uses `(priceImpact * 100).toFixed(2)` and
 * SDK fixtures consistently set values like `0.0019` / `0.001`.
 *
 * The `< 1` heuristic protects against any historical payload that
 * already shipped as a raw percentage (treated as already-percentage),
 * matching the same defensive shape used by RatesCardV2's `apyToBps`.
 *
 * Pre-fix V2 read `priceImpact` directly as if it were a percentage,
 * so a real 0.42% trade rendered as "0.00%" and the warning/error
 * colour tiers never fired. The same bug exists in V1 SwapQuoteCard
 * (production) and is flagged in BENEFITS_SPEC for a separate decision.
 */
function priceImpactToPct(rawImpact: unknown): number {
  const v = Number(rawImpact);
  if (!Number.isFinite(v) || v < 0) return 0;
  return v < 1 ? v * 100 : v;
}

export function SwapQuoteCardV2({ data }: SwapQuoteCardV2Props) {
  const rate = data.fromAmount > 0 ? data.toAmount / data.fromAmount : 0;
  // Defensive normalisation — Cetus's `deviationRatio` field has shipped
  // as a string in some upstream payloads; the SDK now coerces but keep
  // the guard so a single bad payload never crashes the chat error
  // boundary (mirrors v1's defense in BalanceCard). Decimal→percentage
  // conversion handled by `priceImpactToPct` above.
  const safeImpact = priceImpactToPct(data.priceImpact);
  const slippagePct =
    typeof data.slippage === 'number' ? data.slippage * 100 : null;
  const totalFeeBps = data.totalFeeBps ?? 10;

  return (
    <CardShell title={`Trade ${data.fromToken} → ${data.toToken}`}>
      <div className="space-y-3">
        {/* PAY (from leg) */}
        <AssetAmountBlock
          asset={data.fromToken}
          amount={data.fromAmount}
          usdValue={data.fromUsdValue ?? null}
          label="Pay"
        />

        {/* ROUTE — diagram when steps available; fallback to single-line caption */}
        {data.routeSteps && data.routeSteps.length > 0 ? (
          <div className="pt-1">
            <RouteDiagram
              steps={data.routeSteps}
              totalFeeBps={totalFeeBps}
            />
          </div>
        ) : data.route ? (
          <div className="text-center text-[11px] font-mono text-fg-muted py-1">
            via {data.route}
          </div>
        ) : null}

        {/* RECEIVE (to leg) */}
        <AssetAmountBlock
          asset={data.toToken}
          amount={data.toAmount}
          usdValue={data.toUsdValue ?? null}
          label="Receive"
        />

        {/* DETAILS — rate / impact / slippage / fee */}
        <div className="pt-2 border-t border-border-subtle space-y-1">
          <div className="flex justify-between items-baseline text-[11px]">
            <span className={SECTION_LABEL}>Rate</span>
            <span className="text-fg-primary font-mono tabular-nums">
              1 {data.fromToken} = {rate.toFixed(4)} {data.toToken}
            </span>
          </div>
          <div className="flex justify-between items-baseline text-[11px]">
            <span className={SECTION_LABEL}>Impact</span>
            <span
              className={`font-mono tabular-nums ${impactColor(safeImpact)}`}
            >
              {formatPct(safeImpact)}
            </span>
          </div>
          {slippagePct != null && (
            <div className="flex justify-between items-baseline text-[11px]">
              <span className={SECTION_LABEL}>Slippage</span>
              <span className="text-fg-primary font-mono tabular-nums">
                {formatPct(slippagePct, 1)}
              </span>
            </div>
          )}
          <div className="flex justify-between items-baseline text-[11px]">
            <span className={SECTION_LABEL}>Fee</span>
            <span className="text-fg-primary font-mono tabular-nums">
              {(totalFeeBps / 100).toFixed(2)}% overlay
            </span>
          </div>
        </div>

        <div className="pt-1 text-[10px] font-mono text-fg-muted text-center">
          ⓘ Quote valid for ~30 seconds
        </div>
      </div>
    </CardShell>
  );
}
