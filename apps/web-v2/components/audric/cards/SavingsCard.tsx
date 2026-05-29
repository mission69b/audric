'use client';

import { AddressBadge, CardShell, fmtUsd, fmtYield } from './primitives';

// SavingsCard — `savings_info` tool renderer. Ported from
// `apps/web/components/engine/cards/SavingsCard.tsx` by Phase 5a.3
// (renderer migration sweep, 2026-05-19). Verbatim except import paths.

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
  address?: string;
  isSelfQuery?: boolean;
  suinsName?: string | null;
}

export function SavingsCard({ data }: { data: SavingsData }) {
  const supplies =
    data.positions?.filter((p) => p.type === 'supply' && p.valueUsd >= 0.01) ??
    [];
  const borrows =
    data.positions?.filter((p) => p.type === 'borrow' && p.valueUsd >= 0.01) ??
    [];
  const hasEarnings = data.earnings && data.earnings.supplied > 0;

  if (!supplies.length && !borrows.length && !hasEarnings) return null;

  const isWatched = data.isSelfQuery === false && !!data.address;
  const badge = isWatched ? (
    <AddressBadge address={data.address!} suinsName={data.suinsName} />
  ) : undefined;

  return (
    <CardShell title="Savings Positions" badge={badge}>
      {supplies.length > 0 && (
        <table className="w-full mb-1">
          <thead>
            <tr className="text-muted-foreground text-[10px]">
              <th className="text-left font-medium pb-1">Supply</th>
              <th className="text-right font-medium pb-1">Amount</th>
              <th className="text-right font-medium pb-1">APY</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {supplies.map((p, i) => (
              <tr key={i} className="border-t border-border/50">
                <td className="py-1 text-foreground font-medium">{p.symbol}</td>
                <td className="py-1 text-right text-muted-foreground">
                  {p.amount.toLocaleString('en-US', {
                    maximumFractionDigits: 4,
                  })}
                  {p.valueUsd > 0 ? ` · $${fmtUsd(p.valueUsd)}` : ''}
                </td>
                <td className="py-1 text-right text-success">
                  {(p.apy * 100).toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!supplies.length && hasEarnings && (
        <div className="text-center py-2 text-muted-foreground text-[11px]">
          <span className="font-mono">${fmtUsd(data.earnings!.supplied)}</span>{' '}
          deposited
        </div>
      )}
      {borrows.length > 0 && (
        <table className="w-full">
          <thead>
            <tr className="text-muted-foreground text-[10px]">
              <th className="text-left font-medium pb-1">Borrow</th>
              <th className="text-right font-medium pb-1">Amount</th>
              <th className="text-right font-medium pb-1">APY</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {borrows.map((p, i) => (
              <tr key={i} className="border-t border-border/50">
                <td className="py-1 text-foreground font-medium">{p.symbol}</td>
                <td className="py-1 text-right text-muted-foreground">
                  ${fmtUsd(p.valueUsd)}
                </td>
                <td className="py-1 text-right text-warning">
                  {(p.apy * 100).toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data.earnings && (
        <div className="flex gap-4 mt-2 pt-2 border-t border-border font-mono text-[11px]">
          <div>
            <span className="text-muted-foreground block text-[10px]">Blended APY</span>
            <span className="text-success">
              {(data.earnings.currentApy * 100).toFixed(2)}%
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[10px]">Daily</span>
            <span className="text-foreground">
              {fmtYield(data.earnings.dailyEarning)}
            </span>
          </div>
        </div>
      )}
    </CardShell>
  );
}
