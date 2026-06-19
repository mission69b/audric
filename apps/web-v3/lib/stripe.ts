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
