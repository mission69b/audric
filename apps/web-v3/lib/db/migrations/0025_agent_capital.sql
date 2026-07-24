CREATE TABLE IF NOT EXISTS "AgentToken" (
	"agent" text PRIMARY KEY NOT NULL,
	"coinType" text NOT NULL,
	"symbol" varchar(8) NOT NULL,
	"launcher" text NOT NULL,
	"boundAtMs" bigint NOT NULL,
	"boundTxDigest" text NOT NULL,
	"poolId" text,
	"lockId" text,
	"finalizedAtMs" bigint,
	"feesClaimedAgentRaw" bigint NOT NULL DEFAULT 0,
	"feesClaimedSuiRaw" bigint NOT NULL DEFAULT 0,
	"feeClaimCount" integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AgentToken_finalizedAtMs_idx" ON "AgentToken" ("finalizedAtMs");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AgentToken_coinType_idx" ON "AgentToken" ("coinType");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "FeeClaim" (
	"id" text PRIMARY KEY NOT NULL,
	"lockId" text NOT NULL,
	"agent" text NOT NULL,
	"coinTypeA" text NOT NULL,
	"coinTypeB" text NOT NULL,
	"amountA" bigint NOT NULL,
	"amountB" bigint NOT NULL,
	"txDigest" text NOT NULL,
	"timestampMs" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "FeeClaim_agent_idx" ON "FeeClaim" ("agent","timestampMs");
