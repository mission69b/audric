ALTER TABLE "AgentProfile" ADD COLUMN "pendingOwner" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AgentProfile_pendingOwner_idx" ON "AgentProfile" USING btree ("pendingOwner");