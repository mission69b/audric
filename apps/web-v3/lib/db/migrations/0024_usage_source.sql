-- ApiUsageEvent joins in-app chat metering to the usage stream (S.777):
-- keyId becomes nullable (chat turns have no API key) and `source`
-- distinguishes api|chat rows. Existing rows are all source='api'.
ALTER TABLE "ApiUsageEvent" ALTER COLUMN "keyId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ApiUsageEvent" ADD COLUMN "source" varchar DEFAULT 'api' NOT NULL;
