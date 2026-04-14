import { fetchWalletBalances, fetchPositions } from '@/lib/portfolio-data';
import { fetchActivityBuckets } from '@/lib/activity-data';
import { detectPatterns, detectRiskSignals, generateSuggestions } from './analyzers';
import type {
  WalletReportData,
  PortfolioSection,
  YieldEfficiencySection,
  ActivitySection,
  TokenAllocation,
} from './types';

const STABLE_SYMBOLS = new Set(['USDC', 'USDT']);
const NAVI_USDC_APY = 4.5;

export async function generateWalletReport(address: string): Promise<WalletReportData> {
  const [wallet, positions, buckets30d, buckets90d] = await Promise.all([
    fetchWalletBalances(address).catch(() => null),
    fetchPositions(address).catch(() => null),
    fetchActivityBuckets(address, 30).catch(() => []),
    fetchActivityBuckets(address, 90).catch(() => []),
  ]);

  const portfolio = buildPortfolioSection(wallet, positions);
  const yieldEfficiency = buildYieldEfficiency(wallet, positions);
  const activity = buildActivitySection(buckets30d, buckets90d);

  const patterns = detectPatterns(portfolio, yieldEfficiency, activity);
  const riskSignals = detectRiskSignals(portfolio, yieldEfficiency);
  const audricWouldDo = generateSuggestions(portfolio, yieldEfficiency, activity);

  return {
    address,
    generatedAt: new Date().toISOString(),
    portfolio,
    yieldEfficiency,
    activity,
    patterns,
    riskSignals,
    audricWouldDo,
  };
}

function buildPortfolioSection(
  wallet: Awaited<ReturnType<typeof fetchWalletBalances>> | null,
  positions: Awaited<ReturnType<typeof fetchPositions>> | null,
): PortfolioSection {
  if (!wallet) {
    return {
      totalUsd: 0, tokens: [], savings: 0, debt: 0, netWorth: 0,
      healthFactor: null, supplies: [], borrows: [],
    };
  }

  const rawTokens: { symbol: string; amount: number }[] = [
    { symbol: 'SUI', amount: wallet.SUI },
    { symbol: 'USDC', amount: wallet.USDC },
    ...Object.entries(wallet.assets).map(([symbol, amount]) => ({ symbol, amount })),
  ];

  const totalUsd = Object.values(wallet.allocations).reduce((s, v) => s + v, 0);

  const tokens: TokenAllocation[] = rawTokens
    .filter((t) => t.amount > 0)
    .map((t) => {
      const usd = wallet.allocations[t.symbol] ?? t.amount;
      return {
        symbol: t.symbol,
        amount: t.amount,
        usd,
        pct: totalUsd > 0 ? (usd / totalUsd) * 100 : 0,
      };
    })
    .sort((a, b) => b.usd - a.usd);

  const savings = positions?.savings ?? 0;
  const debt = positions?.borrows ?? 0;
  const netWorth = totalUsd + savings - debt;

  return {
    totalUsd,
    tokens,
    savings,
    debt,
    netWorth,
    healthFactor: positions?.healthFactor ?? null,
    supplies: (positions?.supplies ?? []).map((s) => ({
      asset: s.asset, amount: s.amount, amountUsd: s.amountUsd, apy: s.apy, protocol: s.protocol,
    })),
    borrows: (positions?.borrowsDetail ?? []).map((b) => ({
      asset: b.asset, amount: b.amount, amountUsd: b.amountUsd, apy: b.apy, protocol: b.protocol,
    })),
  };
}

function buildYieldEfficiency(
  wallet: Awaited<ReturnType<typeof fetchWalletBalances>> | null,
  positions: Awaited<ReturnType<typeof fetchPositions>> | null,
): YieldEfficiencySection {
  const earningUsd = positions?.savings ?? 0;
  const weightedApy = positions?.savingsRate ?? 0;

  let idleStablesUsd = 0;
  if (wallet) {
    if (wallet.USDC > 0) idleStablesUsd += wallet.USDC;
    for (const [sym, amt] of Object.entries(wallet.assets)) {
      if (STABLE_SYMBOLS.has(sym) && amt > 0) idleStablesUsd += amt;
    }
  }

  const totalStables = earningUsd + idleStablesUsd;
  const efficiencyPct = totalStables > 0 ? (earningUsd / totalStables) * 100 : 0;
  const opportunityCostMonthly = (idleStablesUsd * NAVI_USDC_APY) / 100 / 12;
  const estimatedDailyYield = earningUsd > 0 && weightedApy > 0
    ? (earningUsd * weightedApy / 100) / 365
    : 0;

  return {
    earningUsd,
    idleStablesUsd,
    efficiencyPct,
    weightedApy,
    opportunityCostMonthly,
    estimatedDailyYield,
  };
}

function buildActivitySection(
  buckets30d: Awaited<ReturnType<typeof fetchActivityBuckets>>,
  buckets90d: Awaited<ReturnType<typeof fetchActivityBuckets>>,
): ActivitySection {
  const txCount30d = buckets30d.reduce((s, b) => s + b.count, 0);
  const txCount90d = buckets90d.reduce((s, b) => s + b.count, 0);
  const activeDays30d = buckets30d.filter((b) => b.count > 0).length;

  const allDates = buckets90d.map((b) => b.date).sort();
  const lastActiveDate = allDates.length > 0 ? allDates[allDates.length - 1] : null;

  return { txCount30d, txCount90d, activeDays30d, lastActiveDate };
}
