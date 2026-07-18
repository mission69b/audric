CREATE TABLE IF NOT EXISTS "EscrowJob" (
	"jobId" text PRIMARY KEY NOT NULL,
	"buyer" text NOT NULL,
	"seller" text NOT NULL,
	"amountMicroUsdc" bigint NOT NULL,
	"feeBps" integer NOT NULL,
	"rejectSplitBps" integer NOT NULL,
	"deliverByMs" bigint NOT NULL,
	"reviewWindowMs" bigint NOT NULL,
	"state" varchar(12) NOT NULL,
	"deliveryHash" text,
	"feeAmountMicroUsdc" bigint,
	"byTimeout" boolean,
	"createdTxDigest" text NOT NULL,
	"createdAtMs" bigint NOT NULL,
	"updatedAtMs" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "IndexerCursor" (
	"name" varchar(32) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "EscrowJob_seller_state_idx" ON "EscrowJob" USING btree ("seller","state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "EscrowJob_buyer_idx" ON "EscrowJob" USING btree ("buyer");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "EscrowJob_createdAtMs_idx" ON "EscrowJob" USING btree ("createdAtMs");