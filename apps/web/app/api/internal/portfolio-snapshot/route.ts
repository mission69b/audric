import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateInternalKey } from '@/lib/internal-auth';
import { fetchPortfolio } from '@/lib/portfolio-data';

export const runtime = 'nodejs';

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

  // [SIMPLIFICATION DAY 5] onboardedAt column dropped — onboarding gate
  // retired. Snapshot every user; the cron is idempotent (skips if a row
  // already exists for today) so the slightly larger candidate set is fine.
  const users = await prisma.user.findMany({
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

      const portfolio = await fetchPortfolio(user.suiAddress);

      await prisma.portfolioSnapshot.create({
        data: {
          userId: user.id,
          date: today,
          walletValueUsd: portfolio.wallet.totalUsd,
          savingsValueUsd: portfolio.positions.savings,
          debtValueUsd: portfolio.positions.borrows,
          netWorthUsd: portfolio.netWorthUsd,
          yieldEarnedUsd: Math.round(portfolio.estimatedDailyYield * 10000) / 10000,
          healthFactor: portfolio.positions.healthFactor,
          allocations: portfolio.wallet.allocations,
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
