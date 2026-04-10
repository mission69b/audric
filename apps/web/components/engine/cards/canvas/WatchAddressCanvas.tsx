'use client';

import { useState, useEffect } from 'react';
import { fmtUsd } from '../primitives';

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

function truncAddr(addr: string): string {
  return addr.length > 16 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

export function WatchAddressCanvas({ data, onAction }: Props) {
  const [balances, setBalances] = useState<{ symbol: string; amount: number; usdValue?: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalUsd, setTotalUsd] = useState(0);

  const address = 'available' in data && data.available ? data.address : null;
  const label = 'label' in data ? data.label : undefined;

  useEffect(() => {
    if (!address) return;
    setBalances([]);
    setTotalUsd(0);
    setLoading(true);
    fetch(`/api/balances?address=${address}`)
      .then((r) => r.json())
      .then((d) => {
        const coins: { symbol: string; amount: number; usdValue?: number }[] = [];
        let usdcTotal = 0;
        for (const [symbol, amount] of Object.entries(d)) {
          if (symbol === 'network' || typeof amount !== 'number' || amount <= 0) continue;
          coins.push({ symbol, amount });
          if (symbol === 'USDC' || symbol === 'USDT') usdcTotal += amount;
        }
        coins.sort((a, b) => (b.usdValue ?? b.amount) - (a.usdValue ?? a.amount));
        setBalances(coins);
        setTotalUsd(usdcTotal);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [address]);

  if (!('available' in data) || !data.available) {
    return (
      <div className="flex flex-col items-center justify-center py-10 space-y-2 text-center">
        <span className="text-3xl">👁</span>
        <p className="text-sm text-foreground font-medium">Watch Address</p>
        <p className="text-xs text-muted max-w-xs leading-relaxed">
          {'message' in data && data.message ? data.message : 'Provide a Sui address to watch.'}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="animate-pulse font-mono text-xs text-dim">Fetching balances...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-wider text-dim uppercase">
            {label ?? 'Watched Address'}
          </span>
          <a
            href={`https://suiscan.xyz/mainnet/account/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] text-dim hover:text-foreground transition"
          >
            {truncAddr(address)}↗
          </a>
        </div>
        <div className="font-mono text-lg text-foreground font-medium">
          ${fmtUsd(totalUsd)}
        </div>
      </div>

      {/* Balances */}
      {balances.length > 0 ? (
        <div className="space-y-1.5">
          {balances.map((coin) => (
            <div key={coin.symbol} className="flex items-center justify-between font-mono text-xs">
              <span className="text-foreground">{coin.symbol}</span>
              <span className="text-dim">
                {coin.amount < 0.01 ? '<0.01' : coin.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                {coin.usdValue != null && (
                  <span className="ml-2 text-foreground">${fmtUsd(coin.usdValue)}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-4">
          <p className="font-mono text-xs text-dim">No token balances found</p>
        </div>
      )}

      {/* Actions */}
      {onAction && (
        <div className="flex gap-2">
          <button
            onClick={() => onAction(`Show me the activity heatmap for ${address}`)}
            className="flex-1 rounded-md border border-border py-1.5 font-mono text-[10px] tracking-wider uppercase text-muted hover:text-foreground hover:border-foreground/30 transition"
          >
            Activity →
          </button>
          <button
            onClick={() => onAction(`Send USDC to ${address}`)}
            className="flex-1 rounded-md bg-foreground py-1.5 font-mono text-[10px] tracking-wider text-background uppercase hover:opacity-90 transition"
          >
            Send →
          </button>
        </div>
      )}
    </div>
  );
}
