-- [S.375 — 2026-06-07] Drop the `UserFinancialContext` table.
--
-- It backed the daily `<financial_context>` orientation snapshot, retired
-- in S.375. Post-S.373 the row held only 4 stable fields (currentApy,
-- pendingAdvice, recentActivity, daysSinceLastSession): pendingAdvice
-- duplicated AdviceLog, recentActivity + currentApy were already tool-
-- covered (transaction_history / activity_summary / rates_info /
-- savings_info), and daysSinceLastSession is trivially computable inline.
-- The marginal value (saving 1-2 orientation tool calls on greeting turns)
-- didn't justify the daily `getPortfolio()` BlockVision-fan-out cron + the
-- table. The LLM now orients via tools.
--
-- The S.373 column-drop migration (20260607000000_*) applied to this table;
-- this migration supersedes it by dropping the table outright. Migration
-- history is preserved (never edit applied migrations).

DROP TABLE IF EXISTS "UserFinancialContext";
