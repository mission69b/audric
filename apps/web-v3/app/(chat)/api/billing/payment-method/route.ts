import { auth } from "@/app/(auth)/auth";
import {
  detachPaymentMethods,
  isCreditConfigured,
  setDefaultPaymentMethod,
} from "@/lib/stripe";

/**
 * Manage saved payment methods — set default or remove. Body:
 *   { action: "default", paymentMethodId }            — make this PM the default
 *   { action: "detach",  paymentMethodIds: string[] } — remove the whole deduped
 *                                                        group (all Link/card twins)
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isCreditConfigured()) {
    return new Response("Billing is not available.", { status: 503 });
  }

  let body: {
    action?: string;
    paymentMethodId?: string;
    paymentMethodIds?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const action = String(body?.action);

  try {
    if (action === "default") {
      if (!body.paymentMethodId) {
        return Response.json({ error: "Bad request." }, { status: 400 });
      }
      await setDefaultPaymentMethod(session.user.id, body.paymentMethodId);
    } else if (action === "detach") {
      const ids = Array.isArray(body.paymentMethodIds)
        ? body.paymentMethodIds.filter(
            (x): x is string => typeof x === "string"
          )
        : [];
      if (ids.length === 0) {
        return Response.json({ error: "Bad request." }, { status: 400 });
      }
      await detachPaymentMethods(ids);
    } else {
      return Response.json({ error: "Unknown action." }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch (_e) {
    return Response.json(
      { error: "Couldn't update the payment method." },
      { status: 500 }
    );
  }
}
