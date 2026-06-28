CREATE TABLE IF NOT EXISTS "ApiUsageEvent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"keyId" uuid NOT NULL,
	"model" varchar(96) NOT NULL,
	"inputTokens" integer DEFAULT 0 NOT NULL,
	"outputTokens" integer DEFAULT 0 NOT NULL,
	"costMicros" bigint DEFAULT 0 NOT NULL,
	"privacyTier" varchar NOT NULL,
	"ref" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ApiUsageEvent" ADD CONSTRAINT "ApiUsageEvent_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ApiUsageEvent" ADD CONSTRAINT "ApiUsageEvent_keyId_ApiKey_id_fk" FOREIGN KEY ("keyId") REFERENCES "public"."ApiKey"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ApiUsageEvent_userId_createdAt_idx" ON "ApiUsageEvent" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ApiUsageEvent_ref_unique" ON "ApiUsageEvent" USING btree ("ref");