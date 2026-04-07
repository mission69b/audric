-- Drop unused LlmUsage table (never written to by application code)
DROP TABLE IF EXISTS "LlmUsage";

-- Create SessionUsage: one row per engine invocation (chat or resume request)
CREATE TABLE "SessionUsage" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "toolNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionUsage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SessionUsage_address_createdAt_idx" ON "SessionUsage"("address", "createdAt");
CREATE INDEX "SessionUsage_sessionId_idx" ON "SessionUsage"("sessionId");
CREATE INDEX "SessionUsage_createdAt_idx" ON "SessionUsage"("createdAt");
