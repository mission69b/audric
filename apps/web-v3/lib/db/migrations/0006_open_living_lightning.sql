CREATE TABLE IF NOT EXISTS "ApiKey" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"hashedKey" text NOT NULL,
	"keyPrefix" varchar(16) NOT NULL,
	"name" varchar(64),
	"lastUsedAt" timestamp,
	"revokedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ApiKey_hashedKey_unique" ON "ApiKey" USING btree ("hashedKey");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ApiKey_userId_idx" ON "ApiKey" USING btree ("userId");