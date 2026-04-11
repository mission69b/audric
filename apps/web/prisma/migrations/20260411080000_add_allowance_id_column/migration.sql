-- AlterTable: add dedicated allowanceId column
ALTER TABLE "UserPreferences" ADD COLUMN "allowanceId" TEXT;

-- Backfill: copy allowanceId from the limits JSON blob into the new column
UPDATE "UserPreferences"
SET "allowanceId" = limits->>'allowanceId'
WHERE limits IS NOT NULL
  AND limits->>'allowanceId' IS NOT NULL
  AND limits->>'allowanceId' != '';
