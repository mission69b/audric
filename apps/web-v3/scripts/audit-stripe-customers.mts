/**
 * Audit: every user with a stored stripeCustomerId — verify it's a valid LIVE
 * customer. Flags any that 404 / are deleted (e.g. clobbered to a test customer).
 * Read-only.
 *   STRIPE_LIVE_KEY=sk_live_… npx tsx --env-file=.env.local scripts/audit-stripe-customers.mts
 */
import postgres from "postgres";
import Stripe from "stripe";

const liveKey = process.env.STRIPE_LIVE_KEY;
if (!liveKey) {
  throw new Error("set STRIPE_LIVE_KEY=sk_live_…");
}
const stripe = new Stripe(liveKey);
const sql = postgres(process.env.POSTGRES_URL ?? "", { max: 1 });

const users = await sql<
  { id: string; email: string | null; stripeCustomerId: string }[]
>`select id, email, "stripeCustomerId" from "User" where "stripeCustomerId" is not null`;

let bad = 0;
for (const u of users) {
  try {
    const c = await stripe.customers.retrieve(u.stripeCustomerId);
    if ((c as { deleted?: boolean }).deleted) {
      console.log(`❌ DELETED  ${u.email}  ${u.stripeCustomerId}`);
      bad++;
    }
  } catch {
    console.log(`❌ NOT-IN-LIVE  ${u.email}  ${u.stripeCustomerId}`);
    bad++;
  }
}
console.log(`\nChecked ${users.length} users with a customer — ${bad} bad.`);
await sql.end();
