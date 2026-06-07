/**
 * [v0.7c Phase 6.5 / S.253 — 2026-05-22] Portfolio snapshot job —
 * web-v2 port. Verbatim copy of `apps/web/lib/jobs/portfolio-snapshot.ts`
 * (originally landed v0.7d Phase 6 Block B / S.222). Mirrored here so
 * web-v2 owns the cron during the v0.7c chat-flip + DNS-flip window.
 *
 * Feeds the historical portfolio-totals timeline canvas. (Pre-S.375 it
 * also fed the `UserFinancialContext` snapshot's `recentActivity` field;
 * that daily snapshot was retired, so this cron now serves the timeline
 * only.)
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
 * failure mode the retired `financial-context-snapshot.ts` hit: sequential per-user
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

/**
 * [S.359 — 2026-06-04] Production batch config (tames the 07:00 UTC 429
 * storm). SPEC 272 Lever 1 (S.278) bounded USER-level concurrency to 10,
 * but each `getPortfolio()` itself fans out to ~3 BlockVision logical
 * calls (wallet + DeFi + prices) plus a ~9-way per-protocol DeFi sweep
 * and a Sui RPC read. At N=10 the per-batch peak was ~120 concurrent
 * upstream requests — enough to trip BlockVision's "10 429s in 5000ms"
 * circuit breaker every morning + degrade prices mid-snapshot. N=3 keeps
 * per-batch BV logical calls (~9) structurally UNDER the breaker
 * threshold; the 1000ms inter-batch pacing lets any transient pressure
 * clear. Wall-time @ ~165 users ≈ 136s, comfortably under the 300s
 * `maxDuration` cap (the regression SPEC 272 originally fixed). The
 * runner's own defaults (10/500) are intentionally left unchanged —
 * these are the production overrides, and tests still pass explicit
 * values to `runInBatches`.
 */
const PRODUCTION_BATCH_SIZE = 3;
const PRODUCTION_INTRA_BATCH_DELAY_MS = 1000;

export interface PortfolioSnapshotResult {
  created: number;
  errors: number;
  skipped: number;
  total: number;
}

export interface PortfolioSnapshotOptions {
  /** [S.278/S.359] Override the production batch size (3). Used in tests. */
  batchSize?: number;
  /** [S.278/S.359] Override the production intra-batch delay (1000ms). Used in tests. */
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
    batchSize: options.batchSize ?? PRODUCTION_BATCH_SIZE,
    intraBatchDelayMs:
      options.intraBatchDelayMs ?? PRODUCTION_INTRA_BATCH_DELAY_MS,
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
