-- [S.373 — 2026-06-07] V07E_STALE_FINCONTEXT Phase 2 — drop the 6 volatile
-- columns from `UserFinancialContext`.
--
-- Phase 1 (S.242, 2026-05-22) stopped READING these from the
-- `<financial_context>` system-prompt block: their ≤24h-stale daily-cron
-- values let the LLM refuse write actions ("Save $5 USDC") off a snapshot
-- $0 balance even when the live wallet had funds. Since Phase 1 the only
-- writer was the cron (now trimmed in this same commit) and the only reader
-- (`lib/audric/financial-context.ts`) already ignored them.
--
-- Verified ZERO other consumers of the `UserFinancialContext` table before
-- this drop: the only `prisma.userFinancialContext.*` call sites are the
-- reader (4 stable fields) + the cron writer. The `healthFactor` reads
-- elsewhere in web-v2 are all on `PortfolioSnapshot`, a different table.
--
-- Balance / savings / debt / health-factor now come ONLY from fresh tool
-- calls (`balance_check`, `savings_info`, `health_check`) — by construction
-- the LLM can no longer refuse a write off a stale snapshot value.
--
-- IRREVERSIBLE. Take a Neon PITR snapshot if you need a rollback path.

-- AlterTable
ALTER TABLE "UserFinancialContext" DROP COLUMN IF EXISTS "savingsUsdc";
ALTER TABLE "UserFinancialContext" DROP COLUMN IF EXISTS "debtUsdc";
ALTER TABLE "UserFinancialContext" DROP COLUMN IF EXISTS "healthFactor";
ALTER TABLE "UserFinancialContext" DROP COLUMN IF EXISTS "walletUsdc";
ALTER TABLE "UserFinancialContext" DROP COLUMN IF EXISTS "walletUsdsui";
ALTER TABLE "UserFinancialContext" DROP COLUMN IF EXISTS "savingsUsdsui";
