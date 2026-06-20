import { auth } from "@/app/(auth)/auth";
import { createSetupIntent, isCreditConfigured } from "@/lib/stripe";

/**
 * Create a SetupIntent so the client can attach a card via the embedded Payment
 * Element (native "add card" flow). Card data goes straight to Stripe via the
 * Element — it never touches our server.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isCreditConfigured()) {
    return new Response("Billing is not available.", { status: 503 });
  }

  try {
    const { clientSecret } = await createSetupIntent(
      session.user.id,
      session.user.email ?? null
    );
    return Response.json({ clientSecret });
  } catch (_e) {
    return Response.json(
      { error: "Couldn't start the card setup." },
      { status: 500 }
    );
  }
}
