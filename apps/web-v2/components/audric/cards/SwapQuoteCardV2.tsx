'use client';

import { CardShell, fmtAmt, QRow } from './primitives';
import { RouteDiagram } from './shared';

// SwapQuoteCardV2 — `swap_quote` tool renderer.
//
// [R6.4 / A3 — 2026-05-30] Rebuilt to the phase2 read-card spec
// (`t2000-AFI/audric/phase2-read-cards.html` R9): a header `via {route}`
// meta, an amount-pill route row (from → to, with a DIRECT / multi-hop
// tag), and a dotted `QRow` detail stack (rate / impact / min received /
// network fee). Read-only quote summary — distinct from the interactive
// swap canvas. Data shape + derivations preserved from the prior port.

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

function formatPct(v: number, dp = 2): string {
  if (!Number.isFinite(v)) return '—';
  return `${v.toFixed(dp)}%`;
}

function impactColor(impactPct: number): string {
  if (!Number.isFinite(impactPct)) return 'text-foreground';
  if (impactPct > 3) return 'text-destructive';
  if (impactPct > 1) return 'text-warning';
  return 'text-success';
}

function priceImpactToPct(rawImpact: unknown): number {
  const v = Number(rawImpact);
  if (!Number.isFinite(v) || v < 0) return 0;
  return v < 1 ? v * 100 : v;
}

function AmountPill({ amount, asset }: { amount: number; asset: string }) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 font-medium font-mono text-[11.5px] text-foreground">
      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent font-semibold text-[8px]">
        {asset.charAt(0).toUpperCase()}
      </span>
      {fmtAmt(amount)} {asset}
    </span>
  );
}

export function SwapQuoteCardV2({ data }: SwapQuoteCardV2Props) {
  const rate = data.fromAmount > 0 ? data.toAmount / data.fromAmount : 0;
  const safeImpact = priceImpactToPct(data.priceImpact);
  const slippagePct =
    typeof data.slippage === 'number' ? data.slippage * 100 : null;
  const totalFeeBps = data.totalFeeBps ?? 10;
  const hasMultiHop = !!data.routeSteps && data.routeSteps.length > 1;
  const viaTag = hasMultiHop
    ? (data.route ?? `${data.routeSteps!.length} hops`).toUpperCase()
    : 'DIRECT';
  const rawMinReceived =
    slippagePct != null ? data.toAmount * (1 - slippagePct / 100) : null;
  // "Min received" is the GUARANTEED floor — never round it up (the
  // financial-amounts rule). Floor at the precision `fmtAmt` renders
  // (6dp under 1, 2dp at/above 1) so the formatter can't nudge it above
  // the true minimum.
  const minReceived =
    rawMinReceived == null
      ? null
      : rawMinReceived < 1
        ? Math.floor(rawMinReceived * 1e6) / 1e6
        : Math.floor(rawMinReceived * 100) / 100;

  return (
    <CardShell
      title="Swap quote"
      badge={
        <span className="font-mono text-[11px] text-muted-foreground tracking-[0.02em]">
          via {data.route ?? 'Cetus'}
        </span>
      }
    >
      <div className="space-y-3.5">
        {/* ROUTE — amount pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <AmountPill amount={data.fromAmount} asset={data.fromToken} />
          <span className="font-mono text-muted-foreground">→</span>
          <AmountPill amount={data.toAmount} asset={data.toToken} />
          <span className="ml-auto rounded-[3px] border border-[var(--border-strong)] px-1.5 py-0.5 font-mono text-[9.5px] text-muted-foreground uppercase tracking-[0.08em]">
            {viaTag}
          </span>
        </div>

        {/* MULTI-HOP DETAIL — only when the route has > 1 leg */}
        {hasMultiHop && (
          <RouteDiagram steps={data.routeSteps!} totalFeeBps={totalFeeBps} />
        )}

        {/* DETAILS */}
        <div>
          <QRow label="Rate">
            1 {data.fromToken} = {rate.toFixed(4)} {data.toToken}
          </QRow>
          <div className="flex items-baseline justify-between border-border border-b border-dotted py-[7px] text-[13px] text-muted-foreground tracking-[-0.011em]">
            <span>Price impact</span>
            <span
              className={`font-medium font-mono tabular-nums ${impactColor(safeImpact)}`}
            >
              {formatPct(safeImpact)}
            </span>
          </div>
          {minReceived != null && (
            <QRow label="Min received">
              {fmtAmt(minReceived)} {data.toToken}
            </QRow>
          )}
          {slippagePct != null && (
            <QRow label="Slippage">{formatPct(slippagePct, 1)}</QRow>
          )}
          <QRow label="Network fee">$0.00 · sponsored</QRow>
          <QRow label="Overlay fee">{(totalFeeBps / 100).toFixed(2)}%</QRow>
        </div>

        <p className="text-center font-mono text-[10px] text-muted-foreground">
          Quote valid for ~30 seconds
        </p>
      </div>
    </CardShell>
  );
}
