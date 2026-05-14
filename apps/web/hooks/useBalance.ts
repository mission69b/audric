'use client';

import { useQuery } from '@tanstack/react-query';
import type { PortfolioCoin } from '@t2000/engine';
import { authFetch } from '@/lib/auth-fetch';

const SUI_TYPE = '0x2::sui::SUI';
const USDC_TYPE_LONG =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function r4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export interface SavingsBreakdownEntry {
  protocol: string;
  protocolId: string;
  asset: string;
  amount: number;
  apy: number;
}

export interface BalanceData {
  total: number;
  /** Liquid spendable balance: every priced coin (USDC + SUI USD + tradeables) */
  cash: number;
  /** Always 0 — kept for legacy callers; tradeables are folded into `cash`. */
  otherAssetsUsd: number;
  savings: number;
  borrows: number;
  sui: number;
  suiUsd: number;
  usdc: number;
  suiPrice: number;
  savingsRate: number;
  healthFactor: number | null;
  maxBorrow: number;
  pendingRewards: number;
  bestSaveRate: { protocol: string; protocolId: string; asset: string; rate: number } | null;
  /** Blended savings rate from the user's primary savings protocol */
  currentRate: number;
  /** Per-protocol savings breakdown */
  savingsBreakdown: SavingsBreakdownEntry[];
  /**
   * [CHIP_REVIEW_2 F-3 / 2026-05-07] Per-asset debt breakdown — needed by
   * the Repay chip flow to default to (or pick between) USDC vs USDsui
   * debts when both exist. Mirrors `savingsBreakdown` but for the borrow
   * side. Sourced verbatim from `/api/portfolio` → `positions.borrowsDetail`.
   */
  borrowsBreakdown: Array<{ protocol: string; protocolId: string; asset: string; amountUsd: number; apy: number }>;
  /** Raw token balances for tradeable assets (every non-SUI/USDC coin) */
  assetBalances: Record<string, number>;
  /** USD values for tradeable assets */
  assetUsdValues: Record<string, number>;
  loading: boolean;
}

interface PortfolioRouteResponse {
  address: string;
  netWorthUsd: number;
  walletValueUsd: number;
  walletAllocations: Record<string, number>;
  wallet: PortfolioCoin[];
  positions: {
    savings: number;
    borrows: number;
    savingsRate: number;
    healthFactor: number | null;
    maxBorrow: number;
    pendingRewards: number;
    supplies: Array<{ protocol: string; protocolId: string; asset: string; amountUsd: number; apy: number }>;
    borrowsDetail: Array<{ protocol: string; protocolId: string; asset: string; amountUsd: number; apy: number }>;
  };
  estimatedDailyYield: number;
  source: string;
  pricedAt: number;
}

interface RatesRouteResponse {
  rates: Array<{ protocol: string; protocolId: string; asset: string; saveApy: number; borrowApy: number }>;
  bestSaveRate: { protocol: string; protocolId: string; asset: string; rate: number } | null;
}

/**
 * Wallet balance hook — thin wrapper around `/api/portfolio` and
 * `/api/rates`. All pricing, summing, and aggregation happens in the
 * canonical `getPortfolio()` ([apps/web/lib/portfolio.ts]); this hook
 * only reshapes the response into the legacy `BalanceData` wire shape
 * consumed by the dashboard balance hero, balance card, and goals
 * panel.
 *
 * The pre-rewrite version of this hook fetched balances directly via
 * `client.getAllBalances`, computed SUI price from the Cetus pool,
 * resolved metadata via `client.getCoinMetadata`, and combined with
 * `/api/positions` + `/api/prices`. That fragmented path produced
 * different numbers than the engine and the canvases. Now everything
 * routes through one place.
 */
export function useBalance(address: string | null) {
  return useQuery<BalanceData>({
    queryKey: ['balance', address],
    enabled: !!address,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
    queryFn: async (): Promise<BalanceData> => {
      if (!address) throw new Error('No address');

      const [portfolioResp, ratesResp] = await Promise.all([
        authFetch(`/api/portfolio?address=${address}`)
          .then((r) => (r.ok ? (r.json() as Promise<PortfolioRouteResponse>) : null))
          .catch(() => null),
        fetch('/api/rates')
          .then((r) => (r.ok ? (r.json() as Promise<RatesRouteResponse>) : null))
          .catch(() => null),
      ]);

      if (!portfolioResp) {
        return EMPTY_BALANCE;
      }

      const wallet = portfolioResp.wallet ?? [];

      let sui = 0;
      let suiUsd = 0;
      let suiPrice = 0;
      let usdc = 0;
      const assetBalances: Record<string, number> = {};
      const assetUsdValues: Record<string, number> = {};
      let tradeableUsd = 0;

      for (const coin of wallet) {
        const decimals = coin.decimals;
        const amount = Number(coin.balance) / 10 ** decimals;
        if (!Number.isFinite(amount) || amount <= 0) continue;

        const symbol = coin.symbol || '?';
        const usdValue = coin.usdValue ?? 0;

        if (coin.coinType === SUI_TYPE || symbol === 'SUI') {
          sui = Math.floor(amount * 10000) / 10000;
          suiUsd = r2(usdValue);
          suiPrice = coin.price ?? 0;
          continue;
        }

        if (coin.coinType === USDC_TYPE_LONG || symbol === 'USDC') {
          usdc = Math.floor(amount * 100) / 100;
          continue;
        }

        const display = Math.floor(amount * 10 ** Math.min(decimals, 8)) / 10 ** Math.min(decimals, 8);
        if (display <= 0.000001 && usdValue < 0.01) continue;

        assetBalances[symbol] = display;
        assetUsdValues[symbol] = r2(usdValue);
        tradeableUsd += usdValue;
      }

      const cash = r2(usdc + suiUsd + tradeableUsd);

      const positions = portfolioResp.positions;
      const savings = r2(positions.savings ?? 0);
      const borrows = positions.borrows ?? 0;
      const savingsRate = r4(positions.savingsRate ?? 0);
      const healthFactor = positions.healthFactor ?? null;
      const maxBorrow = r2(positions.maxBorrow ?? 0);
      const pendingRewards = r2(positions.pendingRewards ?? 0);
      const bestSaveRate = ratesResp?.bestSaveRate ?? null;

      const suppliesRaw = positions.supplies ?? [];
      const byKey = new Map<string, { protocol: string; protocolId: string; asset: string; amount: number; weightedApy: number }>();
      for (const s of suppliesRaw) {
        const key = `${s.protocolId}:${s.asset}`;
        const existing = byKey.get(key);
        if (existing) {
          existing.amount += s.amountUsd;
          existing.weightedApy += s.amountUsd * s.apy;
        } else {
          byKey.set(key, {
            protocol: s.protocol,
            protocolId: s.protocolId,
            asset: s.asset,
            amount: s.amountUsd,
            weightedApy: s.amountUsd * s.apy,
          });
        }
      }
      const savingsBreakdown: SavingsBreakdownEntry[] = [];
      for (const entry of byKey.values()) {
        savingsBreakdown.push({
          protocol: entry.protocol,
          protocolId: entry.protocolId,
          asset: entry.asset,
          amount: r2(entry.amount),
          apy: entry.amount > 0 ? r4(entry.weightedApy / entry.amount) : 0,
        });
      }

      const primaryPosition = savingsBreakdown.length > 0
        ? savingsBreakdown.reduce((a, b) => (a.amount > b.amount ? a : b))
        : null;
      const currentRate = primaryPosition?.apy ?? savingsRate;

      return {
        total: r2(cash + savings - borrows),
        cash,
        otherAssetsUsd: 0,
        savings,
        borrows,
        sui,
        suiUsd,
        usdc,
        suiPrice: r2(suiPrice),
        savingsRate,
        healthFactor,
        maxBorrow,
        pendingRewards,
        bestSaveRate,
        currentRate,
        savingsBreakdown,
        borrowsBreakdown: positions.borrowsDetail ?? [],
        assetBalances,
        assetUsdValues,
        loading: false,
      };
    },
  });
}

const EMPTY_BALANCE: BalanceData = {
  total: 0,
  cash: 0,
  otherAssetsUsd: 0,
  savings: 0,
  borrows: 0,
  sui: 0,
  suiUsd: 0,
  usdc: 0,
  suiPrice: 0,
  savingsRate: 0,
  healthFactor: null,
  maxBorrow: 0,
  pendingRewards: 0,
  bestSaveRate: null,
  currentRate: 0,
  savingsBreakdown: [],
  borrowsBreakdown: [],
  assetBalances: {},
  assetUsdValues: {},
  loading: false,
};
