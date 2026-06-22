/**
 * Repair: repoint a user's DB stripeCustomerId back to their REAL live customer
 * (the one that owns their active subscription + saved card) after a bad
 * recreate. Read-only on Stripe; the DB write only happens for a clear winner.
 *
 *   STRIPE_LIVE_KEY=sk_live_… npx tsx --env-file=.env.local \
 *     scripts/restore-stripe-customer.mts funkiirabu@gmail.com
 *
 * (STRIPE_LIVE_KEY is read separately so it doesn't clash with the test
 *  STRIPE_SECRET_KEY in .env.local; POSTGRES_URL comes from .env.local.)
 */
import postgres from "postgres";
import Stripe from "stripe";

const email = process.argv[2];
const liveKey = process.env.STRIPE_LIVE_KEY;
if (!(email && liveKey)) {
  throw new Error(
    "usage: STRIPE_LIVE_KEY=sk_live_… tsx restore-stripe-customer.mts <email>"
  );
}

const stripe = new Stripe(liveKey);
const sql = postgres(process.env.POSTGRES_URL ?? "", { max: 1 });

const customers = await stripe.customers.list({ email, limit: 100 });
const candidates: {
  id: string;
  created: string;
  activeSubs: number;
  cards: number;
}[] = [];

for (const c of customers.data) {
  const subs = await stripe.subscriptions.list({
    customer: c.id,
    status: "all",
    limit: 20,
  });
  const activeSubs = subs.data.filter((s) =>
    ["active", "trialing", "past_due"].includes(s.status)
  ).length;
  const pms = await stripe.paymentMethods.list({
    customer: c.id,
    type: "card",
    limit: 20,
  });
  candidates.push({
    id: c.id,
    created: new Date(c.created * 1000).toISOString(),
    activeSubs,
    cards: pms.data.length,
  });
}

console.log(`\nLIVE customers for ${email}:`);
for (const c of candidates) {
  console.log(
    `  ${c.id}  created ${c.created}  activeSubs=${c.activeSubs}  cards=${c.cards}`
  );
}

// The customer that owns an active subscription is authoritative; else the one
// with a saved card.
const best =
  candidates.find((c) => c.activeSubs > 0) ??
  candidates.find((c) => c.cards > 0);

const [dbRow] = await sql`
  select "stripeCustomerId" from "User" where email ilike ${email} limit 1`;
console.log(`\nDB currently points to: ${dbRow?.stripeCustomerId ?? "(none)"}`);

if (!best) {
  console.log("⚠️  No customer with an active sub or card — restore manually.");
} else if (best.id === dbRow?.stripeCustomerId) {
  console.log(`✅ DB already points to the right customer (${best.id}).`);
} else {
  await sql`
    update "User" set "stripeCustomerId" = ${best.id}, "updatedAt" = now()
    where email ilike ${email}`;
  console.log(`✅ RESTORED DB stripeCustomerId → ${best.id}`);
}

await sql.end();
