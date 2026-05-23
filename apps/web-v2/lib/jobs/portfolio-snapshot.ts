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
 *
 * [S.278 / SPEC 272 Lever 1 — 2026-05-23] Bounded-batch fan-out. Same
 * failure mode as `financial-context-snapshot.ts`: sequential per-user
 * loop fanning out to BlockVision was exceeding Vercel's 300s
 * `maxDuration` cap on bad days. Replaced with `runInBatches` (N=10
 * users in parallel, M=500ms intra-batch delay). Per-batch BV pressure
 * is bounded the same way; the existing per-user try/catch + idempotent
 * `findUnique → create` are preserved verbatim.
 */

import { getTelemetrySink } from "@t2000/engine";
import { runInBatches } from "@/lib/jobs/batch-runner";
import { getPortfolio } from "@/lib/portfolio";
import { prisma } from "@/lib/prisma";

export interface PortfolioSnapshotResult {
  created: number;
  errors: number;
  skipped: number;
  total: number;
}

export interface PortfolioSnapshotOptions {
  /** [S.278] Override the default batch size (10). Used in tests. */
  batchSize?: number;
  /** [S.278] Override the default intra-batch delay (500ms). Used in tests. */
  intraBatchDelayMs?: number;
}

type UserRow = { id: string; suiAddress: string };
type UserOutcome = "created" | "skipped" | "error";

export async function runPortfolioSnapshotJob(
  options: PortfolioSnapshotOptions = {}
): Promise<PortfolioSnapshotResult> {
  const jobStart = Date.now();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const users: UserRow[] = await prisma.user.findMany({
    select: { id: true, suiAddress: true },
  });

  const sink = getTelemetrySink();

  const { results } = await runInBatches<UserRow, UserOutcome>({
    items: users,
    batchSize: options.batchSize,
    intraBatchDelayMs: options.intraBatchDelayMs,
    process: (user) => processOneUser(user, today),
    onBatchComplete: ({ batchIndex, batchSize, durationMs }) => {
      sink.histogram("cron.portfolio_snapshot_batch_duration_ms", durationMs, {
        batch: String(batchIndex),
        size: String(batchSize),
      });
    },
  });

  let created = 0;
  let skipped = 0;
  let errors = 0;
  for (const r of results) {
    if (r.status === "rejected") {
      console.error(
        "[portfolio-snapshot] unexpected unhandled rejection:",
        r.reason instanceof Error ? r.reason.message : r.reason
      );
      errors++;
      continue;
    }
    if (r.value === "created") {
      created++;
    } else if (r.value === "skipped") {
      skipped++;
    } else {
      errors++;
    }
  }

  sink.histogram("cron.portfolio_snapshot_duration_ms", Date.now() - jobStart, {
    result: errors === 0 ? "ok" : "partial",
  });

  return { created, skipped, errors, total: users.length };
}

async function processOneUser(
  user: UserRow,
  today: Date
): Promise<UserOutcome> {
  try {
    const existing = await prisma.portfolioSnapshot.findUnique({
      where: { userId_date: { userId: user.id, date: today } },
    });
    if (existing) {
      return "skipped";
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
    return "created";
  } catch (err) {
    console.error(
      `[portfolio-snapshot] Error for ${user.suiAddress}:`,
      err instanceof Error ? err.message : err
    );
    return "error";
  }
}
