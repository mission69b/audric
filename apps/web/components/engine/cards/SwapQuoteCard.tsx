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

export function SwapQuoteCard({ data }: { data: SwapQuoteData }) {
  const rate = data.fromAmount > 0 ? data.toAmount / data.fromAmount : 0;
  const impactColor = data.priceImpact > 3 ? 'text-status-danger' : data.priceImpact > 1 ? 'text-status-warning' : 'text-foreground';

  return (
    <CardShell title="Swap Quote">
      <div className="text-center mb-2 font-mono">
        <span className="text-foreground font-medium">{fmtAmt(data.fromAmount)} {data.fromToken}</span>
        <span className="text-dim mx-2">→</span>
        <span className="text-foreground font-medium">{fmtAmt(data.toAmount, 4)} {data.toToken}</span>
      </div>

      <div className="space-y-1 font-mono text-[11px]">
        <DetailRow label="Rate">1 {data.fromToken} = {rate.toFixed(4)} {data.toToken}</DetailRow>
        <DetailRow label="Impact">
          <span className={impactColor}>{data.priceImpact.toFixed(2)}%</span>
        </DetailRow>
        {data.route && (
          <DetailRow label="Route">{data.route}</DetailRow>
        )}
        <DetailRow label="Fee">0.1% overlay</DetailRow>
      </div>

      <div className="mt-2 pt-1.5 border-t border-border/50 text-[10px] font-mono text-dim text-center">
        ⓘ Quote valid for ~30 seconds
      </div>
    </CardShell>
  );
}
