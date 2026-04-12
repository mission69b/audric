import { getClient, getRegistry } from '@/lib/protocol-registry';
import { COIN_REGISTRY, USDC_TYPE } from '@t2000/sdk';

const USDC_DECIMALS = 6;
const MIST_PER_SUI = 1_000_000_000;

const TRADEABLE_COINS: Record<string, { type: string; decimals: number }> = {
  USDT: { type: COIN_REGISTRY.USDT.type, decimals: COIN_REGISTRY.USDT.decimals },
  BTC: { type: COIN_REGISTRY.wBTC.type, decimals: COIN_REGISTRY.wBTC.decimals },
  ETH: { type: COIN_REGISTRY.ETH.type, decimals: COIN_REGISTRY.ETH.decimals },
  GOLD: { type: COIN_REGISTRY.GOLD.type, decimals: COIN_REGISTRY.GOLD.decimals },
};

export interface WalletBalances {
  SUI: number;
  USDC: number;
  assets: Record<string, number>;
  totalUsd: number;
  allocations: Record<string, number>;
}

export interface SupplyEntry {
  asset: string;
  amount: number;
  amountUsd: number;
  apy: number;
  protocol: string;
  protocolId: string;
}

export interface BorrowEntry {
  asset: string;
  amount: number;
  amountUsd: number;
  apy: number;
  protocol: string;
  protocolId: string;
}

export interface PositionSummary {
  savings: number;
  borrows: number;
  savingsRate: number;
  healthFactor: number | null;
  maxBorrow: number;
  pendingRewards: number;
  supplies: SupplyEntry[];
  borrowsDetail: BorrowEntry[];
}

export interface PortfolioSnapshot {
  wallet: WalletBalances;
  positions: PositionSummary;
  netWorthUsd: number;
  estimatedDailyYield: number;
}

const EMPTY_WALLET: WalletBalances = { SUI: 0, USDC: 0, assets: {}, totalUsd: 0, allocations: {} };
const EMPTY_POSITIONS: PositionSummary = {
  savings: 0, borrows: 0, savingsRate: 0, healthFactor: null,
  maxBorrow: 0, pendingRewards: 0, supplies: [], borrowsDetail: [],
};

/**
 * Fetches wallet balances from chain. Throws on RPC failure — callers
 * decide whether to return 500 or degrade gracefully.
 */
export async function fetchWalletBalances(address: string): Promise<WalletBalances> {
  const client = getClient();
  const tradeableEntries = Object.entries(TRADEABLE_COINS);

  const [suiBal, usdcBal, ...tradeableBals] = await Promise.all([
    client.getBalance({ owner: address, coinType: '0x2::sui::SUI' }),
    client.getBalance({ owner: address, coinType: USDC_TYPE }).catch(() => ({ totalBalance: '0' })),
    ...tradeableEntries.map(([, info]) =>
      client.getBalance({ owner: address, coinType: info.type }).catch(() => ({ totalBalance: '0' })),
    ),
  ]);

  const suiRounded = Math.round(Number(suiBal.totalBalance) / MIST_PER_SUI * 1e4) / 1e4;
  const usdcRounded = Math.round(Number(usdcBal.totalBalance) / (10 ** USDC_DECIMALS) * 100) / 100;

  const assets: Record<string, number> = {};
  tradeableEntries.forEach(([symbol, info], idx) => {
    assets[symbol] = Math.round(Number(tradeableBals[idx].totalBalance) / 10 ** info.decimals * 1e8) / 1e8;
  });

  return {
    SUI: suiRounded,
    USDC: usdcRounded,
    assets,
    totalUsd: usdcRounded,
    allocations: { USDC: usdcRounded, SUI: suiRounded, ...assets },
  };
}

/**
 * Fetches lending positions from the protocol registry. Throws on registry
 * failure — callers decide whether to return 500 or degrade gracefully.
 */
export async function fetchPositions(address: string): Promise<PositionSummary> {
  const registry = getRegistry();
  const lendingAdapters = registry.listLending();

  const [allPositions, healthResults, rewardResults] = await Promise.all([
    registry.allPositions(address),
    Promise.allSettled(lendingAdapters.map((a) => a.getHealth(address))),
    Promise.allSettled(
      lendingAdapters
        .filter((a) => !!a.getPendingRewards)
        .map((a) => a.getPendingRewards!(address)),
    ),
  ]);

  let savings = 0;
  let borrows = 0;
  let weightedRateSum = 0;

  const supplies: SupplyEntry[] = [];
  const borrowList: BorrowEntry[] = [];

  for (const pos of allPositions) {
    for (const s of pos.positions.supplies) {
      const usd = s.amountUsd ?? s.amount;
      savings += usd;
      weightedRateSum += usd * s.apy;
      supplies.push({ asset: s.asset, amount: s.amount, amountUsd: usd, apy: s.apy, protocol: pos.protocol, protocolId: pos.protocolId });
    }
    for (const b of pos.positions.borrows) {
      const usd = b.amountUsd ?? b.amount;
      borrows += usd;
      borrowList.push({ asset: b.asset, amount: b.amount, amountUsd: usd, apy: b.apy, protocol: pos.protocol, protocolId: pos.protocolId });
    }
  }

  const savingsRate = savings > 0 ? weightedRateSum / savings : 0;

  type HealthResult = Awaited<ReturnType<typeof lendingAdapters[0]['getHealth']>>;
  const validHealths = healthResults
    .filter((h): h is PromiseFulfilledResult<HealthResult> => h.status === 'fulfilled')
    .map((h) => h.value);

  const finiteHFs = validHealths.filter((h) => h.healthFactor !== Infinity && isFinite(h.healthFactor));
  const healthFactor = finiteHFs.length > 0
    ? Math.min(...finiteHFs.map((h) => h.healthFactor))
    : null;
  const maxBorrow = validHealths.reduce((sum, h) => sum + (h.maxBorrow ?? 0), 0);

  type RewardResult = Awaited<ReturnType<NonNullable<typeof lendingAdapters[0]['getPendingRewards']>>>;
  const pendingRewards = rewardResults
    .filter((r): r is PromiseFulfilledResult<RewardResult> => r.status === 'fulfilled')
    .flatMap((r) => r.value)
    .reduce((sum, r) => sum + (r.estimatedValueUsd ?? 0), 0);

  return { savings, borrows, savingsRate, healthFactor, maxBorrow, pendingRewards, supplies, borrowsDetail: borrowList };
}

/**
 * Combined portfolio fetch — wallet + positions + derived metrics.
 * Degrades gracefully: if either sub-fetch fails, it uses safe defaults
 * so snapshot/history callers always get a result.
 */
export async function fetchPortfolio(address: string): Promise<PortfolioSnapshot> {
  const [walletResult, positionsResult] = await Promise.allSettled([
    fetchWalletBalances(address),
    fetchPositions(address),
  ]);

  const wallet = walletResult.status === 'fulfilled' ? walletResult.value : { ...EMPTY_WALLET };
  const positions = positionsResult.status === 'fulfilled' ? positionsResult.value : { ...EMPTY_POSITIONS };

  if (walletResult.status === 'rejected') {
    console.error('[portfolio-data] fetchPortfolio wallet error:', walletResult.reason);
  }
  if (positionsResult.status === 'rejected') {
    console.error('[portfolio-data] fetchPortfolio positions error:', positionsResult.reason);
  }

  const netWorthUsd = wallet.totalUsd + positions.savings - positions.borrows;
  const estimatedDailyYield = positions.savings > 0 && positions.savingsRate > 0
    ? (positions.savings * positions.savingsRate) / 365
    : 0;

  return { wallet, positions, netWorthUsd, estimatedDailyYield };
}
