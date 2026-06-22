import "server-only";

/**
 * Stripe — server-only credit-rail funding edge (Phase 5,
 * SPEC_AUDRIC_TOPUP_METERING). Stripe is the FUNDING EDGE ONLY (card vault +
 * charge engine); the CreditLedger is the balance SSOT. Hosted Checkout +
 * webhooks — no client-side Stripe.js, no publishable key. Optional: unset
 * STRIPE_SECRET_KEY → credit features simply off (no boot failure).
 */

import Stripe from "stripe";
import { TIERS, type Tier, type TierId } from "@/lib/credit/tiers";
import {
  getCreditBalanceMicros,
  getUserById,
  recordCredit,
  setStripeCustomerId,
} from "@/lib/db/queries";
import { env } from "@/lib/env";

export const USD_TO_MICROS = 1_000_000;

/** Credit features are available only when Stripe is configured. */
export function isCreditConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

// ── Subscription scaffold (Phase 5) ──────────────────────────────────────────
// The Stripe Price ID for each paid tier lives in env (seeded by
// scripts/stripe-seed.ts). A tier is "subscribable" only once its Price ID is
// provisioned — until then the UI shows "Coming soon" and /subscribe 400s.

/** Resolve the configured Stripe Price ID for a tier (undefined = not seeded). */
export function priceIdForTier(tier: TierId): string | undefined {
  const t = TIERS.find((x: Tier) => x.id === tier);
  if (!t?.priceEnv) {
    return;
  }
  return env[t.priceEnv] || undefined;
}

/** Reverse map a Stripe Price ID back to a tier (for subscription webhooks). */
export function tierForPriceId(priceId: string): TierId | null {
  for (const t of TIERS) {
    if (t.priceEnv && env[t.priceEnv] === priceId) {
      return t.id;
    }
  }
  return null;
}

/** Tiers whose Price ID is provisioned (i.e. actually purchasable today). */
export function subscribableTiers(): TierId[] {
  return TIERS.filter((t) => priceIdForTier(t.id)).map((t) => t.id);
}

/** Provisional monthly included credit for a tier (0 when none). */
export function includedCreditUsdForTier(tier: TierId): number {
  return TIERS.find((t) => t.id === tier)?.includedCreditUsd ?? 0;
}

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe is not configured (STRIPE_SECRET_KEY unset).");
  }
  if (!cached) {
    cached = new Stripe(env.STRIPE_SECRET_KEY, {
      appInfo: { name: "audric-v3" },
    });
  }
  return cached;
}

/** Get (or lazily create + persist) the Stripe customer for a user. */
export async function getOrCreateCustomer(
  userId: string,
  email: string | null
): Promise<string> {
  const u = await getUserById(userId);
  // NEVER re-verify/recreate a stored customer id here. The DB stores ONE id, but
  // Stripe test + live are separate accounts — so "recreate if it 404s" would
  // CLOBBER the live customer (card + subscription pointer) whenever this runs in
  // test mode on the shared DB (it did, once — funkiirabu). To test in test mode,
  // use accounts with no stored live customer (fresh / `reset-stripe.mts`).
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

/** Native billing is available only when the publishable key is set (the
 * embedded Payment Element needs it client-side). */
export function isNativeBillingConfigured(): boolean {
  return Boolean(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}

export type SubscriptionInfo = {
  tier: TierId | null;
  status: string;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
} | null;

export type InvoiceRow = {
  id: string;
  created: number;
  amountPaid: number;
  currency: string;
  status: string | null;
  number: string | null;
  hostedUrl: string | null;
  pdfUrl: string | null;
};

export type PaymentMethodRow = {
  /** Representative PM id (the default one when the group has a default) — used
   * for "make default". */
  id: string;
  /** ALL underlying Stripe PM ids this row collapses (Stripe mints a new PM per
   * payment for the same Link wallet / re-added card). "Remove" detaches them
   * all so a deduped twin doesn't reappear. */
  ids: string[];
  /** Stripe PM type — "card", "link" (the 1-click wallet), etc. */
  type: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  /** Link wallet email (when type === "link"). */
  email: string | null;
  isDefault: boolean;
};

export type BillingOverview = {
  subscription: SubscriptionInfo;
  invoices: InvoiceRow[];
  paymentMethods: PaymentMethodRow[];
};

/** The user's existing Stripe customer id, or null (does NOT create one). */
async function existingCustomerId(userId: string): Promise<string | null> {
  const u = await getUserById(userId);
  return u?.stripeCustomerId ?? null;
}

/**
 * Collapse duplicate payment methods (Stripe mints a fresh PM object per payment
 * for the same Link wallet, and re-adding a card makes a new PM with the same
 * fingerprint). Group Link by email, cards by fingerprint → one row each, with
 * `ids` carrying every underlying PM so "Remove" detaches the whole group. The
 * default PM is kept as the representative so its badge stays correct.
 */
function dedupePaymentMethods(
  pms: Stripe.PaymentMethod[],
  defaultPm: string | null,
  subDefaultPm: string | null
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
    const isDefault = pm.id === defaultPm || pm.id === subDefaultPm;
    const existing = seen.get(key);
    if (existing) {
      existing.ids.push(pm.id);
      if (isDefault) {
        existing.isDefault = true;
        existing.id = pm.id;
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

/** Full billing snapshot for the native UI — subscription, invoices, cards. All
 * server-side reads (no publishable key needed). Empty when there's no customer
 * yet. Never throws. */
export async function getBillingOverview(
  userId: string
): Promise<BillingOverview> {
  const empty: BillingOverview = {
    subscription: null,
    invoices: [],
    paymentMethods: [],
  };
  const customerId = await existingCustomerId(userId);
  if (!customerId) {
    return empty;
  }
  try {
    const stripe = getStripe();
    const [customer, subs, invoices, pms] = await Promise.all([
      stripe.customers.retrieve(customerId),
      stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 1,
      }),
      stripe.invoices.list({ customer: customerId, limit: 12 }),
      // ALL payment-method types — not just "card". Stripe Link (the 1-click
      // wallet most Checkout users pay with) is type "link"; a "card" filter
      // silently hid it → "no cards saved" despite an active subscription.
      stripe.customers.listPaymentMethods(customerId, { limit: 20 }),
    ]);

    const defaultPm =
      customer && !customer.deleted
        ? (customer.invoice_settings?.default_payment_method as string | null)
        : null;

    const sub = subs.data[0];
    const subscription: SubscriptionInfo = sub
      ? {
          tier: tierForPriceId(sub.items.data[0]?.price.id ?? ""),
          status: sub.status,
          currentPeriodEnd: sub.items.data[0]?.current_period_end ?? null,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        }
      : null;

    // Checkout sets the default PM on the SUBSCRIPTION, not the customer's
    // invoice_settings (which stays null) — honor both so a card actually
    // shows as "Default".
    const subDefaultPm =
      typeof sub?.default_payment_method === "string"
        ? sub.default_payment_method
        : (sub?.default_payment_method?.id ?? null);

    return {
      subscription,
      invoices: invoices.data.map((inv) => ({
        id: inv.id ?? "",
        created: inv.created,
        amountPaid: inv.amount_paid,
        currency: inv.currency,
        status: inv.status,
        number: inv.number,
        hostedUrl: inv.hosted_invoice_url ?? null,
        pdfUrl: inv.invoice_pdf ?? null,
      })),
      paymentMethods: dedupePaymentMethods(pms.data, defaultPm, subDefaultPm),
    };
  } catch (e) {
    console.error("[billing] overview failed", e);
    return empty;
  }
}

/** Create a SetupIntent so the client can attach a card via the Payment Element. */
export async function createSetupIntent(
  userId: string,
  email: string | null
): Promise<{ clientSecret: string | null }> {
  const customerId = await getOrCreateCustomer(userId, email);
  const si = await getStripe().setupIntents.create({
    customer: customerId,
    payment_method_types: ["card"],
    usage: "off_session",
  });
  return { clientSecret: si.client_secret };
}

/** Cancel at period end (true) or resume (false) the user's active subscription. */
export async function setSubscriptionCancel(
  userId: string,
  cancel: boolean
): Promise<boolean> {
  const customerId = await existingCustomerId(userId);
  if (!customerId) {
    return false;
  }
  const subs = await getStripe().subscriptions.list({
    customer: customerId,
    status: "active",
    limit: 1,
  });
  const sub = subs.data[0];
  if (!sub) {
    return false;
  }
  await getStripe().subscriptions.update(sub.id, {
    cancel_at_period_end: cancel,
  });
  return true;
}

/** Set a card as the customer's default (used for invoices + auto-recharge). */
export async function setDefaultPaymentMethod(
  userId: string,
  paymentMethodId: string
): Promise<boolean> {
  const customerId = await existingCustomerId(userId);
  if (!customerId) {
    return false;
  }
  await getStripe().customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });
  return true;
}

/** Detach (remove) saved payment methods from the customer — accepts the full
 * deduped group so a collapsed Link/card twin doesn't reappear after removal. */
export async function detachPaymentMethods(ids: string[]): Promise<void> {
  const stripe = getStripe();
  await Promise.all(
    ids.map((id) =>
      stripe.paymentMethods.detach(id).catch(() => {
        // Already detached / unknown — ignore so one bad id doesn't fail the lot.
      })
    )
  );
}

/**
 * The "never runs dry" fix: if auto-recharge is on and the balance dropped
 * below the threshold, charge the saved card off-session and grant credit.
 * Best-effort + idempotent (ref = PaymentIntent id); never throws into the
 * chat turn. SCA-required charges are skipped (logged) — an edge for MVP.
 */
export async function maybeAutoRecharge(userId: string): Promise<void> {
  try {
    const u = await getUserById(userId);
    if (
      !(
        u?.autoRechargeEnabled &&
        u.defaultPaymentMethodId &&
        u.stripeCustomerId
      )
    ) {
      return;
    }
    const balance = await getCreditBalanceMicros(userId);
    if (balance >= u.autoRechargeThresholdUsd * USD_TO_MICROS) {
      return;
    }
    const amountUsd = u.autoRechargeAmountUsd;
    const pi = await getStripe().paymentIntents.create({
      amount: amountUsd * 100,
      currency: "usd",
      customer: u.stripeCustomerId,
      payment_method: u.defaultPaymentMethodId,
      off_session: true,
      confirm: true,
      metadata: { userId, kind: "recharge", amountUsd: String(amountUsd) },
    });
    if (pi.status === "succeeded") {
      await recordCredit({
        userId,
        amountMicros: amountUsd * USD_TO_MICROS,
        type: "recharge",
        description: `Auto-recharge $${amountUsd}`,
        ref: pi.id,
      });
    }
  } catch (e) {
    console.error("[auto-recharge] failed", e);
  }
}
