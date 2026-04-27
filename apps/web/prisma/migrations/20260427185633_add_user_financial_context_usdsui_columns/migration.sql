-- [Bug 1c / 2026-04-27] Add USDsui breakouts to UserFinancialContext.
-- Both columns are nullable so existing rows continue to deserialize
-- through `getUserFinancialContext`; the prompt builder treats null
-- as "no USDsui line" and falls back to the USDC-only summary.
-- Backfill happens organically on the next 02:00 UTC cron tick once
-- `financial-context-snapshot/route.ts` starts populating these.
ALTER TABLE "UserFinancialContext" ADD COLUMN "walletUsdsui" DOUBLE PRECISION;
ALTER TABLE "UserFinancialContext" ADD COLUMN "savingsUsdsui" DOUBLE PRECISION;
