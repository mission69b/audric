/**
 * [v0.7d Phase 6 Block B — 2026-05-21 / S.222] Financial context snapshot job.
 *
 * Single Vercel cron path: POST /api/cron/financial-context-snapshot
 * (with Authorization: Bearer ${CRON_SECRET}). Originally extracted
 * from `/api/internal/financial-context-snapshot/route.ts` (legacy
 * ECS cron) to share implementation across both paths; the legacy
 * `/api/internal/*` route was deleted in Block C.3 (S.224, 2026-05-21).
 *
 * Behavior (preserved from the legacy route):
 *   - Snapshots `UserFinancialContext` for every user with a
 *     `SessionUsage` row in the last 30 days (active user gate).
 *   - Each row is regenerated from canonical sources via getPortfolio().
 *   - Idempotent: per-user `upsert by userId`.
 *   - Sharded: each invocation processes the slice of users where
 *     `index % total === shard`. Used by the cron fan-out to keep
 *     individual invocations under Vercel's maxDuration cap.
 *   - Per-user errors are caught + counted; one bad user never
 *     aborts the loop.
 *
 * [SPEC 17 — 2026-05-07] `openGoals` field removed along with the
 * `SavingsGoal` table; the snapshot no longer queries goals.
 */

import { prisma } from '@/lib/prisma';
import { getPortfolio } from '@/lib/portfolio';
import { getTelemetrySink } from '@t2000/engine';

export interface FinancialContextSnapshotResult {
  created: number;
  skipped: number;
  errors: number;
  total: number;
}

export interface FinancialContextSnapshotOptions {
  shard?: number;
  total?: number;
}

export async function runFinancialContextSnapshotJob(
  options: FinancialContextSnapshotOptions = {},
): Promise<FinancialContextSnapshotResult> {
  const shard = Math.max(0, Math.floor(options.shard ?? 0));
  const total = Math.max(1, Math.floor(options.total ?? 1));
  const shardStart = Date.now();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);

  const recentSessions = await prisma.sessionUsage.findMany({
    where: { createdAt: { gte: thirtyDaysAgo } },
    select: { address: true },
    distinct: ['address'],
  });

  const allAddresses = recentSessions.map((s) => s.address);
  // Apply shard filter — each address is deterministically assigned to
  // one shard by index so the union of all shards covers every address
  // exactly once.
  const addresses = allAddresses.filter((_, i) => i % total === shard);

  if (addresses.length === 0) {
    getTelemetrySink().histogram(
      'cron.fin_ctx_shard_duration_ms',
      Date.now() - shardStart,
      { shard: String(shard), result: 'ok' },
    );
    return { created: 0, skipped: 0, errors: 0, total: 0 };
  }

  const users = await prisma.user.findMany({
    where: { suiAddress: { in: addresses } },
    select: { id: true, suiAddress: true },
  });

  let created = 0;
  let errors = 0;

  for (const user of users) {
    try {
      const [previous, pendingAdvice, lastSession, portfolio] =
        await Promise.all([
          prisma.portfolioSnapshot.findMany({
            where: { userId: user.id },
            orderBy: { date: 'desc' },
            take: 2,
          }),
          prisma.adviceLog.findFirst({
            where: { userId: user.id, actedOn: false },
            orderBy: { createdAt: 'desc' },
          }),
          prisma.sessionUsage.findFirst({
            where: { address: user.suiAddress },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
          }),
          getPortfolio(user.suiAddress),
        ]);

      const latestSnapshot = previous[0] ?? null;
      const previousSnapshot = previous.length > 1 ? previous[1] : null;
      const recentActivity = buildActivityFromSnapshots(
        latestSnapshot,
        previousSnapshot,
      );

      const daysSinceLastSession = lastSession
        ? Math.floor(
            (Date.now() - lastSession.createdAt.getTime()) / 86_400_000,
          )
        : 0;

      // Per-asset stable breakouts derived from the canonical portfolio.
      const walletUsdc = portfolio.walletAllocations.USDC ?? 0;
      const walletUsdsui = portfolio.walletAllocations.USDsui ?? 0;

      const usdsuiSupply = portfolio.positions.supplies.find(
        (s) => s.asset.toUpperCase() === 'USDSUI',
      );
      const usdcSupply = portfolio.positions.supplies.find(
        (s) => s.asset.toUpperCase() === 'USDC',
      );
      const savingsUsdsui = usdsuiSupply?.amountUsd ?? 0;
      const savingsUsdc = usdcSupply?.amountUsd ?? 0;

      const data = {
        userId: user.id,
        address: user.suiAddress,
        savingsUsdc,
        savingsUsdsui,
        debtUsdc: portfolio.positions.borrows,
        walletUsdc,
        walletUsdsui,
        healthFactor: portfolio.positions.healthFactor,
        currentApy: portfolio.positions.savingsRate || null,
        recentActivity,
        pendingAdvice: pendingAdvice?.adviceText ?? null,
        daysSinceLastSession,
      };

      await prisma.userFinancialContext.upsert({
        where: { userId: user.id },
        create: data,
        update: data,
      });
      created++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[financial-context-snapshot] Failed for ${user.id}: ${msg}`,
      );
      errors++;
    }
  }

  const shardResult = errors === 0 ? 'ok' : 'partial';
  const sink = getTelemetrySink();
  sink.histogram(
    'cron.fin_ctx_shard_duration_ms',
    Date.now() - shardStart,
    { shard: String(shard), result: shardResult },
  );
  sink.counter(
    'cron.fin_ctx_users_processed',
    { shard: String(shard) },
    addresses.length,
  );

  return {
    created,
    skipped: addresses.length - users.length,
    errors,
    total: addresses.length,
  };
}

/**
 * Build the 1–2 phrase activity summary from yesterday vs today's
 * portfolio snapshots.
 */
function buildActivityFromSnapshots(
  latest: { savingsValueUsd: number; debtValueUsd: number } | null,
  previous: { savingsValueUsd: number; debtValueUsd: number } | null,
): string {
  if (!latest) return 'No recent activity.';
  if (!previous) {
    return `Savings: $${latest.savingsValueUsd.toFixed(2)} USDC.`;
  }

  const parts: string[] = [];
  const savingsDelta = latest.savingsValueUsd - previous.savingsValueUsd;
  if (Math.abs(savingsDelta) > 0.01) {
    parts.push(
      savingsDelta > 0
        ? `Saved $${savingsDelta.toFixed(2)}`
        : `Withdrew $${Math.abs(savingsDelta).toFixed(2)}`,
    );
  }
  const debtDelta = latest.debtValueUsd - previous.debtValueUsd;
  if (Math.abs(debtDelta) > 0.01) {
    parts.push(
      debtDelta > 0
        ? `Borrowed $${debtDelta.toFixed(2)}`
        : `Repaid $${Math.abs(debtDelta).toFixed(2)}`,
    );
  }

  return parts.length > 0
    ? `${parts.join('. ')}.`
    : 'No changes since last snapshot.';
}
