ALTER TABLE "Document" ADD COLUMN "model" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Document_userId_kind_createdAt_idx" ON "Document" USING btree ("userId","text","createdAt");