-- AlterTable
ALTER TABLE "User" ADD COLUMN "tosAcceptedAt" TIMESTAMP(3);

-- Backfill: mark all existing users as onboarded so they don't see the WelcomeCard.
-- Only truly new users (created after this migration) should see it.
-- Do NOT backfill tosAcceptedAt — existing users must accept the updated ToS.
UPDATE "User" SET "onboardedAt" = NOW() WHERE "onboardedAt" IS NULL;
