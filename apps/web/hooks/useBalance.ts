'use client';

import { useQuery } from '@tanstack/react-query';
import { useSuiClient } from '@mysten/dapp-kit';
import { getDecimalsForCoinType, resolveSymbol, COIN_REGISTRY, USDC_TYPE } from '@t2000/sdk';

const MIST_PER_SUI = 1_000_000_000;
const USDC_DECIMALS = 6;
const CETUS_USDC_SUI_POOL = '0xb8d7d9e66a60c239e7a60110efcf8571655daa67b55b7534e1bc855fcff644d9';

export interface SavingsBreakdownEntry {
  protocol: string;
  protocolId: string;
  asset: string;
  amount: number;
  apy: number;
}

export interface BalanceData {
  total: number;
  /** Liquid spendable balance: USDC + SUI (in USD) */
  cash: number;
  /** Non-USDC tradeable balances in USD (e.g. BTC, ETH) */
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
  /** The user's current blended savings rate from their primary savings protocol */
  currentRate: number;
  /** Per-protocol savings breakdown */
  savingsBreakdown: SavingsBreakdownEntry[];
  /** Raw token balances for tradeable assets (BTC, ETH, GOLD) */
  assetBalances: Record<string, number>;
  /** USD values for tradeable assets */
  assetUsdValues: Record<string, number>;
  loading: boolean;
}

async function fetchSuiPrice(client: ReturnType<typeof useSuiClient>): Promise<number> {
  try {
    const pool = await client.getObject({
      id: CETUS_USDC_SUI_POOL,
      options: { showContent: true },
    });

    if (pool.data?.content?.dataType === 'moveObject') {
      const fields = pool.data.content.fields as Record<string, unknown>;
      const currentSqrtPrice = BigInt(String(fields.current_sqrt_price ?? '0'));

      if (currentSqrtPrice > BigInt(0)) {
        const Q64 = BigInt(2) ** BigInt(64);
        const sqrtPriceFloat = Number(currentSqrtPrice) / Number(Q64);
        const rawPrice = sqrtPriceFloat * sqrtPriceFloat;
        const price = 1000 / rawPrice;
        if (price > 0.01 && price < 1000) return price;
      }
    }
  } catch {
    // fallback
  }
  return 1.0;
}

export function useBalance(address: string | null) {
  const client = useSuiClient();

  return useQuery<BalanceData>({
    queryKey: ['balance', address],
    enabled: !!address,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
    queryFn: async (): Promise<BalanceData> => {
      if (!address) throw new Error('No address');

      const [allBalances, suiPrice, posData, ratesData] = await Promise.all([
        client.getAllBalances({ owner: address }),
        fetchSuiPrice(client),
        fetch(`/api/positions?address=${address}`)
          .then(r => r.json())
          .catch(() => ({ savings: 0, borrows: 0 })),
        fetch('/api/rates')
          .then(r => r.json())
          .catch(() => ({ rates: [], bestSaveRate: null })),
      ]);

      const heldCoinTypes = allBalances
        .filter((b) => Number(b.totalBalance) > 0)
        .map((b) => b.coinType);
      const pricesResp = await fetch(`/api/prices?coins=${encodeURIComponent(heldCoinTypes.join(','))}`)
        .then(r => r.json())
        .catch(() => ({ prices: {}, decimals: {} }));

      const r2 = (n: number) => Math.round(n * 100) / 100;
      const prices = (pricesResp.prices ?? pricesResp) as Record<string, number>;
      const remoteDecs = (pricesResp.decimals ?? {}) as Record<string, number>;

      const knownTypes = new Set(Object.values(COIN_REGISTRY).map((m: { type: string }) => m.type));
      const unknownCoinTypes = heldCoinTypes.filter(
        (ct) => !knownTypes.has(ct) && ct !== '0x2::sui::SUI' && ct !== USDC_TYPE && !(ct in remoteDecs),
      );
      const metadataMap: Record<string, { symbol: string; decimals: number }> = {};
      if (unknownCoinTypes.length > 0) {
        const metas = await Promise.all(
          unknownCoinTypes.map((ct) =>
            client.getCoinMetadata({ coinType: ct })
              .then((m) => m ? { coinType: ct, symbol: m.symbol, decimals: m.decimals } : null)
              .catch(() => null),
          ),
        );
        for (const m of metas) {
          if (m) metadataMap[m.coinType] = { symbol: m.symbol, decimals: m.decimals };
        }
      }

      const balByType = new Map<string, string>();
      for (const b of allBalances) {
        balByType.set(b.coinType, b.totalBalance);
      }

      const sui = r2(Number(balByType.get('0x2::sui::SUI') ?? '0') / MIST_PER_SUI);
      const usdc = r2(Number(balByType.get(USDC_TYPE) ?? '0') / (10 ** USDC_DECIMALS));
      const suiUsd = r2(sui * (prices['0x2::sui::SUI'] ?? prices['SUI'] ?? suiPrice));

      const assetBalances: Record<string, number> = {};
      const assetUsdValues: Record<string, number> = {};
      let tradeableUsd = 0;

      for (const [coinType, raw] of balByType) {
        if (coinType === '0x2::sui::SUI' || coinType === USDC_TYPE) continue;
        const meta = metadataMap[coinType];
        const symbol = meta?.symbol ?? resolveSymbol(coinType);
        const decimals = meta?.decimals ?? getDecimalsForCoinType(coinType);
        const amount = Number(raw) / 10 ** decimals;
        if (amount < 0.000001) continue;
        assetBalances[symbol] = amount;
        const price = prices[coinType] ?? prices[symbol] ?? 0;
        const usdVal = r2(amount * price);
        assetUsdValues[symbol] = usdVal;
        tradeableUsd += usdVal;
      }

      const cash = r2(usdc + suiUsd + tradeableUsd);
      const otherAssetsUsd = 0;
      const savings = r2(posData.savings ?? 0);
      const borrows = posData.borrows ?? 0;
      const savingsRate = r2(posData.savingsRate ?? 0);
      const healthFactor = posData.healthFactor ?? null;
      const maxBorrow = r2(posData.maxBorrow ?? 0);
      const pendingRewards = r2(posData.pendingRewards ?? 0);
      const bestSaveRate = ratesData.bestSaveRate ?? null;

      const suppliesRaw: Array<{ protocol: string; protocolId: string; asset: string; amountUsd: number; apy: number }> =
        posData.supplies ?? [];
      const savingsBreakdown: SavingsBreakdownEntry[] = [];
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
      for (const entry of byKey.values()) {
        savingsBreakdown.push({
          protocol: entry.protocol,
          protocolId: entry.protocolId,
          asset: entry.asset,
          amount: r2(entry.amount),
          apy: entry.amount > 0 ? r2(entry.weightedApy / entry.amount) : 0,
        });
      }

      const primaryPosition = savingsBreakdown.length > 0
        ? savingsBreakdown.reduce((a, b) => a.amount > b.amount ? a : b)
        : null;

      const currentRate = primaryPosition?.apy ?? savingsRate;

      return {
        total: r2(cash + otherAssetsUsd + savings - borrows),
        cash,
        otherAssetsUsd,
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
        assetBalances,
        assetUsdValues,
        loading: false,
      };
    },
  });
}
