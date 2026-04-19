'use client';

import { CardShell, TrendIndicator, fmtAmt } from './primitives';

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
  if (n >= 1000) return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  if (n >= 1) return `$${fmtAmt(n, 2)}`;
  if (n >= 0.01) return `$${fmtAmt(n, 4)}`;
  return `$${fmtAmt(n, 6)}`;
}

function PriceRow({ symbol, price, change, period }: { symbol: string; price: number | null; change?: number | null; period?: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="font-mono text-fg-primary font-medium">{symbol}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono text-fg-primary">
          {price != null ? fmtPrice(price) : '—'}
        </span>
        {change != null && (
          <span className="min-w-[60px] text-right">
            <TrendIndicator value={change} />
          </span>
        )}
        {change != null && period && (
          <span className="text-fg-muted text-[9px] font-mono">({period})</span>
        )}
      </div>
    </div>
  );
}

export function PriceCard({ data }: { data: PriceData }) {
  if (isPriceArray(data)) {
    const valid = data.filter((t) => t.price != null);
    if (valid.length === 0) return null;

    return (
      <CardShell title="Token Prices" badge={<span className="text-[9px] font-mono text-fg-muted">{valid.length} tokens</span>}>
        <div className="space-y-0.5 text-[11px]">
          {valid.map((t) => (
            <PriceRow key={t.symbol} symbol={t.symbol} price={t.price} />
          ))}
        </div>
      </CardShell>
    );
  }

  if (data.currentPrice === 0 && data.change == null) return null;

  return (
    <CardShell title="Price Change">
      <div className="text-center mb-2">
        <span className="text-2xl font-semibold font-mono text-fg-primary">
          {fmtPrice(data.currentPrice)}
        </span>
        <div className="text-[10px] font-mono text-fg-muted uppercase tracking-wider mt-0.5">
          {data.symbol}
        </div>
      </div>
      {data.change != null && (
        <div className="text-center text-sm">
          <TrendIndicator value={data.change} />
          {data.period && <span className="text-fg-muted text-[10px] font-mono ml-1">({data.period})</span>}
        </div>
      )}
    </CardShell>
  );
}
