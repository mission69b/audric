/**
 * [v0.7c Phase 6.5 / S.253 — 2026-05-22] Financial context snapshot job —
 * web-v2 port. Verbatim copy of `apps/web/lib/jobs/financial-context-snapshot.ts`
 * (originally landed v0.7d Phase 6 Block B / S.222 on apps/web). Mirrored
 * here so web-v2 can take ownership of the cron during the v0.7c chat-flip
 * window without depending on apps/web being alive.
 *
 * **Dual-write window (intentional — 2026-05-22 → DNS flip).** Both apps
 * register the same cron at the same UTC time (02:30). They race on the
 * same `userFinancialContext.upsert by userId`. Upserts are idempotent;
 * the loser is a wasted DB roundtrip, not a correctness bug. When
 * `apps/web` is archived (v0.7c Phase 6 Session 8), the Vercel cron there
 * disappears automatically; this becomes the sole writer with zero
 * scheduling churn.
 *
 * Behavior (preserved verbatim from the apps/web original):
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
 *
 * [S.235 — 2026-05-21] fincontext-zero-bug fix. The previous logic at
 * L113-124 read per-asset detail fields (`walletAllocations.USDC`,
 * `positions.supplies.find(s => s.asset === 'USDC')`) which BlockVision
 * leaves EMPTY under degradation while top-line aggregates stay
 * positive. Effect: when BlockVision degraded mid-loop, the upsert
 * overwrote a previously-healthy `UserFinancialContext` row with
 * `walletUsdc=0 / walletUsdsui=0 / savingsUsdc=0 / savingsUsdsui=0 /
 * healthFactor=null` — feeding the LLM zeros for 24h until the next
 * cron run. Downstream: `<financial_context>` block (Layer 2 of the
 * F-4 5-layer system prompt) would render misleading "Savings: $0.00"
 * etc., quietly degrading agent context. Fix: gate the upsert on
 * `portfolio.source !== 'sui-rpc-degraded'` AND `portfolio.defiSource
 * !== 'degraded'`. `partial` and `partial-stale` DeFi states are still
 * trusted because we have at least some protocol data (and the
 * reader's 48h stale gate catches multi-day cron failures). Skipped
 * users retain their previous row — 24h-old positive data beats fresh
 * zeros every time. Brand-new users with no row + degraded BlockVision
 * → no row written, reader returns "" cleanly, agent falls back to
 * fresh tool calls (correct: never inject false zeros into the
 * system prompt).
 *
 * [S.278 / SPEC 272 Lever 1 — 2026-05-23] Bounded-batch fan-out. The
 * previous strict `for (const user of users)` sequential loop took
 * ~165 users × ~2s = ~330s — over Vercel's 300s `maxDuration` cap.
 * Tail users got truncated, ~6 UFC rows skipped per run. Replaced with
 * `runInBatches` (N=10 users in parallel, M=500ms intra-batch delay).
 * Worst-case wall time: 17 batches × ~3s ≈ ~51s. Per-batch BV pressure
 * stays bounded (10 users × 9 protocols at engine concurrency=3 = ~30
 * in-flight BV req at peak, well below the ~30 QPS/key soft cap that
 * trips the engine's 10-in-5s circuit breaker). Existing per-user
 * try/catch + S.235 degraded-skip gate are preserved verbatim.
 */

import { getTelemetrySink } from "@t2000/engine";
import { runInBatches } from "@/lib/jobs/batch-runner";
import { getPortfolio } from "@/lib/portfolio";
import { prisma } from "@/lib/prisma";

/**
 * [S.359 — 2026-06-04] Production batch config — same fix as
 * `portfolio-snapshot.ts`. The S.278 comment above assumed N=10 stayed
 * under the breaker ("10 users × 9 protocols at engine concurrency=3"),
 * but the live 07:00 UTC `portfolio-snapshot` burst proved the per-user
 * fan-out (3 BV logical calls + ~9-way per-protocol DeFi sweep + Sui RPC)
 * trips BlockVision's "10 429s in 5000ms" circuit breaker at N=10. This
 * cron shares the same `getPortfolio()` fan-out, so it gets the same cure:
 * N=3 keeps per-batch BV logical calls (~9) under the breaker threshold,
 * with 1000ms inter-batch pacing. Runner defaults (10/500) unchanged;
 * tests still pass explicit values.
 */
const PRODUCTION_BATCH_SIZE = 3;
const PRODUCTION_INTRA_BATCH_DELAY_MS = 1000;

export interface FinancialContextSnapshotResult {
  created: number;
  /**
   * [S.235] Count of users skipped because their `getPortfolio()`
   * read returned a degraded source flag (`source === 'sui-rpc-degraded'`
   * or `defiSource === 'degraded'`). Distinct from `skipped` (which
   * counts addresses without matching User rows). Their previous
   * `UserFinancialContext` row stays untouched — degradation skips
   * the upsert rather than overwriting with zeros.
   */
  degradedSkipped: number;
  errors: number;
  skipped: number;
  total: number;
}

export interface FinancialContextSnapshotOptions {
  /** [S.278/S.359] Override the production batch size (3). Used in tests. */
  batchSize?: number;
  /** [S.278/S.359] Override the production intra-batch delay (1000ms). Used in tests. */
  intraBatchDelayMs?: number;
  shard?: number;
  total?: number;
}

type UserRow = { id: string; suiAddress: string };
type UserOutcome = "created" | "degraded-skipped" | "error";

export async function runFinancialContextSnapshotJob(
  options: FinancialContextSnapshotOptions = {}
): Promise<FinancialContextSnapshotResult> {
  const shard = Math.max(0, Math.floor(options.shard ?? 0));
  const total = Math.max(1, Math.floor(options.total ?? 1));
  const shardStart = Date.now();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);

  const recentSessions = await prisma.sessionUsage.findMany({
    where: { createdAt: { gte: thirtyDaysAgo } },
    select: { address: true },
    distinct: ["address"],
  });

  const allAddresses = recentSessions.map((s) => s.address);
  const addresses = allAddresses.filter((_, i) => i % total === shard);

  if (addresses.length === 0) {
    getTelemetrySink().histogram(
      "cron.fin_ctx_shard_duration_ms",
      Date.now() - shardStart,
      { shard: String(shard), result: "ok" }
    );
    return { created: 0, skipped: 0, degradedSkipped: 0, errors: 0, total: 0 };
  }

  const users: UserRow[] = await prisma.user.findMany({
    where: { suiAddress: { in: addresses } },
    select: { id: true, suiAddress: true },
  });

  const sink = getTelemetrySink();

  const { results } = await runInBatches<UserRow, UserOutcome>({
    items: users,
    batchSize: options.batchSize ?? PRODUCTION_BATCH_SIZE,
    intraBatchDelayMs:
      options.intraBatchDelayMs ?? PRODUCTION_INTRA_BATCH_DELAY_MS,
    process: (user) => processOneUser(user),
    onBatchComplete: ({ batchIndex, batchSize, durationMs }) => {
      sink.histogram("cron.fin_ctx_batch_duration_ms", durationMs, {
        shard: String(shard),
        batch: String(batchIndex),
        size: String(batchSize),
      });
    },
  });

  let created = 0;
  let degradedSkipped = 0;
  let errors = 0;
  for (const r of results) {
    if (r.status === "rejected") {
      // Defense in depth — should never fire because `processOneUser`
      // catches its own errors. If it does, log and count.
      console.error(
        "[financial-context-snapshot] unexpected unhandled rejection:",
        r.reason instanceof Error ? r.reason.message : r.reason
      );
      errors++;
      continue;
    }
    if (r.value === "created") {
      created++;
    } else if (r.value === "degraded-skipped") {
      degradedSkipped++;
    } else {
      errors++;
    }
  }

  const shardResult = errors === 0 ? "ok" : "partial";
  sink.histogram("cron.fin_ctx_shard_duration_ms", Date.now() - shardStart, {
    shard: String(shard),
    result: shardResult,
  });
  sink.counter(
    "cron.fin_ctx_users_processed",
    { shard: String(shard) },
    addresses.length
  );
  if (degradedSkipped > 0) {
    sink.counter(
      "cron.fin_ctx_degraded_skipped",
      { shard: String(shard) },
      degradedSkipped
    );
  }

  return {
    created,
    skipped: addresses.length - users.length,
    degradedSkipped,
    errors,
    total: addresses.length,
  };
}

async function processOneUser(user: UserRow): Promise<UserOutcome> {
  try {
    const [previous, pendingAdvice, lastSession, portfolio] = await Promise.all(
      [
        prisma.portfolioSnapshot.findMany({
          where: { userId: user.id },
          orderBy: { date: "desc" },
          take: 2,
        }),
        prisma.adviceLog.findFirst({
          where: { userId: user.id, actedOn: false },
          orderBy: { createdAt: "desc" },
        }),
        prisma.sessionUsage.findFirst({
          where: { address: user.suiAddress },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
        getPortfolio(user.suiAddress),
      ]
    );

    const walletDegraded = portfolio.source === "sui-rpc-degraded";
    const defiDegraded = portfolio.defiSource === "degraded";
    if (walletDegraded || defiDegraded) {
      console.warn(
        `[financial-context-snapshot] Skipping ${user.id} due to degraded portfolio: walletSource=${portfolio.source}, defiSource=${portfolio.defiSource}`
      );
      return "degraded-skipped";
    }

    const latestSnapshot = previous[0] ?? null;
    const previousSnapshot = previous.length > 1 ? previous[1] : null;
    const recentActivity = buildActivityFromSnapshots(
      latestSnapshot,
      previousSnapshot
    );

    const daysSinceLastSession = lastSession
      ? Math.floor((Date.now() - lastSession.createdAt.getTime()) / 86_400_000)
      : 0;

    const walletUsdc = portfolio.walletAllocations.USDC ?? 0;
    const walletUsdsui = portfolio.walletAllocations.USDsui ?? 0;

    const usdsuiSupply = portfolio.positions.supplies.find(
      (s) => s.asset.toUpperCase() === "USDSUI"
    );
    const usdcSupply = portfolio.positions.supplies.find(
      (s) => s.asset.toUpperCase() === "USDC"
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
    return "created";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[financial-context-snapshot] Failed for ${user.id}: ${msg}`);
    return "error";
  }
}

function buildActivityFromSnapshots(
  latest: { savingsValueUsd: number; debtValueUsd: number } | null,
  previous: { savingsValueUsd: number; debtValueUsd: number } | null
): string {
  if (!latest) {
    return "No recent activity.";
  }
  if (!previous) {
    return `Savings: $${latest.savingsValueUsd.toFixed(2)} USDC.`;
  }

  const parts: string[] = [];
  const savingsDelta = latest.savingsValueUsd - previous.savingsValueUsd;
  if (Math.abs(savingsDelta) > 0.01) {
    parts.push(
      savingsDelta > 0
        ? `Saved $${savingsDelta.toFixed(2)}`
        : `Withdrew $${Math.abs(savingsDelta).toFixed(2)}`
    );
  }
  const debtDelta = latest.debtValueUsd - previous.debtValueUsd;
  if (Math.abs(debtDelta) > 0.01) {
    parts.push(
      debtDelta > 0
        ? `Borrowed $${debtDelta.toFixed(2)}`
        : `Repaid $${Math.abs(debtDelta).toFixed(2)}`
    );
  }

  return parts.length > 0
    ? `${parts.join(". ")}.`
    : "No changes since last snapshot.";
}
