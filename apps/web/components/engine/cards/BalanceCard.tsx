'use client';

import { CardShell, fmtUsd } from './primitives';

interface BalanceData {
  available?: number;
  savings?: number;
  debt?: number;
  total?: number;
  holdings?: { symbol: string; balance: number; usdValue: number }[];
}

export function BalanceCard({ data }: { data: BalanceData }) {
  return (
    <CardShell title="Balance">
      <div className="flex gap-4 mb-2 font-mono">
        {data.total != null && (
          <div>
            <span className="text-dim text-[10px] block">Total</span>
            <span className="text-foreground font-medium">${fmtUsd(data.total)}</span>
          </div>
        )}
        {data.available != null && (
          <div>
            <span className="text-dim text-[10px] block">Cash</span>
            <span className="text-foreground">${fmtUsd(data.available)}</span>
          </div>
        )}
        {(data.savings ?? 0) > 0 && (
          <div>
            <span className="text-dim text-[10px] block">Savings</span>
            <span className="text-emerald-400">${fmtUsd(data.savings!)}</span>
          </div>
        )}
        {(data.debt ?? 0) > 0 && (
          <div>
            <span className="text-dim text-[10px] block">Debt</span>
            <span className="text-amber-400">${fmtUsd(data.debt!)}</span>
          </div>
        )}
      </div>
      {data.holdings && data.holdings.filter((h) => h.usdValue >= 0.01).length > 0 && (
        <div className="space-y-0.5 font-mono text-[11px]">
          {data.holdings.filter((h) => h.usdValue >= 0.01).slice(0, 6).map((h) => (
            <div key={h.symbol} className="flex justify-between">
              <span className="text-foreground">{h.symbol}</span>
              <span className="text-dim">
                {h.balance.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                {h.usdValue > 0 ? ` · $${fmtUsd(h.usdValue)}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </CardShell>
  );
}
