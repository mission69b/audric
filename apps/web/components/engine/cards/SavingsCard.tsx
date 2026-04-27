'use client';

import { AddressBadge, CardShell, fmtUsd } from './primitives';

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
  /** [v0.49] Stamped by the engine's savings_info tool. */
  address?: string;
  /** [v0.49] False for watched-address reads. */
  isSelfQuery?: boolean;
}

export function SavingsCard({ data }: { data: SavingsData }) {
  const supplies = data.positions?.filter((p) => p.type === 'supply' && p.valueUsd >= 0.01) ?? [];
  const borrows = data.positions?.filter((p) => p.type === 'borrow' && p.valueUsd >= 0.01) ?? [];
  const hasEarnings = data.earnings && data.earnings.supplied > 0;

  if (!supplies.length && !borrows.length && !hasEarnings) return null;

  const isWatched = data.isSelfQuery === false && !!data.address;
  const badge = isWatched ? <AddressBadge address={data.address!} /> : undefined;

  return (
    <CardShell title="Savings Positions" badge={badge}>
      {supplies.length > 0 && (
        <table className="w-full mb-1">
          <thead>
            <tr className="text-fg-muted text-[10px]">
              <th className="text-left font-medium pb-1">Supply</th>
              <th className="text-right font-medium pb-1">Amount</th>
              <th className="text-right font-medium pb-1">APY</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {supplies.map((p, i) => (
              <tr key={i} className="border-t border-border-subtle/50">
                <td className="py-1 text-fg-primary font-medium">{p.symbol}</td>
                <td className="py-1 text-right text-fg-muted">
                  {p.amount.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                  {p.valueUsd > 0 ? ` · $${fmtUsd(p.valueUsd)}` : ''}
                </td>
                <td className="py-1 text-right text-success-solid">{(p.apy * 100).toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!supplies.length && hasEarnings && (
        <div className="text-center py-2 text-fg-muted text-[11px]">
          <span className="font-mono">${fmtUsd(data.earnings!.supplied)}</span> deposited
        </div>
      )}
      {borrows.length > 0 && (
        <table className="w-full">
          <thead>
            <tr className="text-fg-muted text-[10px]">
              <th className="text-left font-medium pb-1">Borrow</th>
              <th className="text-right font-medium pb-1">Amount</th>
              <th className="text-right font-medium pb-1">APY</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {borrows.map((p, i) => (
              <tr key={i} className="border-t border-border-subtle/50">
                <td className="py-1 text-fg-primary font-medium">{p.symbol}</td>
                <td className="py-1 text-right text-fg-muted">${fmtUsd(p.valueUsd)}</td>
                <td className="py-1 text-right text-warning-solid">{(p.apy * 100).toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data.earnings && (
        <div className="flex gap-4 mt-2 pt-2 border-t border-border-subtle font-mono text-[11px]">
          <div>
            <span className="text-fg-muted block text-[10px]">Blended APY</span>
            <span className="text-success-solid">{(data.earnings.currentApy * 100).toFixed(2)}%</span>
          </div>
          <div>
            <span className="text-fg-muted block text-[10px]">Daily</span>
            <span className="text-fg-primary">${data.earnings.dailyEarning.toFixed(4)}</span>
          </div>
        </div>
      )}
    </CardShell>
  );
}
