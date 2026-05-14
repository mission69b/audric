'use client';

import { useState, useEffect } from 'react';
import { fmtUsd } from '../primitives';
import { authFetch } from '@/lib/auth-fetch';

interface WatchAddressData {
  available: true;
  address: string;
  label?: string;
  balances?: { symbol: string; amount: number; usdValue?: number }[];
  totalValueUsd?: number;
}

interface Props {
  data: WatchAddressData | { available: false; message?: string };
  onAction?: (text: string) => void;
}

interface CoinRow {
  symbol: string;
  amount: number;
  usdValue: number | null;
}

function truncAddr(addr: string): string {
  return addr.length > 16 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

/**
 * [single-source-of-truth — Apr 2026] Reads from `/api/portfolio` (canonical)
 * instead of the deprecated `/api/balances`. The canonical portfolio
 * gives us the full priced wallet (every held coin + USD value, not
 * just USDC + USDT) plus NAVI savings, so the watched-address total
 * finally matches what the LLM sees in `balance_check` and what the
 * dashboard hero renders for the same address.
 *
 * Pre-fix this canvas summed only USDC + USDT amounts as the "total
 * value" — for any wallet with meaningful SUI / USDsui / NAVI savings
 * the headline number was structurally wrong (often by 10× or more).
 */
export function WatchAddressCanvas({ data, onAction }: Props) {
  const [coins, setCoins] = useState<CoinRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [netWorthUsd, setNetWorthUsd] = useState(0);
  const [walletValueUsd, setWalletValueUsd] = useState(0);
  const [savingsUsd, setSavingsUsd] = useState(0);
  const [debtUsd, setDebtUsd] = useState(0);

  const address = 'available' in data && data.available ? data.address : null;
  const label = 'label' in data ? data.label : undefined;

  useEffect(() => {
    if (!address) return;
    setCoins([]);
    setNetWorthUsd(0);
    setWalletValueUsd(0);
    setSavingsUsd(0);
    setDebtUsd(0);
    setLoading(true);
    authFetch(`/api/portfolio?address=${address}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        const next: CoinRow[] = Array.isArray(d.wallet)
          ? d.wallet
              .map((c: { symbol?: string; balance?: string; decimals?: number; usdValue?: number | null }) => {
                const decimals = c.decimals ?? 0;
                const amount = c.balance ? Number(c.balance) / 10 ** decimals : 0;
                if (!Number.isFinite(amount) || amount <= 0) return null;
                return {
                  symbol: c.symbol ?? '',
                  amount,
                  usdValue: c.usdValue ?? null,
                };
              })
              .filter((row: CoinRow | null): row is CoinRow => !!row && row.symbol.length > 0)
          : [];
        next.sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));
        setCoins(next);
        setNetWorthUsd(typeof d.netWorthUsd === 'number' ? d.netWorthUsd : 0);
        setWalletValueUsd(typeof d.walletValueUsd === 'number' ? d.walletValueUsd : 0);
        setSavingsUsd(typeof d.positions?.savings === 'number' ? d.positions.savings : 0);
        setDebtUsd(typeof d.positions?.borrows === 'number' ? d.positions.borrows : 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [address]);

  if (!('available' in data) || !data.available) {
    return (
      <div className="flex flex-col items-center justify-center py-10 space-y-2 text-center">
        <span className="text-3xl">👁</span>
        <p className="text-sm text-fg-primary font-medium">Watch Address</p>
        <p className="text-xs text-fg-secondary max-w-xs leading-relaxed">
          {'message' in data && data.message ? data.message : 'Provide a Sui address to watch.'}
        </p>
      </div>
    );
  }

  const addr = address ?? '';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="animate-pulse font-mono text-xs text-fg-muted">Fetching balances...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-wider text-fg-muted uppercase">
            {label ?? 'Watched Address'}
          </span>
          <a
            href={`https://suiscan.xyz/mainnet/account/${addr}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] text-fg-muted hover:text-fg-primary transition"
          >
            {truncAddr(addr)}↗
          </a>
        </div>
        <div className="font-mono text-lg text-fg-primary font-medium">
          ${fmtUsd(netWorthUsd)}
        </div>
      </div>

      {/* Wallet / savings / debt summary */}
      <div className="space-y-1 font-mono text-xs">
        <div className="flex justify-between">
          <span className="text-fg-muted">Wallet</span>
          <span className="text-fg-primary">${fmtUsd(walletValueUsd)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-fg-muted">Savings</span>
          <span className="text-success-solid">${fmtUsd(savingsUsd)}</span>
        </div>
        {debtUsd > 0 && (
          <div className="flex justify-between">
            <span className="text-fg-muted">Debt</span>
            <span className="text-error-solid">-${fmtUsd(debtUsd)}</span>
          </div>
        )}
      </div>

      {/* Per-coin breakdown */}
      {coins.length > 0 ? (
        <div className="space-y-1.5 pt-1 border-t border-border-subtle">
          {coins.map((coin) => (
            <div key={coin.symbol} className="flex items-center justify-between font-mono text-xs">
              <span className="text-fg-primary">{coin.symbol}</span>
              <span className="text-fg-muted">
                {coin.amount < 0.01 ? '<0.01' : coin.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                {coin.usdValue != null && (
                  <span className="ml-2 text-fg-primary">${fmtUsd(coin.usdValue)}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-4">
          <p className="font-mono text-xs text-fg-muted">No token balances found</p>
        </div>
      )}

      {/* Actions */}
      {onAction && (
        <div className="flex gap-2">
          <button
            onClick={() => onAction(`Show me the activity heatmap for ${addr}`)}
            className="flex-1 rounded-md border border-border-subtle py-1.5 font-mono text-[10px] tracking-wider uppercase text-fg-secondary hover:text-fg-primary hover:border-fg-primary/30 transition"
          >
            Activity →
          </button>
          <button
            onClick={() => onAction(`Send USDC to ${addr}`)}
            className="flex-1 rounded-md bg-fg-primary py-1.5 font-mono text-[10px] tracking-wider text-fg-inverse uppercase hover:opacity-90 transition"
          >
            Send →
          </button>
        </div>
      )}
    </div>
  );
}
