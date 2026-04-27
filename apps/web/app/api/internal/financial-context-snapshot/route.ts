import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateInternalKey } from '@/lib/internal-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/internal/financial-context-snapshot
 *
 * [v1.4.2 — Day 5 / Spec Item 6] Daily upsert of `UserFinancialContext`
 * for every active user. Active = "has a `SessionUsage` row in the last
 * 30 days" — same definition the silent-infra crons use elsewhere.
 *
 * Each user's row is regenerated from canonical sources (no merge with
 * the prior snapshot — the cron is the source of truth):
 *
 *   - `savingsUsdc` / `debtUsdc` / `walletUsdc` / `healthFactor` come
 *     from the latest `PortfolioSnapshot` (written by the
 *     /api/internal/portfolio-snapshot cron earlier in the same UTC
 *     hour). Snapshot freshness matters; if portfolio-snapshot didn't
 *     run for a user we still write the row using the most recent
 *     historical snapshot rather than skipping — staleness is
 *     surfaced as `daysSinceLastSession` and `recentActivity` so the
 *     LLM can hedge without crashing the prompt block.
 *   - `recentActivity` is a 1–2 phrase delta vs the previous snapshot
 *     ("Saved $X. Borrowed $Y." / "No changes since last snapshot.").
 *   - `openGoals` is up to 3 active SavingsGoal rows ("Name — target
 *     $N").
 *   - `pendingAdvice` is the single most recent `AdviceLog` with
 *     `actedOn = false`. The `actedOn` flag (Day 3 schema migration)
 *     prevents re-surfacing advice the user already followed.
 *   - `daysSinceLastSession` is `now - max(SessionUsage.createdAt) /
 *     86_400_000`, floored.
 *
 * Idempotent: re-running the cron overwrites the same row via
 * `upsert({ where: { userId }, ... })`. Per-user errors are caught
 * and counted; one bad user never aborts the loop.
 *
 * Headers: `x-internal-key` validated against `T2000_INTERNAL_KEY`.
 */
export async function POST(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);

  // [v1.4.2 — Day 5] Active users = anyone with a chat session in the
  // last 30 days. SessionUsage keys on `address` (not userId), so we
  // pull distinct addresses then join to User to recover the cuid.
  const recentSessions = await prisma.sessionUsage.findMany({
    where: { createdAt: { gte: thirtyDaysAgo } },
    select: { address: true },
    distinct: ['address'],
  });

  const addresses = recentSessions.map((s) => s.address);
  if (addresses.length === 0) {
    return NextResponse.json({ created: 0, skipped: 0, errors: 0, total: 0 });
  }

  const users = await prisma.user.findMany({
    where: { suiAddress: { in: addresses } },
    select: { id: true, suiAddress: true },
  });

  let created = 0;
  let errors = 0;

  for (const user of users) {
    try {
      const [latest, previous, goals, pendingAdvice, lastSession] = await Promise.all([
        prisma.portfolioSnapshot.findFirst({
          where: { userId: user.id },
          orderBy: { date: 'desc' },
        }),
        prisma.portfolioSnapshot.findMany({
          where: { userId: user.id },
          orderBy: { date: 'desc' },
          take: 2,
        }),
        prisma.savingsGoal.findMany({
          where: { userId: user.id, status: { not: 'completed' } },
          orderBy: { createdAt: 'desc' },
          take: 3,
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
      ]);

      const previousSnapshot = previous.length > 1 ? previous[1] : null;
      const recentActivity = buildActivityFromSnapshots(latest, previousSnapshot);

      const daysSinceLastSession = lastSession
        ? Math.floor((Date.now() - lastSession.createdAt.getTime()) / 86_400_000)
        : 0;

      const openGoals = goals.map(
        (g) => `${g.name} — target $${g.targetAmount.toFixed(0)}`,
      );

      const data = {
        userId: user.id,
        address: user.suiAddress,
        savingsUsdc: latest?.savingsValueUsd ?? 0,
        debtUsdc: latest?.debtValueUsd ?? 0,
        walletUsdc: latest?.walletValueUsd ?? 0,
        healthFactor: latest?.healthFactor ?? null,
        currentApy: null as number | null,
        recentActivity,
        openGoals,
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
      console.error(`[financial-context-snapshot] Failed for ${user.id}: ${msg}`);
      errors++;
    }
  }

  return NextResponse.json({
    created,
    skipped: addresses.length - users.length,
    errors,
    total: addresses.length,
  });
}

/**
 * Build the 1–2 phrase activity summary from yesterday vs today's
 * portfolio snapshots. Mirrors the spec example
 * ("Saved $X. Borrowed $Y.") but lives here, not in a shared util,
 * because no other surface needs it.
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

  return parts.length > 0 ? parts.join('. ') + '.' : 'No changes since last snapshot.';
}
