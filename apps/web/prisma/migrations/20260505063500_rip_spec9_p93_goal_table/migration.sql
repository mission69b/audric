-- [SPEC 9 v0.1.3 P9.3 RIP-OUT] Drop the Goal table.
--
-- Reasoning: persistent cross-turn todos via `update_todo {persist: true}`
-- proved redundant in practice. Audric already has SavingsGoal (structured
-- monetary targets) and AdviceLog (recommendation memory). The smoke test
-- showed the LLM correctly routed natural prompts to those existing tools:
--   "save $500 emergency fund"             → savings_goal_create (SavingsGoal)
--   "remind me to check HF every Monday"   → record_advice (AdviceLog)
-- and never selected `update_todo` for cross-session use cases. The Goal
-- table received zero meaningful writes during the smoke test.
--
-- The full broader goals system (SavingsGoal + savings_goal_* tools +
-- GoalsPanel UI) is being kept for now; that consolidation is a separate
-- pass after broader product simplification.
--
-- See audric-build-tracker.md S.64 for the full reasoning + smoke-test
-- evidence.

ALTER TABLE "Goal" DROP CONSTRAINT IF EXISTS "Goal_userId_fkey";
DROP INDEX IF EXISTS "Goal_userId_status_idx";
DROP TABLE IF EXISTS "Goal";
