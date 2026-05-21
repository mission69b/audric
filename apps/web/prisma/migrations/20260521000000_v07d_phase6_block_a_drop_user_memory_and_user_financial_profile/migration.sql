-- [v0.7d Phase 6 Block A — 2026-05-21 / S.221] Drop legacy memory pipeline tables.
--
-- Replaces the Anthropic-driven UserMemory / UserFinancialProfile
-- pipeline with MemWal `<memory_recall>` (web-v2 `prepareStep` —
-- shipped in Phase 1 / G2 / 2026-05-21, write side in Phase 2 / G3,
-- disclosure UI in Phase 3 / G4).
--
-- Both tables had foreign keys back to `User.id` (`UserMemory.userId`,
-- `UserFinancialProfile.userId`); their User-side relations
-- (`memories`, `financialProfile`) were dropped in the matching
-- schema.prisma change.
--
-- Read-cut + delete-impl order:
--   1. Pre-commit (db8bee8f t2000 + audric Block A code-only): all
--      reads + writes removed from production code paths.
--   2. This commit: drop the now-orphaned tables.
--
-- No backfill (per BENEFITS_SPEC_v07d D-14). MemWal will reconstruct
-- user memory organically from new turns; the founder's existing
-- production memory was preserved by MemWal's parallel write since
-- Phase 2 / G3.
--
-- Cascade is safe — no other table has a foreign key pointing at
-- these two.

DROP TABLE IF EXISTS "UserMemory" CASCADE;
DROP TABLE IF EXISTS "UserFinancialProfile" CASCADE;
