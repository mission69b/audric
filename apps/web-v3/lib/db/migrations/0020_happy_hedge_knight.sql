CREATE TABLE IF NOT EXISTS "AgentOffering" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agentAddress" text NOT NULL,
	"slug" varchar(48) NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" text NOT NULL,
	"priceMicroUsdc" bigint NOT NULL,
	"slaMinutes" integer NOT NULL,
	"reviewWindowMinutes" integer DEFAULT 1440 NOT NULL,
	"rejectSplitBps" integer DEFAULT 8000 NOT NULL,
	"requirements" json,
	"deliverable" text NOT NULL,
	"retiredAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "JobSpec" (
	"hash" varchar(64) PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "AgentOffering" ADD CONSTRAINT "AgentOffering_agentAddress_AgentProfile_address_fk" FOREIGN KEY ("agentAddress") REFERENCES "public"."AgentProfile"("address") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "AgentOffering_agent_slug_unique" ON "AgentOffering" USING btree ("agentAddress","slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AgentOffering_agentAddress_idx" ON "AgentOffering" USING btree ("agentAddress");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AgentOffering_retiredAt_createdAt_idx" ON "AgentOffering" USING btree ("retiredAt","createdAt");