import type Stripe from "stripe";
import type { TierId } from "@/lib/credit/tiers";
import {
  recordCredit,
  setDefaultPaymentMethod,
  setSubscription,
} from "@/lib/db/queries";
import { env } from "@/lib/env";
import {
  getStripe,
  includedCreditUsdForTier,
  isCreditConfigured,
  tierForPriceId,
  USD_TO_MICROS,
} from "@/lib/stripe";

// Stripe webhook — the SOURCE OF TRUTH for granting credit + activating
// subscriptions. Verified by the signing secret; credit is only ever applied
// here (the client checkout call never grants). Idempotent: recordCredit
// dedupes on the Stripe object id.
export async function POST(request: Request) {
  if (!(isCreditConfigured() && env.STRIPE_WEBHOOK_SECRET)) {
    return new Response("Stripe not configured", { status: 503 });
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return new Response("Missing signature", { status: 400 });
  }

  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      raw,
      sig,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch (e) {
    return new Response(`Webhook signature failed: ${(e as Error).message}`, {
      status: 400,
    });
  }

  try {
    await handleEvent(event);
  } catch (e) {
    // Log + 500 so Stripe retries (every handler is idempotent on retry).
    console.error("[stripe webhook] handler error", e);
    return new Response("handler error", { status: 500 });
  }

  return Response.json({ received: true });
}

async function handleEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(
        event.data.object as Stripe.Checkout.Session
      );
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await syncSubscription(event.data.object as Stripe.Subscription);
      break;
    case "customer.subscription.deleted":
      await cancelSubscription(event.data.object as Stripe.Subscription);
      break;
    case "invoice.paid":
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
      break;
    default:
      break;
  }
}

async function handleCheckoutCompleted(s: Stripe.Checkout.Session) {
  const userId = s.metadata?.userId;
  if (!userId) {
    return;
  }
  const kind = s.metadata?.kind;

  if (kind === "topup") {
    const amountUsd = Number(s.metadata?.amountUsd ?? 0);
    if (amountUsd > 0) {
      await recordCredit({
        userId,
        amountMicros: amountUsd * USD_TO_MICROS,
        type: "topup",
        description: `Top-up $${amountUsd}`,
        ref: s.id,
      });
    }
  } else if (kind === "subscribe") {
    // Activate immediately + grant the first month's included credit. Renewals
    // are granted on invoice.paid (subscription_cycle). The subscription.created
    // event also syncs status; granting here keeps activation snappy.
    const tier = (s.metadata?.tier as TierId) ?? "free";
    await setSubscription(userId, {
      tier,
      status: "active",
      stripeSubscriptionId:
        typeof s.subscription === "string" ? s.subscription : null,
    });
    const included = includedCreditUsdForTier(tier);
    if (included > 0) {
      await recordCredit({
        userId,
        amountMicros: included * USD_TO_MICROS,
        type: "grant",
        description: `${tier} plan — included credit`,
        ref: `sub_grant_${s.id}`,
      });
    }
  }

  // Save the card for off-session auto-recharge (non-fatal).
  try {
    if (typeof s.payment_intent === "string") {
      const pi = await getStripe().paymentIntents.retrieve(s.payment_intent);
      if (typeof pi.payment_method === "string") {
        await setDefaultPaymentMethod(userId, pi.payment_method);
      }
    }
  } catch (e) {
    console.error("[stripe webhook] save PM failed", e);
  }
}

function tierFromSubscription(sub: Stripe.Subscription): TierId | null {
  const priceId = sub.items.data[0]?.price?.id;
  return priceId ? tierForPriceId(priceId) : null;
}

async function syncSubscription(sub: Stripe.Subscription) {
  const userId = sub.metadata?.userId;
  if (!userId) {
    return;
  }
  const tier = tierFromSubscription(sub);
  // active/trialing keep the tier; anything else (past_due, canceled, unpaid)
  // falls back to free entitlements while we keep the row for reference.
  const entitled = sub.status === "active" || sub.status === "trialing";
  await setSubscription(userId, {
    tier: entitled && tier ? tier : "free",
    status: sub.status,
    stripeSubscriptionId: sub.id,
  });
}

async function cancelSubscription(sub: Stripe.Subscription) {
  const userId = sub.metadata?.userId;
  if (!userId) {
    return;
  }
  await setSubscription(userId, {
    tier: "free",
    status: "canceled",
    stripeSubscriptionId: sub.id,
  });
}

async function handleInvoicePaid(inv: Stripe.Invoice) {
  // Only grant on renewals — the first invoice's credit is granted by the
  // checkout.session.completed handler (avoids a double grant).
  if (inv.billing_reason !== "subscription_cycle") {
    return;
  }
  const subId = subscriptionIdFromInvoice(inv);
  if (!subId) {
    return;
  }
  const sub = await getStripe().subscriptions.retrieve(subId);
  const userId = sub.metadata?.userId;
  const tier = tierFromSubscription(sub);
  if (!(userId && tier)) {
    return;
  }
  const included = includedCreditUsdForTier(tier);
  if (included > 0) {
    await recordCredit({
      userId,
      amountMicros: included * USD_TO_MICROS,
      type: "grant",
      description: `${tier} plan — monthly included credit`,
      ref: `sub_renew_${inv.id}`,
    });
  }
}

/**
 * The invoice→subscription link moved across Stripe API versions (top-level
 * `subscription` → `parent.subscription_details.subscription`). Read both so the
 * scaffold survives a version bump.
 */
function subscriptionIdFromInvoice(inv: Stripe.Invoice): string | null {
  const shaped = inv as unknown as {
    subscription?: string | { id: string };
    parent?: { subscription_details?: { subscription?: string } };
  };
  if (typeof shaped.subscription === "string") {
    return shaped.subscription;
  }
  if (shaped.subscription?.id) {
    return shaped.subscription.id;
  }
  return shaped.parent?.subscription_details?.subscription ?? null;
}
