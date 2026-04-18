-- ============================================================================
-- Audric simplification — destructive cleanup migration
-- ============================================================================
--
-- Drops the schema surface that supported retired features (copilot,
-- briefings, scheduled actions, follow-ups, outcome checks, notification
-- prefs/log, on-chain allowance billing, savings goal milestones).
--
-- This migration is **destructive**. Run order:
--   1. Take a NeonDB branch snapshot of the production DB.
--   2. Apply on staging first; smoke-test (chat, save, activity feed,
--      AdviceLog write, SavingsGoal CRUD).
--   3. Apply on prod after-hours.
--
-- CASCADE on every DROP TABLE resolves any dangling FK from kept models
-- (e.g. AdviceLog.outcomeChecks) — no manual relation cleanup needed.
--
-- See `spec/day1-audit-findings.md` Decision 2 (binding amendment to
-- AUDRIC_FINANCE_SIMPLIFICATION_SPEC_v1.4.md) for rationale.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Drop dead User columns (10) + composite index that referenced them
-- ---------------------------------------------------------------------------
ALTER TABLE "User"
  DROP COLUMN IF EXISTS "onboardedAt",
  DROP COLUMN IF EXISTS "emailDeliverable",
  DROP COLUMN IF EXISTS "lastDashboardVisitAt",
  DROP COLUMN IF EXISTS "copilotConfirmedCount",
  DROP COLUMN IF EXISTS "copilotMigrationNoticeShownAt",
  DROP COLUMN IF EXISTS "digestEnabled",
  DROP COLUMN IF EXISTS "digestSendHourLocal",
  DROP COLUMN IF EXISTS "lastDigestSentAt",
  DROP COLUMN IF EXISTS "hfWidgetEnabled",
  DROP COLUMN IF EXISTS "copilotEmailNudgeShownAt";

DROP INDEX IF EXISTS "User_digestEnabled_emailDeliverable_digestSendHourLocal_idx";

-- ---------------------------------------------------------------------------
-- Drop dead UserPreferences columns
-- (allowanceId — on-chain allowance flow retired; dcaSchedules — never used)
-- ---------------------------------------------------------------------------
ALTER TABLE "UserPreferences"
  DROP COLUMN IF EXISTS "allowanceId",
  DROP COLUMN IF EXISTS "dcaSchedules";

-- ---------------------------------------------------------------------------
-- Drop dead SavingsGoal column (milestone celebration emails retired)
-- ---------------------------------------------------------------------------
ALTER TABLE "SavingsGoal" DROP COLUMN IF EXISTS "currentMilestone";

-- ---------------------------------------------------------------------------
-- Drop dead AdviceLog columns + indexes (follow-up/outcome flow retired)
-- The remaining AdviceLog table still backs `record_advice` + advice context.
-- ---------------------------------------------------------------------------
ALTER TABLE "AdviceLog"
  DROP COLUMN IF EXISTS "actionTaken",
  DROP COLUMN IF EXISTS "followUpDue",
  DROP COLUMN IF EXISTS "followUpSent",
  DROP COLUMN IF EXISTS "outcomeStatus";

DROP INDEX IF EXISTS "AdviceLog_outcomeStatus_idx";
DROP INDEX IF EXISTS "AdviceLog_followUpDue_idx";

-- ---------------------------------------------------------------------------
-- Drop deleted tables (order doesn't matter with CASCADE)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS "ScheduledExecution" CASCADE;
DROP TABLE IF EXISTS "ScheduledAction" CASCADE;
DROP TABLE IF EXISTS "CopilotSuggestion" CASCADE;
DROP TABLE IF EXISTS "DailyBriefing" CASCADE;
DROP TABLE IF EXISTS "OutcomeCheck" CASCADE;
DROP TABLE IF EXISTS "FollowUpQueue" CASCADE;
DROP TABLE IF EXISTS "SavingsGoalDeposit" CASCADE;
DROP TABLE IF EXISTS "IntentLog" CASCADE;
DROP TABLE IF EXISTS "NotificationPrefs" CASCADE;
DROP TABLE IF EXISTS "NotificationLog" CASCADE;
