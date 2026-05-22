-- [v1.4.2] UserFinancialContext + AdviceLog.actedOn + TurnMetrics extras
--
-- Three-part schema migration that closes out the Day 3–5 work shipped in
-- audric#63 / t2000 v0.47.0. The Prisma schema landed with the feature
-- code; this migration is the matching SQL.
--
-- 1. AdviceLog.actedOn  (Day 3 / Spec §AdviceLog migration)
--    -----------------
--    BOOLEAN NOT NULL DEFAULT false. Pre-migration rows backfill to
--    `false` (treat as not yet acted on), which is the safe value: the
--    daily financial-context cron only surfaces unactioned advice as
--    `pendingAdvice`, so a stale `false` just means the user might re-see
--    a suggestion they already followed once. Worse than a stale `true`
--    in the other direction (would silently swallow new advice).
--
-- 2. TurnMetrics extras (Day 3 / Spec Item 3)
--    ------------------
--    Five additive columns + an index on `attemptId`:
--      - attemptId           TEXT NULL — per-yield UUID emitted by the
--                            engine on `pending_action`. Resume route's
--                            `prisma.turnMetrics.updateMany` keys on
--                            this instead of `(sessionId, turnIndex)`
--                            to eliminate the cross-attempt false-
--                            resolution that pair allows.
--      - synthetic           BOOLEAN NOT NULL DEFAULT false — true for
--                            pre-fetch / dispatch-intent turns so
--                            dashboards can exclude them from latency
--                            / cost percentiles without losing the
--                            instrumentation row.
--      - writeToolDurationMs INTEGER NULL — wall-clock ms reported by
--                            the host for client-side write tool
--                            execution (signing + broadcast + indexer-
--                            lag absorption). Written only on resume.
--      - cacheSavingsUsd     DOUBLE PRECISION NOT NULL DEFAULT 0 —
--                            estimated USD savings from prompt-cache
--                            reads on this turn.
--      - turnPhase           TEXT NOT NULL DEFAULT 'initial' —
--                            'initial' for chat-route close, 'resume'
--                            for the resume-route row written when the
--                            user resolves a pending action. Default
--                            'initial' is the safe value for backfilled
--                            rows (none of them carried a resume row).
--      - INDEX(attemptId)    Sparse but heavily queried by resume-side
--                            row lookups (per-row, per-resume).
--
-- 3. UserFinancialContext (Day 5 / Spec Item 6)
--    --------------------
--    New table, daily-rewritten by the t2000 server cron via the audric
--    internal API at /api/internal/financial-context-snapshot.
--    Dual-keyed (userId + address) because callers in the engine path
--    only know the wallet `address` (no Prisma `User.id` cuid), but
--    joins to `AdviceLog` / `SavingsGoal` / `PortfolioSnapshot` need
--    the cuid. Cached at `fin_ctx:${address}` in Upstash Redis (24h
--    TTL, fail-open).
--
-- All three changes are additive. Safe to run online: no locking surprises
-- on PostgreSQL because the new columns either (a) have a constant
-- default (covered by the fast-path metadata-only ALTER since PG 11) or
-- (b) are nullable. The new table needs zero existing-data backfill.

-- AlterTable
ALTER TABLE "AdviceLog" ADD COLUMN     "actedOn" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TurnMetrics" ADD COLUMN     "attemptId" TEXT,
ADD COLUMN     "cacheSavingsUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "synthetic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "turnPhase" TEXT NOT NULL DEFAULT 'initial',
ADD COLUMN     "writeToolDurationMs" INTEGER;

-- CreateTable
CREATE TABLE "UserFinancialContext" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "savingsUsdc" DOUBLE PRECISION NOT NULL,
    "debtUsdc" DOUBLE PRECISION NOT NULL,
    "healthFactor" DOUBLE PRECISION,
    "walletUsdc" DOUBLE PRECISION NOT NULL,
    "currentApy" DOUBLE PRECISION,
    "recentActivity" TEXT NOT NULL,
    "openGoals" JSONB NOT NULL,
    "pendingAdvice" TEXT,
    "daysSinceLastSession" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFinancialContext_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserFinancialContext_userId_key" ON "UserFinancialContext"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserFinancialContext_address_key" ON "UserFinancialContext"("address");

-- CreateIndex
CREATE INDEX "TurnMetrics_attemptId_idx" ON "TurnMetrics"("attemptId");
