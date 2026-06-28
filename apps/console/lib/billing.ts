import "server-only";

import { getUserById, setStripeCustomerId } from "@audric/accounts";
import Stripe from "stripe";

// Thin Stripe glue for the console (funding edge only). The money-critical
// logic — granting credit / activating plans — lives in the ONE shared webhook
// (audric/web-v3 app/api/stripe/webhook), keyed on the Checkout session
// metadata (kind: "topup" | "subscribe"). The console only CREATES Checkout
// sessions (hosted redirect) + reads/writes the shared User billing fields.

export const USD_TO_MICROS = 1_000_000;

/** Credit features require Stripe — off (503) when the secret key is unset. */
export function isCreditConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Stripe is not configured (STRIPE_SECRET_KEY unset).");
  }
  if (!cached) {
    cached = new Stripe(key, { appInfo: { name: "t2000-console" } });
  }
  return cached;
}

/**
 * Get (or lazily create + persist) the Stripe customer for a user. NEVER
 * recreates a stored id (test/live are separate Stripe accounts on one DB —
 * recreating would clobber the live customer). Same invariant as web-v3.
 */
export async function getOrCreateCustomer(
  userId: string,
  email: string | null
): Promise<string> {
  const u = await getUserById(userId);
  if (u?.stripeCustomerId) {
    return u.stripeCustomerId;
  }
  const customer = await getStripe().customers.create({
    email: email ?? undefined,
    metadata: { userId },
  });
  await setStripeCustomerId(userId, customer.id);
  return customer.id;
}
