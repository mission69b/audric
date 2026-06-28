import { setDefaultPaymentMethodId } from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import {
  createAddCardCheckout,
  detachPaymentMethods,
  isCreditConfigured,
  setStripeDefaultPaymentMethod,
} from "@/lib/billing";

// Payment-method management: add (hosted setup Checkout), make-default, remove.
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

  let body: {
    action?: string;
    paymentMethodId?: string;
    paymentMethodIds?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  try {
    if (body.action === "add") {
      const origin =
        request.headers.get("origin") ?? new URL(request.url).origin;
      const url = await createAddCardCheckout(
        session.user.id,
        session.user.email ?? null,
        origin
      );
      return Response.json({ url });
    }

    if (body.action === "default" && body.paymentMethodId) {
      await setStripeDefaultPaymentMethod(
        session.user.id,
        body.paymentMethodId
      );
      await setDefaultPaymentMethodId(session.user.id, body.paymentMethodId);
      return Response.json({ ok: true });
    }

    if (body.action === "detach" && body.paymentMethodIds?.length) {
      await detachPaymentMethods(body.paymentMethodIds);
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    console.error("[/api/billing/payment-method]", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "Something went wrong." },
      { status: 500 }
    );
  }
}
