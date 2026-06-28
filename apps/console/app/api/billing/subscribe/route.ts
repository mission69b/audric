import { acceptClosedLoopTerms, getUserById } from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import {
  getOrCreateCustomer,
  getStripe,
  isCreditConfigured,
  priceIdForTier,
} from "@/lib/billing";
import type { ConsolePlanId } from "@/lib/plans";

const PLAN_IDS: ConsolePlanId[] = ["pro", "max"];

// Create a hosted Stripe Checkout session in SUBSCRIPTION mode for an Audric
// Pro/Max plan (included monthly credit, spendable on the API). The tier +
// status + monthly credit are set on the verified SHARED webhook
// (checkout.session.completed kind=subscribe / invoice.paid), never here.
export async function POST(request: Request) {
  const session = await getCurrentUser();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isCreditConfigured()) {
    return Response.json(
      { error: "Credit is not available." },
      { status: 503 }
    );
  }

  let tier: string;
  let acceptedTerms = false;
  try {
    const body = await request.json();
    tier = String(body?.tier);
    acceptedTerms = body?.acceptedTerms === true;
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  if (!PLAN_IDS.includes(tier as ConsolePlanId)) {
    return Response.json({ error: "Unknown plan." }, { status: 400 });
  }

  const priceId = priceIdForTier(tier as ConsolePlanId);
  if (!priceId) {
    return Response.json(
      { error: "Subscriptions aren't available yet." },
      { status: 400 }
    );
  }

  const user = await getUserById(session.user.id);
  if (!user?.closedLoopAcceptedAt) {
    if (!acceptedTerms) {
      return Response.json({ error: "terms_required" }, { status: 400 });
    }
    await acceptClosedLoopTerms(session.user.id);
  }

  const origin = request.headers.get("origin") ?? new URL(request.url).origin;
  const customerId = await getOrCreateCustomer(
    session.user.id,
    session.user.email ?? null
  );

  try {
    const checkout = await getStripe().checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { metadata: { userId: session.user.id, tier } },
      metadata: { userId: session.user.id, kind: "subscribe", tier },
      success_url: `${origin}/dashboard?subscribe=success`,
      cancel_url: `${origin}/dashboard`,
    });
    return Response.json({ url: checkout.url });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Couldn't start checkout." },
      { status: 500 }
    );
  }
}
