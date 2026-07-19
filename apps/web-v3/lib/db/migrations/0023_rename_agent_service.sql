-- Rename AgentOffering -> AgentService (the v10 "offering" purge, DB layer).
-- Pure renames: no shape change, no data movement.
ALTER TABLE "AgentOffering" RENAME TO "AgentService";--> statement-breakpoint
ALTER TABLE "AgentService" RENAME CONSTRAINT "AgentOffering_agentAddress_AgentProfile_address_fk" TO "AgentService_agentAddress_AgentProfile_address_fk";--> statement-breakpoint
ALTER INDEX "AgentOffering_agent_slug_unique" RENAME TO "AgentService_agent_slug_unique";--> statement-breakpoint
ALTER INDEX "AgentOffering_agentAddress_idx" RENAME TO "AgentService_agentAddress_idx";--> statement-breakpoint
ALTER INDEX "AgentOffering_retiredAt_createdAt_idx" RENAME TO "AgentService_retiredAt_createdAt_idx";
