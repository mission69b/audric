import fs from "node:fs";
import Stripe from "stripe";

const key = fs
  .readFileSync(".env.local", "utf8")
  .match(/^STRIPE_SECRET_KEY=(.+)$/m)[1]
  .trim()
  .replace(/^["']|["']$/g, "");
const stripe = new Stripe(key);

const CUST = "cus_UjPc9d7OMIhrYc"; // funkiirabu DB stripeCustomerId
const DB_DEFAULT_PM = "pm_1TjwnJGT7vma4YHNGBcJUJHv";

const cust = await stripe.customers.retrieve(CUST);
console.log("customer:", CUST, "deleted:", cust.deleted, "email:", cust.email);
console.log(
  "invoice_settings.default_payment_method:",
  cust.deleted ? "-" : cust.invoice_settings?.default_payment_method
);

const pms = await stripe.paymentMethods.list({ customer: CUST, type: "card" });
console.log(
  "attached card PMs:",
  pms.data.map((p) => `${p.id} ${p.card?.last4}`)
);

const subs = await stripe.subscriptions.list({ customer: CUST, status: "all", limit: 5 });
console.log(
  "subscriptions:",
  subs.data.map((s) => `${s.id} ${s.status} defaultPm=${s.default_payment_method}`)
);

// Is the DB's default PM actually attached anywhere / to whom?
try {
  const pm = await stripe.paymentMethods.retrieve(DB_DEFAULT_PM);
  console.log("DB default PM", DB_DEFAULT_PM, "attached to customer:", pm.customer);
} catch (e) {
  console.log("DB default PM retrieve failed:", e.message);
}
await Promise.resolve();
