import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateInternalKey } from '@/lib/internal-auth';
import { getPortfolio } from '@/lib/portfolio';

export const runtime = 'nodejs';

/**
 * POST /api/internal/portfolio-snapshot
 *
 * Daily ECS cron — snapshots portfolio state for every active user.
 * Thin adapter around `getPortfolio()` so wallet/savings/debt numbers
 * persisted to history match exactly what every other surface shows
 * for the same wallet on the same day.
 *
 * Headers: x-internal-key
 *
 * BACKFIX (April 2026): pre-rewrite, this cron's `walletValueUsd`
 * undercounted wallets by storing only `wallet.totalUsd` from the
 * legacy `fetchPortfolio` (which summed USDC + USDsui only, dropping
 * SUI and tradeables). The migration to `getPortfolio()` automatically
 * fixes the daily writes going forward — old rows stay frozen and
 * undercounted; backfill is documented in the plan but not run here.
 */
export async function POST(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

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

      const portfolio = await getPortfolio(user.suiAddress);

      await prisma.portfolioSnapshot.create({
        data: {
          userId: user.id,
          date: today,
          // walletValueUsd now sums every priced coin (SUI + USDC + USDsui
          // + tradeables) — see [/Users/funkii/dev/audric/apps/web/lib/portfolio.ts]
          // and the `single-source-of-truth` workspace rule.
          walletValueUsd: portfolio.walletValueUsd,
          savingsValueUsd: portfolio.positions.savings,
          debtValueUsd: portfolio.positions.borrows,
          netWorthUsd: portfolio.netWorthUsd,
          yieldEarnedUsd: Math.round(portfolio.estimatedDailyYield * 10000) / 10000,
          healthFactor: portfolio.positions.healthFactor,
          // Persist the weighted savings APY so the daily 02:00 UTC
          // financial-context-snapshot cron can read it from the latest
          // snapshot row instead of re-fetching positions per user.
          savingsRate: portfolio.positions.savingsRate,
          allocations: portfolio.walletAllocations,
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
