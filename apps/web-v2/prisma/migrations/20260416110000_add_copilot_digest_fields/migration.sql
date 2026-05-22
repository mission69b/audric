-- Wave C.3 — Audric Copilot daily email digest
-- Adds opt-out, preferred local send hour, and dedup timestamp on User.

ALTER TABLE "User"
  ADD COLUMN "digestEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "digestSendHourLocal" INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN "lastDigestSentAt" TIMESTAMP(3);

-- Hourly digest cron filters by (digestEnabled, emailDeliverable, emailVerified, digestSendHourLocal).
-- The compound index lets the planner short-circuit the per-hour fanout.
CREATE INDEX "User_digestEnabled_emailDeliverable_digestSendHourLocal_idx"
  ON "User"("digestEnabled", "emailDeliverable", "digestSendHourLocal");
