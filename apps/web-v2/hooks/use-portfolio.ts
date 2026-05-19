"use client";

/**
 * `usePortfolio` — SWR-backed reader for the canonical portfolio shape.
 *
 * Wraps `/api/portfolio` (which is the thin adapter over `getPortfolio()`
 * — see `lib/portfolio.ts` for the single-source-of-truth contract).
 * Returns the full Portfolio payload; components select what they need.
 *
 * Powers Splash-B's `<BalanceHero>` (Session 4.7.B) and is intended to
 * be the canonical client-side reader for ANY surface that needs wallet
 * + positions + net worth (future portfolio canvas mounts, the eventual
 * sidebar net-worth strip, etc.).
 *
 * Caching: `dedupingInterval: 30_000` matches the api route's 15s
 * `max-age` + 30s `stale-while-revalidate` Cache-Control directive. SWR
 * revalidates on focus + reconnect by default — overridden to false so
 * we don't trigger a fresh BlockVision read every time the user tabs
 * back to the chat. The user is on the chat anyway; the data is the
 * eyebrow, not the action.
 */

import useSWR from "swr";
import { authFetch } from "@/lib/auth-fetch";

export interface PortfolioWalletCoin {
  balance: number;
  decimals: number;
  price: number | null;
  symbol: string;
  usdValue: number | null;
}

export interface PortfolioPositions {
  borrows: number;
  borrowsDetail?: unknown;
  healthFactor: number | null;
  maxBorrow: number;
  pendingRewards?: unknown;
  savings: number;
  savingsRate: number;
  supplies?: unknown;
}

export interface Portfolio {
  address: string;
  defiPricedAt: number;
  defiSource: string;
  defiValueUsd: number;
  estimatedDailyYield: number;
  netWorthUsd: number;
  positions: PortfolioPositions;
  pricedAt: number;
  source: string;
  wallet: PortfolioWalletCoin[];
  walletAllocations: unknown;
  walletValueUsd: number;
}

export function usePortfolio(address: string | null) {
  return useSWR<Portfolio>(
    address ? `portfolio:${address}` : null,
    async () => {
      const res = await authFetch(`/api/portfolio?address=${address}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch portfolio (HTTP ${res.status})`);
      }
      return res.json();
    },
    {
      dedupingInterval: 30_000,
      revalidateOnFocus: false,
    }
  );
}
