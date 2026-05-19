'use client';

import { CardShell } from './primitives';
import { AssetAmountBlock, RouteDiagram } from './shared';

// SwapQuoteCardV2 — `swap_quote` tool renderer (TOOL_UX_DESIGN baseline
// shape). Ported from `apps/web/components/engine/cards/SwapQuoteCardV2.tsx`
// by Phase 5a.4 (renderer migration sweep, 2026-05-19). Verbatim except
// import paths.

export interface SwapQuoteV2RouteStep {
  pool: string;
  fromAsset: string;
  toAsset: string;
  fee: string;
}

export interface SwapQuoteV2Data {
  fromToken: string;
  toToken: string;
  fromAmount: number;
  toAmount: number;
  priceImpact: number;
  route?: string;
  routeSteps?: SwapQuoteV2RouteStep[];
  totalFeeBps?: number;
  fromUsdValue?: number | null;
  toUsdValue?: number | null;
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

function priceImpactToPct(rawImpact: unknown): number {
  const v = Number(rawImpact);
  if (!Number.isFinite(v) || v < 0) return 0;
  return v < 1 ? v * 100 : v;
}

export function SwapQuoteCardV2({ data }: SwapQuoteCardV2Props) {
  const rate = data.fromAmount > 0 ? data.toAmount / data.fromAmount : 0;
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

        {/* ROUTE */}
        {data.routeSteps && data.routeSteps.length > 0 ? (
          <div className="pt-1">
            <RouteDiagram steps={data.routeSteps} totalFeeBps={totalFeeBps} />
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

        {/* DETAILS */}
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
