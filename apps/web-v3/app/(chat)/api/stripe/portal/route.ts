import { auth } from "@/app/(auth)/auth";
import {
  getOrCreateCustomer,
  getStripe,
  isCreditConfigured,
} from "@/lib/stripe";

/**
 * Stripe Customer Portal session — the one link that covers invoices, billing
 * history, payment methods, and subscription cancel. We DON'T rebuild any of
 * that; Stripe hosts + maintains it. (Requires the Customer Portal to be enabled
 * once in the Stripe dashboard → Settings → Billing → Customer portal.)
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isCreditConfigured()) {
    return new Response("Billing is not available.", { status: 503 });
  }

  const origin = request.headers.get("origin") ?? new URL(request.url).origin;
  const customerId = await getOrCreateCustomer(
    session.user.id,
    session.user.email ?? null
  );

  try {
    const portal = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/settings/billing`,
    });
    return Response.json({ url: portal.url });
  } catch (_e) {
    // Most commonly: the Customer Portal isn't enabled in the Stripe dashboard.
    return Response.json(
      { error: "Billing portal isn't set up yet." },
      { status: 503 }
    );
  }
}
