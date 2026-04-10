'use client';

import { CardShell, fmtUsd } from './primitives';

interface SavingsPosition {
  symbol: string;
  amount: number;
  valueUsd: number;
  apy: number;
  type: 'supply' | 'borrow';
  protocol?: string;
}

interface SavingsData {
  positions?: SavingsPosition[];
  earnings?: { currentApy: number; dailyEarning: number; supplied: number };
}

export function SavingsCard({ data }: { data: SavingsData }) {
  const supplies = data.positions?.filter((p) => p.type === 'supply' && p.valueUsd >= 0.01) ?? [];
  const borrows = data.positions?.filter((p) => p.type === 'borrow' && p.valueUsd >= 0.01) ?? [];

  if (!supplies.length && !borrows.length) return null;

  return (
    <CardShell title="Savings Positions">
      {supplies.length > 0 && (
        <table className="w-full mb-1">
          <thead>
            <tr className="text-dim text-[10px]">
              <th className="text-left font-medium pb-1">Supply</th>
              <th className="text-right font-medium pb-1">Amount</th>
              <th className="text-right font-medium pb-1">APY</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {supplies.map((p, i) => (
              <tr key={i} className="border-t border-border/50">
                <td className="py-1 text-foreground font-medium">{p.symbol}</td>
                <td className="py-1 text-right text-dim">
                  {p.amount.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                  {p.valueUsd > 0 ? ` · $${fmtUsd(p.valueUsd)}` : ''}
                </td>
                <td className="py-1 text-right text-emerald-400">{(p.apy * 100).toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {borrows.length > 0 && (
        <table className="w-full">
          <thead>
            <tr className="text-dim text-[10px]">
              <th className="text-left font-medium pb-1">Borrow</th>
              <th className="text-right font-medium pb-1">Amount</th>
              <th className="text-right font-medium pb-1">APY</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {borrows.map((p, i) => (
              <tr key={i} className="border-t border-border/50">
                <td className="py-1 text-foreground font-medium">{p.symbol}</td>
                <td className="py-1 text-right text-dim">${fmtUsd(p.valueUsd)}</td>
                <td className="py-1 text-right text-amber-400">{(p.apy * 100).toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data.earnings && (
        <div className="flex gap-4 mt-2 pt-2 border-t border-border/50 font-mono text-[11px]">
          <div>
            <span className="text-dim block text-[10px]">Blended APY</span>
            <span className="text-emerald-400">{(data.earnings.currentApy * 100).toFixed(2)}%</span>
          </div>
          <div>
            <span className="text-dim block text-[10px]">Daily</span>
            <span className="text-foreground">${data.earnings.dailyEarning.toFixed(4)}</span>
          </div>
        </div>
      )}
    </CardShell>
  );
}
