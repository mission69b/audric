/**
 * Reset a user's BILLING state for a clean mainnet/live-Stripe start.
 *
 * Wipes the append-only CreditLedger rows + the Stripe/subscription fields for
 * one address (test-mode customer/sub IDs can't be used with a live key, so
 * they must be cleared so a fresh live customer is created). KEEPS: the @audric
 * handle, chats/messages/artifacts, and closed-loop terms acceptance.
 *
 * Run from apps/web-v3:
 *   pnpm reset-billing <0xPassportAddress>            # uses .env.local POSTGRES_URL
 *   POSTGRES_URL=<prod-url> pnpm reset-billing <addr>  # target prod explicitly
 */

import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { creditLedger, user } from "../lib/db/schema";

dotenv.config({ path: ".env.local" });

async function main() {
  const address = process.argv[2];
  if (!address?.startsWith("0x")) {
    console.error("usage: pnpm reset-billing <0xPassportAddress>");
    process.exit(1);
  }
  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.error("✗ POSTGRES_URL not set.");
    process.exit(1);
  }

  const db = drizzle(postgres(url));

  const deleted = await db
    .delete(creditLedger)
    .where(eq(creditLedger.userId, address))
    .returning({ id: creditLedger.id });

  await db
    .update(user)
    .set({
      subscriptionTier: "free",
      subscriptionStatus: null,
      stripeSubscriptionId: null,
      stripeCustomerId: null,
      defaultPaymentMethodId: null,
      autoRechargeEnabled: false,
      updatedAt: new Date(),
    })
    .where(eq(user.id, address));

  console.log(
    `✓ Reset billing for ${address}: deleted ${deleted.length} credit-ledger rows, reset tier→free + cleared Stripe customer/sub/PM. Kept: handle, chats, terms.`
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("✗ reset failed:", e);
  process.exit(1);
});
