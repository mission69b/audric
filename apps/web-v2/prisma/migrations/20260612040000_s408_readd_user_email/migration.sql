-- [S.408 — 2026-06-12] Re-add User.email (S.261 reversal, outreach infra).
-- Captured from the zkLogin Google JWT email claim (verified only) at the
-- /api/user/status upsert. Additive + nullable: safe on live data.
ALTER TABLE "User" ADD COLUMN "email" TEXT;
