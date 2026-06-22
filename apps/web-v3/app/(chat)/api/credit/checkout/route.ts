import { auth } from "@/app/(auth)/auth";
import { acceptClosedLoopTerms, getUserById } from "@/lib/db/queries";
import {
  CHECKOUT_PANEL_BG,
  type CheckoutTheme,
  getOrCreateCustomer,
  getStripe,
  isCreditConfigured,
} from "@/lib/stripe";

const MIN_TOPUP_USD = 5;
const MAX_TOPUP_USD = 500;

// Create a hosted Stripe Checkout session for a one-off credit top-up. The card
// is saved off-session (for auto-recharge). Credit is granted on the verified
// webhook (checkout.session.completed), never here.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isCreditConfigured()) {
    return new Response("Credit is not available.", { status: 503 });
  }

  let amountUsd: number;
  let acceptedTerms = false;
  let theme: CheckoutTheme = "light";
  try {
    const body = await request.json();
    amountUsd = Math.floor(Number(body?.amountUsd));
    acceptedTerms = body?.acceptedTerms === true;
    theme = body?.theme === "dark" ? "dark" : "light";
  } catch {
    return new Response("Bad request", { status: 400 });
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

  // Closed-loop terms must be accepted before the first purchase (§6b). Record
  // acceptance at the consent point.
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

  // Embedded checkout (in-app) — see subscribe route. Returns a client_secret.
  try {
    const checkout = await getStripe().checkout.sessions.create({
      ui_mode: "embedded_page",
      mode: "payment",
      customer: customerId,
      // Audric shell surface (bg-sidebar) so the embedded panel matches the
      // page in the user's light/dark theme.
      branding_settings: { background_color: CHECKOUT_PANEL_BG[theme] },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountUsd * 100,
            product_data: {
              name: "Audric credit",
              description:
                "Closed-loop service credit — non-refundable, non-withdrawable, non-transferable.",
            },
          },
        },
      ],
      // Save the card so auto-recharge can charge off-session later.
      payment_intent_data: { setup_future_usage: "off_session" },
      // Generate a proper invoice (+ downloadable PDF + invoice number) for the
      // top-up, matching the professional receipt subscriptions already get.
      invoice_creation: {
        enabled: true,
        invoice_data: {
          description: "Audric service credit",
          footer:
            "Audric credit is closed-loop: non-refundable, non-withdrawable, and non-transferable. Audric is operated by T2000 AFI Inc.",
          metadata: { userId: session.user.id, kind: "topup" },
        },
      },
      metadata: {
        userId: session.user.id,
        kind: "topup",
        amountUsd: String(amountUsd),
      },
      return_url: `${origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    });
    return Response.json({ clientSecret: checkout.client_secret });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Couldn't start checkout." },
      { status: 500 }
    );
  }
}
