-- S.22 — Drop the orphaned PublicReport table.
--
-- The audric.ai/report/[address] public wallet report was deleted in S.22
-- (commit 1924f8f). The model was removed from schema.prisma and the
-- generated client regenerated, but the production table was left in place
-- to keep the deletion commit non-destructive.
--
-- This migration drops the now-orphaned table and its indexes. The table
-- was originally created via `prisma db push` (no prior migration ever
-- created it — see commit 4f15b46 for Phase E ship), so we use IF EXISTS
-- to keep this idempotent for fresh environments that never had it.

DROP TABLE IF EXISTS "PublicReport";
