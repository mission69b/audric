import { auth } from "@/app/(auth)/auth";
import {
  detachPaymentMethod,
  isCreditConfigured,
  setDefaultPaymentMethod,
} from "@/lib/stripe";

/**
 * Manage saved cards — set default or remove. Body: { action: "default" |
 * "detach", paymentMethodId }. Detaching the default card just clears it; the
 * user can add another via the Payment Element.
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
  let paymentMethodId: string;
  try {
    const body = await request.json();
    action = String(body?.action);
    paymentMethodId = String(body?.paymentMethodId);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (!paymentMethodId || (action !== "default" && action !== "detach")) {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }

  try {
    if (action === "default") {
      await setDefaultPaymentMethod(session.user.id, paymentMethodId);
    } else {
      await detachPaymentMethod(paymentMethodId);
    }
    return Response.json({ ok: true });
  } catch (_e) {
    return Response.json(
      { error: "Couldn't update the card." },
      { status: 500 }
    );
  }
}
