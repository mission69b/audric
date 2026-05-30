"use client";

import { useMemo } from "react";
import { usePortfolio } from "@/hooks/use-portfolio";
import { fmtUsd } from "../primitives";
import {
  CanvasButton,
  CanvasFooterMeta,
  CanvasShell,
} from "./canvas-shell";

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
  const savingsUsd = portfolio?.positions?.savings ?? 0;
  const debtUsd = portfolio?.positions?.borrows ?? 0;

  if (
    !data ||
    typeof data !== "object" ||
    !("available" in data) ||
    !data.available
  ) {
    return (
      <CanvasShell eyebrow="Watching" name="Address">
        <div className="flex flex-col items-center justify-center space-y-2 py-6 text-center">
          <span className="text-3xl">👁</span>
          <p className="max-w-xs text-muted-foreground text-xs leading-relaxed">
            {data &&
            typeof data === "object" &&
            "message" in data &&
            data.message
              ? data.message
              : "Provide a Sui address to watch."}
          </p>
        </div>
      </CanvasShell>
    );
  }

  const addr = address ?? "";

  if (isLoading && !portfolio) {
    return (
      <CanvasShell eyebrow="Watching" live name={label ?? truncAddr(addr)}>
        <div className="flex items-center justify-center py-8">
          <div className="animate-pulse font-mono text-muted-foreground text-xs">
            Fetching balances...
          </div>
        </div>
      </CanvasShell>
    );
  }

  return (
    <CanvasShell
      eyebrow="Watching"
      footer={
        onAction ? (
          <>
            <CanvasFooterMeta>
              Read-only · Audric flags big moves in chat
            </CanvasFooterMeta>
            <CanvasButton
              onClick={() => onAction(`Show me the activity heatmap for ${addr}`)}
              variant="secondary"
            >
              Activity →
            </CanvasButton>
            <CanvasButton
              onClick={() => onAction(`Send USDC to ${addr}`)}
              variant="primary"
            >
              Send →
            </CanvasButton>
          </>
        ) : undefined
      }
      live
      name={label ?? truncAddr(addr)}
      summary={{ value: `$${fmtUsd(netWorthUsd)}`, label: "balance" }}
    >
      <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-border bg-muted px-3.5 py-2.5">
        <svg
          aria-hidden="true"
          className="shrink-0 text-muted-foreground"
          fill="none"
          height="14"
          viewBox="0 0 16 16"
          width="14"
        >
          <circle
            cx="7"
            cy="7"
            fill="none"
            r="5"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M11 11 L14 14"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.5"
          />
        </svg>
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-foreground tracking-[-0.011em]">
          {addr}
        </span>
        <a
          className="shrink-0 font-mono text-[11px] text-muted-foreground transition hover:text-foreground"
          href={`https://suiscan.xyz/mainnet/account/${addr}`}
          rel="noopener noreferrer"
          target="_blank"
        >
          SuiScan ↗
        </a>
      </div>

      <div className="flex flex-col gap-1 font-mono text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Wallet</span>
          <span className="text-foreground">${fmtUsd(walletValueUsd)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Savings</span>
          <span className="text-success">${fmtUsd(savingsUsd)}</span>
        </div>
        {debtUsd > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Debt</span>
            <span className="text-destructive">-${fmtUsd(debtUsd)}</span>
          </div>
        )}
      </div>

      {coins.length > 0 ? (
        <div className="mt-3 flex flex-col border-border border-t pt-1">
          {coins.map((coin) => (
            <div
              className="flex items-center justify-between border-border border-b border-dotted py-2.5 font-mono text-[13px] last:border-b-0"
              key={coin.symbol}
            >
              <span className="font-medium text-foreground">{coin.symbol}</span>
              <span className="text-muted-foreground tabular-nums">
                {coin.amount < 0.01
                  ? "<0.01"
                  : coin.amount.toLocaleString(undefined, {
                      maximumFractionDigits: 4,
                    })}
                {coin.usdValue != null && (
                  <span className="ml-2 text-foreground">
                    ${fmtUsd(coin.usdValue)}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-4 text-center">
          <p className="font-mono text-muted-foreground text-xs">
            No token balances found
          </p>
        </div>
      )}
    </CanvasShell>
  );
}
