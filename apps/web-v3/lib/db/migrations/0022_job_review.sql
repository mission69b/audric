CREATE TABLE IF NOT EXISTS "JobReview" (
	"jobId" text PRIMARY KEY NOT NULL,
	"seller" text NOT NULL,
	"buyer" text NOT NULL,
	"stars" integer NOT NULL,
	"text" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "JobReview_seller_createdAt_idx" ON "JobReview" USING btree ("seller","createdAt");