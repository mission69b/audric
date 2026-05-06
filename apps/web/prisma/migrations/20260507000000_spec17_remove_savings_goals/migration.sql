-- ============================================================================
-- SPEC 17 — Savings Goals Removal (Product Simplification)
-- ============================================================================
-- Drops the SavingsGoal table + all FK references + UserFinancialContext.openGoals.
--
-- Companion to:
--   - 20260413120000_simplification_drop_dead_features (April 2026 simplification
--     that retired SavingsGoal.currentMilestone but kept the table)
--   - 20260505063500_rip_spec9_p93_goal_table (S.64 — dropped the unrelated
--     SPEC 9 P93 Goal table and explicitly deferred this broader removal as
--     "a separate pass after broader product simplification" — that pass is now)
--
-- Rationale (per spec/SPEC_17_SAVINGS_GOAL_REMOVAL.md):
--   - Goals add a fourth thing to the savings story (USDC + USDsui save → NAVI
--     position → goals). Three is at the upper bound of working memory.
--   - Goals are not actually consumed by the agent — the system-prompt section
--     costs ~50 tokens/turn and produces zero observable behavior change.
--   - The "track my savings progress" job-to-be-done is better served by
--     `health_check` + `portfolio_overview` + `yield_summary`.
--
-- Deploy plan (Phase F):
--   1. Take a NeonDB branch snapshot of the production DB.
--   2. Apply on staging first; smoke-test:
--        - chat completion rate baseline-equivalent
--        - settings page loads without GoalsPanel
--        - financial-context-snapshot cron succeeds without openGoals field
--        - record_advice writes succeed without goalId reference
--   3. Apply on prod after-hours.
--
-- D-1a (locked): hard-drop everything in one migration. CASCADE handles
-- dangling refs. NeonDB 30d snapshot retention covers any rollback need.
-- ============================================================================

-- Drop FK constraints first (avoids "FK violation" on table drop)
ALTER TABLE "AdviceLog" DROP CONSTRAINT IF EXISTS "AdviceLog_goalId_fkey";

-- Drop AppEvent.goalId column + index (no FK constraint to drop — was untyped)
DROP INDEX IF EXISTS "AppEvent_goalId_idx";
ALTER TABLE "AppEvent" DROP COLUMN IF EXISTS "goalId";

-- Drop AdviceLog.goalId column
ALTER TABLE "AdviceLog" DROP COLUMN IF EXISTS "goalId";

-- Drop the SavingsGoal table itself (CASCADE handles dangling refs from
-- AdviceLog.goalId / AppEvent.goalId — but they're already nulled above)
DROP TABLE IF EXISTS "SavingsGoal" CASCADE;

-- Drop UserFinancialContext.openGoals JSON field (snapshot dependency removed —
-- the daily financial-context-snapshot cron will skip the openGoals query
-- starting in Phase B; without this column drop, the schema would advertise
-- a field that nothing populates anymore)
ALTER TABLE "UserFinancialContext" DROP COLUMN IF EXISTS "openGoals";
