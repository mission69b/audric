'use client';

import { CardShell, fmtPct } from './primitives';

interface RateEntry {
  saveApy: number;
  borrowApy: number;
  ltv?: number;
  price?: number;
}

export function RatesCard({ data }: { data: Record<string, RateEntry> }) {
  const entries = Object.entries(data)
    .filter(([, v]) => v && typeof v.saveApy === 'number')
    .sort(([, a], [, b]) => b.saveApy - a.saveApy)
    .slice(0, 8);

  if (!entries.length) return null;

  return (
    <CardShell title="Lending Rates">
      <table className="w-full">
        <thead>
          <tr className="text-fg-muted text-[10px]">
            <th className="text-left font-medium pb-1">Asset</th>
            <th className="text-right font-medium pb-1">Supply</th>
            <th className="text-right font-medium pb-1">Borrow</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {entries.map(([symbol, rate]) => (
            <tr key={symbol} className="border-t border-border-subtle/50">
              <td className="py-1 text-fg-primary font-medium">{symbol}</td>
              <td className="py-1 text-right text-success-solid">{fmtPct(rate.saveApy)}%</td>
              <td className="py-1 text-right text-warning-solid">{fmtPct(rate.borrowApy)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </CardShell>
  );
}
