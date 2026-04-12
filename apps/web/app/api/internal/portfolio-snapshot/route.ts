import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateInternalKey } from '@/lib/internal-auth';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

export const runtime = 'nodejs';
const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
const suiClient = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(SUI_NETWORK), network: SUI_NETWORK });

const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const SUI_TYPE = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI';
const SELF_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : process.env.AUDRIC_INTERNAL_URL ?? 'http://localhost:3000';

/**
 * POST /api/internal/portfolio-snapshot
 * Called by ECS cron to snapshot portfolio state for all active users.
 * Headers: x-internal-key
 */
export async function POST(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const users = await prisma.user.findMany({
    where: { onboardedAt: { not: null } },
    select: { id: true, suiAddress: true },
  });

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const user of users) {
    try {
      const existing = await prisma.portfolioSnapshot.findUnique({
        where: { userId_date: { userId: user.id, date: today } },
      });
      if (existing) { skipped++; continue; }

      const snapshot = await buildSnapshot(user.suiAddress);
      await prisma.portfolioSnapshot.create({
        data: {
          userId: user.id,
          date: today,
          ...snapshot,
        },
      });
      created++;
    } catch (err) {
      console.error(`[portfolio-snapshot] Error for ${user.suiAddress}:`, err);
      errors++;
    }
  }

  return NextResponse.json({ created, skipped, errors, total: users.length });
}

async function buildSnapshot(address: string) {
  const [balances, positions] = await Promise.all([
    fetchBalances(address),
    fetchPositions(address),
  ]);

  const walletValueUsd = balances.totalUsd;
  const savingsValueUsd = positions.savings;
  const debtValueUsd = positions.borrows;
  const netWorthUsd = walletValueUsd + savingsValueUsd - debtValueUsd;

  const dailyYield = savingsValueUsd > 0 && positions.savingsRate > 0
    ? (savingsValueUsd * positions.savingsRate) / 365
    : 0;

  return {
    walletValueUsd,
    savingsValueUsd,
    debtValueUsd,
    netWorthUsd,
    yieldEarnedUsd: Math.round(dailyYield * 10000) / 10000,
    healthFactor: positions.healthFactor,
    allocations: balances.allocations,
  };
}

async function fetchBalances(address: string): Promise<{ totalUsd: number; allocations: Record<string, number> }> {
  const allocations: Record<string, number> = {};
  let totalUsd = 0;

  try {
    const usdcBalance = await suiClient
      .getBalance({ owner: address, coinType: USDC_TYPE })
      .catch(() => null);

    if (usdcBalance) {
      const amount = Number(BigInt(usdcBalance.totalBalance)) / 1e6;
      allocations['USDC'] = amount;
      totalUsd += amount;
    }

    const suiBalance = await suiClient
      .getBalance({ owner: address, coinType: SUI_TYPE })
      .catch(() => null);

    if (suiBalance) {
      const amount = Number(BigInt(suiBalance.totalBalance)) / 1e9;
      allocations['SUI'] = amount;
      // SUI is not counted in totalUsd — we only track stablecoin wallet value
    }
  } catch { /* best effort */ }

  return { totalUsd, allocations };
}

async function fetchPositions(address: string): Promise<{
  savings: number;
  borrows: number;
  healthFactor: number | null;
  savingsRate: number;
}> {
  try {
    const res = await fetch(`${SELF_URL}/api/positions?address=${address}`, {
      headers: { 'x-internal-key': process.env.T2000_INTERNAL_KEY ?? '' },
    });

    if (!res.ok) return { savings: 0, borrows: 0, healthFactor: null, savingsRate: 0 };

    const data = (await res.json()) as {
      savings?: number;
      borrows?: number;
      healthFactor?: number | null;
      savingsRate?: number;
    };

    return {
      savings: data.savings ?? 0,
      borrows: data.borrows ?? 0,
      healthFactor: data.healthFactor ?? null,
      savingsRate: data.savingsRate ?? 0,
    };
  } catch {
    return { savings: 0, borrows: 0, healthFactor: null, savingsRate: 0 };
  }
}
