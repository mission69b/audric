/**
 * Delete a stray TEST-mode Stripe customer (e.g. the clobbered cus_UkTFl…).
 * Uses the TEST key. Refuses to touch a live customer.
 *   STRIPE_TEST_KEY=sk_test_… npx tsx --env-file=.env.local scripts/delete-test-customer.mts cus_xxx
 */
import Stripe from "stripe";

const key = process.env.STRIPE_TEST_KEY;
if (!key?.startsWith("sk_test_")) {
  throw new Error("set STRIPE_TEST_KEY=sk_test_…");
}
const id = process.argv[2];
if (!id) {
  throw new Error("pass a customer id: … delete-test-customer.mts cus_xxx");
}
const stripe = new Stripe(key);

try {
  const c = await stripe.customers.retrieve(id);
  if ((c as { deleted?: boolean }).deleted) {
    console.log(`already deleted: ${id}`);
  } else {
    const cust = c as Stripe.Customer;
    console.log(
      `found TEST customer ${id}  email=${cust.email ?? "(none)"}  livemode=${cust.livemode}`
    );
    if (cust.livemode) {
      throw new Error("refusing: this is a LIVE customer, not test");
    }
    const d = await stripe.customers.del(id);
    console.log(`deleted ✅ ${d.id} deleted=${d.deleted}`);
  }
} catch (e) {
  console.log(`not deletable: ${(e as Error).message}`);
}
