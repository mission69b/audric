-- [v1.4 Item 4] HarnessMetrics — per-turn instrumentation row.
--
-- Purely additive table written fire-and-forget by the chat route at turn
-- close. No FK to User by design: we want metrics writes to never be
-- blocked by user-row consistency, and userId is enforced at the
-- application layer (Sui address from validated JWT).
--
-- Retention: 90 days, enforced by /api/cron/turn-metrics-cleanup
-- (Vercel cron at 0 3 * * *).

CREATE TABLE "TurnMetrics" (
    "id"                   TEXT NOT NULL,
    "sessionId"            TEXT NOT NULL,
    "userId"               TEXT NOT NULL,
    "turnIndex"            INTEGER NOT NULL,
    "effortLevel"          TEXT NOT NULL,
    "modelUsed"            TEXT NOT NULL,
    "wallTimeMs"           INTEGER NOT NULL,
    "firstTokenMs"         INTEGER NOT NULL,
    "toolsCalled"          JSONB NOT NULL,
    "guardsFired"          JSONB NOT NULL,
    "compactionTriggered"  BOOLEAN NOT NULL DEFAULT false,
    "contextTokensStart"   INTEGER NOT NULL,
    "cacheHit"             BOOLEAN NOT NULL DEFAULT false,
    "cacheReadTokens"      INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens"     INTEGER NOT NULL DEFAULT 0,
    "inputTokens"          INTEGER NOT NULL,
    "outputTokens"         INTEGER NOT NULL,
    "estimatedCostUsd"     DOUBLE PRECISION NOT NULL,
    "pendingActionYielded" BOOLEAN NOT NULL DEFAULT false,
    "pendingActionOutcome" TEXT,
    "aciRefinements"       INTEGER NOT NULL DEFAULT 0,
    "sessionSpendUsd"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TurnMetrics_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TurnMetrics_userId_createdAt_idx"      ON "TurnMetrics"("userId", "createdAt");
CREATE INDEX "TurnMetrics_sessionId_idx"             ON "TurnMetrics"("sessionId");
CREATE INDEX "TurnMetrics_effortLevel_modelUsed_idx" ON "TurnMetrics"("effortLevel", "modelUsed");
CREATE INDEX "TurnMetrics_createdAt_idx"             ON "TurnMetrics"("createdAt");
