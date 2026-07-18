import "server-only";

import { getUserById, setStripeCustomerId } from "@audric/accounts";
import Stripe from "stripe";

// Thin Stripe glue for the console (funding edge only). The money-critical
// logic — granting credit / activating plans — lives in the ONE shared webhook
// (audric/web-v3 app/api/stripe/webhook), keyed on the Checkout session
// metadata (kind: "topup" | "subscribe"). The console only CREATES Checkout
// sessions (hosted redirect) + reads/writes the shared User billing fields.

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

export type InvoiceRow = {
  id: string;
  created: number;
  amountPaid: number;
  receiptUrl: string | null;
};

export type PaymentMethodRow = {
  id: string;
  ids: string[];
  type: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  email: string | null;
  isDefault: boolean;
};

export type BillingOverview = {
  invoices: InvoiceRow[];
  paymentMethods: PaymentMethodRow[];
};

async function existingCustomerId(userId: string): Promise<string | null> {
  const u = await getUserById(userId);
  return u?.stripeCustomerId ?? null;
}

function dedupePaymentMethods(
  pms: Stripe.PaymentMethod[],
  defaultPm: string | null
): PaymentMethodRow[] {
  const seen = new Map<string, PaymentMethodRow>();
  for (const pm of pms) {
    const card = pm.type === "card" ? pm.card : undefined;
    const key =
      pm.type === "card"
        ? `card:${card?.fingerprint ?? pm.id}`
        : pm.type === "link"
          ? `link:${pm.link?.email ?? pm.id}`
          : pm.id;
    const isDefault = pm.id === defaultPm;
    if (seen.has(key)) {
      const row = seen.get(key);
      if (row) {
        row.ids.push(pm.id);
        if (isDefault) {
          row.isDefault = true;
          row.id = pm.id;
        }
      }
      continue;
    }
    seen.set(key, {
      id: pm.id,
      ids: [pm.id],
      type: pm.type,
      brand: card?.brand ?? (pm.type === "link" ? "Link" : pm.type),
      last4: card?.last4 ?? "",
      expMonth: card?.exp_month ?? 0,
      expYear: card?.exp_year ?? 0,
      email: pm.type === "link" ? (pm.link?.email ?? null) : null,
      isDefault,
    });
  }
  return [...seen.values()];
}

/** Read-only billing snapshot for the console — saved cards + payment history.
 * Never throws; empty when there's no Stripe customer yet. */
export async function getBillingOverview(
  userId: string
): Promise<BillingOverview> {
  const empty: BillingOverview = { invoices: [], paymentMethods: [] };
  const customerId = await existingCustomerId(userId);
  if (!(customerId && isCreditConfigured())) {
    return empty;
  }
  try {
    const stripe = getStripe();
    const [customer, charges, pms] = await Promise.all([
      stripe.customers.retrieve(customerId),
      stripe.charges.list({ customer: customerId, limit: 12 }),
      stripe.customers.listPaymentMethods(customerId, { limit: 20 }),
    ]);
    const defaultPm =
      customer && !customer.deleted
        ? (customer.invoice_settings?.default_payment_method as string | null)
        : null;
    return {
      invoices: charges.data
        .filter((c) => c.status === "succeeded")
        .map((c) => ({
          id: c.id,
          created: c.created,
          amountPaid: c.amount,
          receiptUrl: c.receipt_url ?? null,
        })),
      paymentMethods: dedupePaymentMethods(pms.data, defaultPm),
    };
  } catch {
    return empty;
  }
}

/** Hosted Stripe Checkout in SETUP mode — saves a card to the customer without
 * a charge. Stripe attaches the PM on completion; it then shows in the list. */
export async function createAddCardCheckout(
  userId: string,
  email: string | null,
  origin: string
): Promise<string | null> {
  const customerId = await getOrCreateCustomer(userId, email);
  const checkout = await getStripe().checkout.sessions.create({
    mode: "setup",
    customer: customerId,
    currency: "usd",
    payment_method_types: ["card"],
    success_url: `${origin}/billing?card=added`,
    cancel_url: `${origin}/billing`,
  });
  return checkout.url;
}

/** Set a card as the Stripe customer default (used for invoices). */
export async function setStripeDefaultPaymentMethod(
  userId: string,
  paymentMethodId: string
): Promise<void> {
  const customerId = await existingCustomerId(userId);
  if (!customerId) {
    return;
  }
  await getStripe().customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });
}

/** Detach saved payment methods (accepts the whole deduped group). */
export async function detachPaymentMethods(ids: string[]): Promise<void> {
  const stripe = getStripe();
  await Promise.all(
    ids.map((id) =>
      stripe.paymentMethods.detach(id).catch(() => {
        // already detached / unknown — ignore
      })
    )
  );
}
