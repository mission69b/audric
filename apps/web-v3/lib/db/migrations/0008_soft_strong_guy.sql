CREATE TABLE IF NOT EXISTS "AgentProfile" (
	"address" text PRIMARY KEY NOT NULL,
	"numericId" integer,
	"name" text NOT NULL,
	"owner" text,
	"metadataUri" text,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AgentProfile_active_createdAt_idx" ON "AgentProfile" USING btree ("active","createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AgentProfile_owner_idx" ON "AgentProfile" USING btree ("owner");