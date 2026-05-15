'use client';

import { CardShell, DetailRow, fmtAmt } from './primitives';

interface SwapQuoteData {
  fromToken: string;
  toToken: string;
  fromAmount: number;
  toAmount: number;
  priceImpact: number;
  route?: string;
}

/**
 * [Days 10-16 audit V1 follow-up / 2026-05-16] The engine emits
 * `priceImpact` as a DECIMAL (Cetus' `deviationRatio` semantics) —
 * `0.0042` means 0.42%, NOT `0.42`. Pre-fix V1 read it as if it
 * were already a percentage, so every realistic swap rendered as
 * "0.00% impact" and the warning/error colour tiers (>1%, >3%)
 * never fired. Heuristic mirrors RatesCardV2's `apyToBps`:
 * `< 1` → multiply by 100 (engine canonical decimal),
 * `>= 1` → already-percentage (defensive against any historical
 * raw-percentage payload).
 */
function priceImpactToPct(rawImpact: unknown): number {
  const v = Number(rawImpact);
  if (!Number.isFinite(v) || v < 0) return 0;
  return v < 1 ? v * 100 : v;
}

export function SwapQuoteCard({ data }: { data: SwapQuoteData }) {
  const rate = data.fromAmount > 0 ? data.toAmount / data.fromAmount : 0;
  // Defensive: Cetus's `deviationRatio` is typed as number but occasionally
  // arrives as a string ("0.001234"). The SDK now coerces, but we still
  // normalize here so a single bad payload can never crash the chat (which
  // happens because .toFixed throws on a string and the React error boundary
  // tears down the whole conversation). Decimal→percentage conversion is
  // handled by `priceImpactToPct` above.
  const safeImpact = priceImpactToPct(data.priceImpact);
  const impactColor = safeImpact > 3 ? 'text-error-solid' : safeImpact > 1 ? 'text-warning-solid' : 'text-fg-primary';

  return (
    <CardShell title="Swap Quote">
      <div className="text-center mb-2 font-mono">
        <span className="text-fg-primary font-medium">{fmtAmt(data.fromAmount)} {data.fromToken}</span>
        <span className="text-fg-muted mx-2">→</span>
        <span className="text-fg-primary font-medium">{fmtAmt(data.toAmount, 4)} {data.toToken}</span>
      </div>

      <div className="space-y-1 font-mono text-[11px]">
        <DetailRow label="Rate">1 {data.fromToken} = {rate.toFixed(4)} {data.toToken}</DetailRow>
        <DetailRow label="Impact">
          <span className={impactColor}>{safeImpact.toFixed(2)}%</span>
        </DetailRow>
        {data.route && (
          <DetailRow label="Route">{data.route}</DetailRow>
        )}
        <DetailRow label="Fee">0.1% overlay</DetailRow>
      </div>

      <div className="mt-2 pt-1.5 border-t border-border-subtle/50 text-[10px] font-mono text-fg-muted text-center">
        ⓘ Quote valid for ~30 seconds
      </div>
    </CardShell>
  );
}
