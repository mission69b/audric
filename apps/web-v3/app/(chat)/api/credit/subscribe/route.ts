import { auth } from "@/app/(auth)/auth";
import type { TierId } from "@/lib/credit/tiers";
import { acceptClosedLoopTerms, getUserById } from "@/lib/db/queries";
import {
  getOrCreateCustomer,
  getStripe,
  isCreditConfigured,
  priceIdForTier,
} from "@/lib/stripe";

const PAID_TIERS: TierId[] = ["pro", "max"];

// Create a hosted Stripe Checkout session in SUBSCRIPTION mode for a paid tier.
// Inert until the tier's Price ID is provisioned (priceIdForTier → 400). The
// tier + status are set, and included monthly credit granted, on the verified
// webhook — never here.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isCreditConfigured()) {
    return new Response("Credit is not available.", { status: 503 });
  }

  let tier: string;
  let acceptedTerms = false;
  try {
    const body = await request.json();
    tier = String(body?.tier);
    acceptedTerms = body?.acceptedTerms === true;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  if (!PAID_TIERS.includes(tier as TierId)) {
    return Response.json({ error: "Unknown plan." }, { status: 400 });
  }

  const priceId = priceIdForTier(tier as TierId);
  if (!priceId) {
    return Response.json(
      { error: "Subscriptions aren't available yet." },
      { status: 400 }
    );
  }

  // Subscriptions grant closed-loop credit, so the same terms gate applies (§6b).
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

  const checkout = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { metadata: { userId: session.user.id, tier } },
    metadata: { userId: session.user.id, kind: "subscribe", tier },
    success_url: `${origin}/?subscribe=success`,
    cancel_url: `${origin}/settings/billing?subscribe=cancel`,
  });

  return Response.json({ url: checkout.url });
}
