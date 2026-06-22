CREATE TABLE IF NOT EXISTS "Referral" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrerId" text NOT NULL,
	"refereeId" text NOT NULL,
	"code" text NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"rewardedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN "referralCode" varchar(12);--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN "referredBy" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_User_id_fk" FOREIGN KEY ("referrerId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Referral" ADD CONSTRAINT "Referral_refereeId_User_id_fk" FOREIGN KEY ("refereeId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Referral_referee_unique" ON "Referral" USING btree ("refereeId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Referral_referrer_idx" ON "Referral" USING btree ("referrerId");--> statement-breakpoint
ALTER TABLE "User" ADD CONSTRAINT "User_referralCode_unique" UNIQUE("referralCode");