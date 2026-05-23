"use client";

import { useMemo } from "react";
import { usePortfolio } from "@/hooks/use-portfolio";
import { fmtUsd } from "../primitives";

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
 * Reads from canonical `/api/portfolio?address=...` via the `usePortfolio`
 * SWR hook (S.282 / PIPELINE-AUDIT-PHASE-2 S3 — 2026-05-23). The hook is
 * keyed on `portfolio:${address}` so this canvas shares its cache entry
 * with `BalanceHero` and `FullPortfolioCanvas` — opening this canvas for
 * an address you've already seen renders instantly from cache instead of
 * spinning for ~600ms while BV is re-hit.
 */
export function WatchAddressCanvas({ data, onAction }: Props) {
  const address =
    data && typeof data === "object" && "available" in data && data.available
      ? data.address
      : null;
  const label =
    data && typeof data === "object" && "label" in data ? data.label : undefined;

  const { data: portfolio, isLoading } = usePortfolio(address);

  const coins = useMemo<CoinRow[]>(() => {
    if (!portfolio || !Array.isArray(portfolio.wallet)) {
      return [];
    }
    const next: CoinRow[] = portfolio.wallet
      .map((c) => {
        const decimals = c.decimals ?? 0;
        const amount = c.balance ? Number(c.balance) / 10 ** decimals : 0;
        if (!Number.isFinite(amount) || amount <= 0) {
          return null;
        }
        return {
          symbol: c.symbol ?? "",
          amount,
          usdValue: c.usdValue ?? null,
        };
      })
      .filter((row): row is CoinRow => !!row && row.symbol.length > 0);
    next.sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));
    return next;
  }, [portfolio]);

  const netWorthUsd = portfolio?.netWorthUsd ?? 0;
  const walletValueUsd = portfolio?.walletValueUsd ?? 0;
  const savingsUsd = portfolio?.positions.savings ?? 0;
  const debtUsd = portfolio?.positions.borrows ?? 0;

  if (
    !data ||
    typeof data !== "object" ||
    !("available" in data) ||
    !data.available
  ) {
    return (
      <div className="flex flex-col items-center justify-center space-y-2 py-10 text-center">
        <span className="text-3xl">👁</span>
        <p className="font-medium text-fg-primary text-sm">Watch Address</p>
        <p className="max-w-xs text-fg-secondary text-xs leading-relaxed">
          {data &&
          typeof data === "object" &&
          "message" in data &&
          data.message
            ? data.message
            : "Provide a Sui address to watch."}
        </p>
      </div>
    );
  }

  const addr = address ?? "";

  if (isLoading && !portfolio) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="animate-pulse font-mono text-fg-muted text-xs">
          Fetching balances...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] text-fg-muted uppercase tracking-wider">
            {label ?? "Watched Address"}
          </span>
          <a
            className="font-mono text-[10px] text-fg-muted transition hover:text-fg-primary"
            href={`https://suiscan.xyz/mainnet/account/${addr}`}
            rel="noopener noreferrer"
            target="_blank"
          >
            {truncAddr(addr)}↗
          </a>
        </div>
        <div className="font-medium font-mono text-fg-primary text-lg">
          ${fmtUsd(netWorthUsd)}
        </div>
      </div>

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

      {coins.length > 0 ? (
        <div className="space-y-1.5 border-border-subtle border-t pt-1">
          {coins.map((coin) => (
            <div
              className="flex items-center justify-between font-mono text-xs"
              key={coin.symbol}
            >
              <span className="text-fg-primary">{coin.symbol}</span>
              <span className="text-fg-muted">
                {coin.amount < 0.01
                  ? "<0.01"
                  : coin.amount.toLocaleString(undefined, {
                      maximumFractionDigits: 4,
                    })}
                {coin.usdValue != null && (
                  <span className="ml-2 text-fg-primary">
                    ${fmtUsd(coin.usdValue)}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-4 text-center">
          <p className="font-mono text-fg-muted text-xs">
            No token balances found
          </p>
        </div>
      )}

      {onAction && (
        <div className="flex gap-2">
          <button
            className="flex-1 rounded-md border border-border-subtle py-1.5 font-mono text-[10px] text-fg-secondary uppercase tracking-wider transition hover:border-fg-primary/30 hover:text-fg-primary"
            onClick={() => onAction(`Show me the activity heatmap for ${addr}`)}
            type="button"
          >
            Activity →
          </button>
          <button
            className="flex-1 rounded-md bg-fg-primary py-1.5 font-mono text-[10px] text-fg-inverse uppercase tracking-wider transition hover:opacity-90"
            onClick={() => onAction(`Send USDC to ${addr}`)}
            type="button"
          >
            Send →
          </button>
        </div>
      )}
    </div>
  );
}
