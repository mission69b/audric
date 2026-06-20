import { auth } from "@/app/(auth)/auth";
import { isCreditConfigured, setSubscriptionCancel } from "@/lib/stripe";

/**
 * Cancel (at period end) or resume the user's active subscription — native
 * replacement for the hosted portal's cancel flow. Body: { action: "cancel" |
 * "resume" }. Tier downgrade itself lands on the Stripe webhook at period end.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isCreditConfigured()) {
    return new Response("Billing is not available.", { status: 503 });
  }

  let action: string;
  try {
    const body = await request.json();
    action = String(body?.action);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (action !== "cancel" && action !== "resume") {
    return Response.json({ error: "Unknown action." }, { status: 400 });
  }

  try {
    const ok = await setSubscriptionCancel(
      session.user.id,
      action === "cancel"
    );
    if (!ok) {
      return Response.json(
        { error: "No active subscription to update." },
        { status: 400 }
      );
    }
    return Response.json({ ok: true });
  } catch (_e) {
    return Response.json(
      { error: "Couldn't update the subscription." },
      { status: 500 }
    );
  }
}
