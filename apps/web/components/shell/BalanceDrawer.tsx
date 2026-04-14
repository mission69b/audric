'use client';

import type { BalanceHeaderData } from '@/components/dashboard/BalanceHeader';

interface BalanceDrawerProps {
  balance: BalanceHeaderData;
  open: boolean;
  onClose: () => void;
}

function fmtUsd(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function BalanceDrawer({ balance, open, onClose }: BalanceDrawerProps) {
  if (!open) return null;

  const holdingsValue = Math.max(0, balance.total - balance.cash - balance.savings + balance.borrows);

  const rows = [
    { label: 'Wallet (cash)', value: balance.cash, color: 'text-foreground' },
    { label: 'Savings (NAVI)', value: balance.savings, color: 'text-success' },
    ...(holdingsValue > 0.01 ? [{ label: 'Token holdings', value: holdingsValue, color: 'text-foreground' }] : []),
    ...(balance.borrows > 0 ? [{ label: 'Debt', value: -balance.borrows, color: 'text-warning' }] : []),
  ];

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />
      <div className="absolute top-full left-1/2 -translate-x-1/2 z-50 w-72 mt-1 rounded-lg border border-border bg-surface shadow-lg p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-150">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[9px] tracking-[0.1em] uppercase text-muted">Balance Breakdown</p>
          <button onClick={onClose} className="text-dim hover:text-muted text-xs">&times;</button>
        </div>

        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between">
              <span className="text-xs text-muted">{r.label}</span>
              <span className={`font-mono text-sm ${r.color}`}>
                {r.value < 0 ? '-' : ''}${fmtUsd(Math.abs(r.value))}
              </span>
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-2 flex items-center justify-between">
          <span className="text-xs text-muted font-medium">Net Worth</span>
          <span className="font-mono text-sm text-foreground font-medium">
            ${fmtUsd(balance.total)}
          </span>
        </div>

        {balance.savingsRate > 0 && (
          <p className="text-[10px] text-dim">
            Savings earning {(balance.savingsRate * 100).toFixed(1)}% APY
          </p>
        )}
      </div>
    </>
  );
}
