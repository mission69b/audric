/**
 * [v0.7d Phase 6 Block B — 2026-05-21 / S.222] Portfolio snapshot job.
 *
 * Extracted from `/api/internal/portfolio-snapshot/route.ts` so both
 * the legacy ECS cron path (POST /api/internal/portfolio-snapshot
 * with x-internal-key) AND the new Vercel cron path (GET
 * /api/cron/portfolio-snapshot with CRON_SECRET) share one
 * implementation. Block C deletes the legacy /api/internal/* route
 * alongside the t2000 indexer + AUDRIC_INTERNAL_KEY retirement.
 *
 * Behavior (preserved from the legacy route):
 *   - Snapshots `PortfolioSnapshot` for every user that doesn't yet
 *     have a row for today (UTC).
 *   - Reads from canonical `getPortfolio()` so wallet/savings/debt
 *     numbers match every other audric surface for the same wallet
 *     on the same day.
 *   - Idempotent: skips users with an existing row for today.
 *   - Per-user errors are caught + counted; one bad user never
 *     aborts the loop.
 *
 * BACKFIX context (April 2026, pre-rewrite): the cron's
 * `walletValueUsd` previously undercounted wallets by storing only
 * `wallet.totalUsd` from the legacy `fetchPortfolio` (which summed
 * USDC + USDsui only, dropping SUI and tradeables). The migration
 * to `getPortfolio()` fixed daily writes going forward; old rows
 * remained frozen and undercounted (backfill never run).
 */

import { prisma } from '@/lib/prisma';
import { getPortfolio } from '@/lib/portfolio';

export interface PortfolioSnapshotResult {
  created: number;
  skipped: number;
  errors: number;
  total: number;
}

export async function runPortfolioSnapshotJob(): Promise<PortfolioSnapshotResult> {
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
      if (existing) {
        skipped++;
        continue;
      }

      const portfolio = await getPortfolio(user.suiAddress);

      await prisma.portfolioSnapshot.create({
        data: {
          userId: user.id,
          date: today,
          // walletValueUsd sums every priced coin (SUI + USDC + USDsui
          // + tradeables) — see lib/portfolio.ts and the
          // `single-source-of-truth` workspace rule.
          walletValueUsd: portfolio.walletValueUsd,
          savingsValueUsd: portfolio.positions.savings,
          debtValueUsd: portfolio.positions.borrows,
          netWorthUsd: portfolio.netWorthUsd,
          yieldEarnedUsd:
            Math.round(portfolio.estimatedDailyYield * 10000) / 10000,
          healthFactor: portfolio.positions.healthFactor,
          // Persist weighted savings APY so the daily 02:30 UTC
          // financial-context-snapshot job can read it from the latest
          // snapshot row instead of re-fetching positions per user.
          savingsRate: portfolio.positions.savingsRate,
          allocations: portfolio.walletAllocations,
        },
      });
      created++;
    } catch (err) {
      console.error(
        `[portfolio-snapshot] Error for ${user.suiAddress}:`,
        err instanceof Error ? err.message : err,
      );
      errors++;
    }
  }

  return { created, skipped, errors, total: users.length };
}
