-- Audric Copilot — Phase 0 schema migration
-- See audric-copilot-smart-confirmations.plan.md §10 for the data model rationale.
-- Adds: User flags for Copilot, ScheduledAction surfacing columns, CopilotSuggestion table.
-- Behaviour-neutral on its own (gated by COPILOT_ENABLED env var, off by default).

-- ─── User: Copilot-related columns ────────────────────────────────────────────
ALTER TABLE "User"
  ADD COLUMN "emailDeliverable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "lastDashboardVisitAt" TIMESTAMP(3),
  ADD COLUMN "copilotConfirmedCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "copilotMigrationNoticeShownAt" TIMESTAMP(3);

-- ─── ScheduledAction: surfacing fields for behaviour_detected suggestions ────
-- Only meaningful for source = 'behavior_detected' rows; user-created schedules ignore these.
ALTER TABLE "ScheduledAction"
  ADD COLUMN "surfaceStatus" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "surfacedAt" TIMESTAMP(3),
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "failedAttempts" INTEGER NOT NULL DEFAULT 0;

-- Indexes for dashboard UNION query, expiry sweep, and 24h cron-level throttle
CREATE INDEX "ScheduledAction_userId_source_surfaceStatus_idx"
  ON "ScheduledAction"("userId", "source", "surfaceStatus");

CREATE INDEX "ScheduledAction_expiresAt_surfaceStatus_idx"
  ON "ScheduledAction"("expiresAt", "surfaceStatus");

CREATE INDEX "ScheduledAction_userId_patternType_createdAt_idx"
  ON "ScheduledAction"("userId", "patternType", "createdAt");

-- ─── CopilotSuggestion: threshold-triggered one-shot suggestions ─────────────
-- Compound (NAVI rewards), Idle balance, Recurring income, HF top-up.
-- Recurring patterns live on ScheduledAction; this table is for non-recurring ops.
CREATE TABLE "CopilotSuggestion" (
  "id"             TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "type"           TEXT NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'pending',
  "payload"        JSONB NOT NULL,
  "expiresAt"      TIMESTAMP(3) NOT NULL,
  "surfacedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt"    TIMESTAMP(3),
  "skippedAt"      TIMESTAMP(3),
  "failedAt"       TIMESTAMP(3),
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "snoozedCount"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CopilotSuggestion_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CopilotSuggestion"
  ADD CONSTRAINT "CopilotSuggestion_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "CopilotSuggestion_userId_status_idx"
  ON "CopilotSuggestion"("userId", "status");

CREATE INDEX "CopilotSuggestion_expiresAt_status_idx"
  ON "CopilotSuggestion"("expiresAt", "status");

CREATE INDEX "CopilotSuggestion_userId_type_createdAt_idx"
  ON "CopilotSuggestion"("userId", "type", "createdAt");
