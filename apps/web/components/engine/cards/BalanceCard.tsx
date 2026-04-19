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
  const cols: { label: string; value: string; color?: string }[] = [];
  if (data.total != null) cols.push({ label: 'Total', value: `$${fmtUsd(data.total)}` });
  if (data.available != null) cols.push({ label: 'Cash', value: `$${fmtUsd(data.available)}` });
  if ((data.savings ?? 0) > 0) cols.push({ label: 'Savings', value: `$${fmtUsd(data.savings!)}`, color: 'text-success-solid' });
  if ((data.debt ?? 0) > 0) cols.push({ label: 'Debt', value: `$${fmtUsd(data.debt!)}`, color: 'text-warning-solid' });

  const hasHoldings = data.holdings && data.holdings.filter((h) => h.usdValue >= 0.01).length > 0;

  return (
    <CardShell title="Balance" noPadding>
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)` }}
      >
        {cols.map((col, i) => (
          <div
            key={col.label}
            className="px-3 py-2"
            style={i < cols.length - 1 ? { borderRight: '0.5px solid var(--border-subtle)' } : undefined}
          >
            <div className="text-[11px] text-fg-muted mb-1">{col.label}</div>
            <div className={`font-mono text-[15px] font-medium ${col.color ?? 'text-fg-primary'}`}>{col.value}</div>
          </div>
        ))}
      </div>
      {hasHoldings && (
        <div className="flex justify-between px-3 py-2 font-mono text-[10px] text-fg-muted" style={{ borderTop: '0.5px solid var(--border-subtle)' }}>
          {data.holdings!.filter((h) => h.usdValue >= 0.01).slice(0, 4).map((h) => (
            <span key={h.symbol}>
              {h.symbol} {h.balance.toLocaleString('en-US', { maximumFractionDigits: 4 })}
              {h.usdValue > 0 ? ` · $${fmtUsd(h.usdValue)}` : ''}
            </span>
          ))}
        </div>
      )}
    </CardShell>
  );
}
