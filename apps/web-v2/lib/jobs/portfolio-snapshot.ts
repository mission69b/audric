/**
 * [v0.7c Phase 6.5 / S.253 — 2026-05-22] Portfolio snapshot job —
 * web-v2 port. Verbatim copy of `apps/web/lib/jobs/portfolio-snapshot.ts`
 * (originally landed v0.7d Phase 6 Block B / S.222). Mirrored here so
 * web-v2 owns the cron during the v0.7c chat-flip + DNS-flip window.
 *
 * Critical because the daily 07:00 UTC `PortfolioSnapshot` row feeds
 * the 02:30 UTC UFC snapshot's `recentActivity` field — if this cron
 * stops, UFC `recentActivity` goes stale and the agent reads "No
 * changes since last snapshot" forever.
 *
 * Behavior (preserved verbatim):
 *   - Snapshots `PortfolioSnapshot` for every user that doesn't yet
 *     have a row for today (UTC).
 *   - Reads from canonical `getPortfolio()` so wallet/savings/debt
 *     numbers match every other audric surface for the same wallet
 *     on the same day.
 *   - Idempotent: skips users with an existing row for today.
 *   - Per-user errors are caught + counted; one bad user never
 *     aborts the loop.
 */

import { getPortfolio } from "@/lib/portfolio";
import { prisma } from "@/lib/prisma";

export interface PortfolioSnapshotResult {
  created: number;
  errors: number;
  skipped: number;
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
          walletValueUsd: portfolio.walletValueUsd,
          savingsValueUsd: portfolio.positions.savings,
          debtValueUsd: portfolio.positions.borrows,
          netWorthUsd: portfolio.netWorthUsd,
          yieldEarnedUsd:
            Math.round(portfolio.estimatedDailyYield * 10_000) / 10_000,
          healthFactor: portfolio.positions.healthFactor,
          savingsRate: portfolio.positions.savingsRate,
          allocations: portfolio.walletAllocations,
        },
      });
      created++;
    } catch (err) {
      console.error(
        `[portfolio-snapshot] Error for ${user.suiAddress}:`,
        err instanceof Error ? err.message : err
      );
      errors++;
    }
  }

  return { created, skipped, errors, total: users.length };
}
