/**
 * Read-only billing inspector — prints a user's credit balance, ledger rows,
 * subscription tier, terms acceptance, and Stripe customer for one address.
 * No writes. Run against whichever DB you're inspecting:
 *   pnpm check-billing <0xAddr>                       # .env.local POSTGRES_URL
 *   POSTGRES_URL=<prod-url> pnpm check-billing <0xAddr>
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
    console.error("usage: pnpm check-billing <0xPassportAddress>");
    process.exit(1);
  }
  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.error("✗ POSTGRES_URL not set.");
    process.exit(1);
  }
  const db = drizzle(postgres(url));

  const [u] = await db.select().from(user).where(eq(user.id, address)).limit(1);
  const rows = await db
    .select()
    .from(creditLedger)
    .where(eq(creditLedger.userId, address));
  const balanceUsd =
    rows.reduce((s, r) => s + Number(r.amountMicros), 0) / 1_000_000;

  console.log("── user ──");
  console.log({
    exists: Boolean(u),
    username: u?.username ?? null,
    subscriptionTier: u?.subscriptionTier,
    termsAccepted: Boolean(u?.closedLoopAcceptedAt),
    stripeCustomerId: u?.stripeCustomerId ?? null,
    defaultPaymentMethodId: u?.defaultPaymentMethodId ?? null,
  });
  console.log(
    `── credit: $${balanceUsd.toFixed(2)} over ${rows.length} rows ──`
  );
  for (const r of rows) {
    console.log({
      type: r.type,
      usd: Number(r.amountMicros) / 1_000_000,
      ref: r.ref,
      at: r.createdAt,
    });
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("✗ check failed:", e);
  process.exit(1);
});
