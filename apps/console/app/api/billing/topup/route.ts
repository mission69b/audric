import { acceptClosedLoopTerms, getUserById } from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import {
  getOrCreateCustomer,
  getStripe,
  isCreditConfigured,
} from "@/lib/billing";

const MIN_TOPUP_USD = 5;
const MAX_TOPUP_USD = 500;

// Create a hosted Stripe Checkout session for a one-off credit top-up. The card
// is saved off-session (for auto-recharge). Credit is granted on the verified
// shared webhook (checkout.session.completed, kind=topup), never here.
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

  let amountUsd: number;
  let acceptedTerms = false;
  try {
    const body = await request.json();
    amountUsd = Math.floor(Number(body?.amountUsd));
    acceptedTerms = body?.acceptedTerms === true;
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  if (
    !Number.isFinite(amountUsd) ||
    amountUsd < MIN_TOPUP_USD ||
    amountUsd > MAX_TOPUP_USD
  ) {
    return Response.json(
      {
        error: `Top-up must be between $${MIN_TOPUP_USD} and $${MAX_TOPUP_USD}.`,
      },
      { status: 400 }
    );
  }

  // Closed-loop terms must be accepted before the first purchase.
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
      mode: "payment",
      customer: customerId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountUsd * 100,
            product_data: {
              name: "t2000 credit",
              description:
                "Closed-loop service credit — non-refundable, non-withdrawable, non-transferable.",
            },
          },
        },
      ],
      // Save the card so auto-recharge can charge off-session later (the shared
      // webhook persists the default PM on completion).
      payment_intent_data: { setup_future_usage: "off_session" },
      invoice_creation: {
        enabled: true,
        invoice_data: {
          description: "t2000 service credit",
          footer:
            "t2000 credit is closed-loop: non-refundable, non-withdrawable, and non-transferable. Operated by T2000 AFI Inc.",
          metadata: { userId: session.user.id, kind: "topup" },
        },
      },
      metadata: {
        userId: session.user.id,
        kind: "topup",
        amountUsd: String(amountUsd),
      },
      success_url: `${origin}/dashboard?topup=success`,
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
