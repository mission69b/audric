/**
 * One-off: clear a user's Stripe links so they start fresh (e.g. after test-mode
 * usage polluted the shared DB with a test customer / payment method).
 *   npx tsx --env-file=.env.local scripts/reset-stripe.mts <email>
 */
import postgres from "postgres";

const email = process.argv[2];
if (!email) {
  throw new Error("usage: reset-stripe.mts <email>");
}
const sql = postgres(process.env.POSTGRES_URL ?? "", { max: 1 });
const rows = await sql`
  update "User"
  set "stripeCustomerId" = null,
      "defaultPaymentMethodId" = null,
      "autoRechargeEnabled" = false,
      "updatedAt" = now()
  where email ilike ${email}
  returning id, email, "stripeCustomerId", "defaultPaymentMethodId"`;
console.log("reset:", rows);
await sql.end();
