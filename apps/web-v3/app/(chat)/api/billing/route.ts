import { auth } from "@/app/(auth)/auth";
import {
  getBillingOverview,
  isCreditConfigured,
  isNativeBillingConfigured,
} from "@/lib/stripe";

/**
 * Native billing snapshot for the in-app billing UI — subscription (plan,
 * renewal, cancel state), invoices, and saved cards. All server-side Stripe
 * reads (no publishable key needed); `nativeEnabled` tells the client whether
 * the embedded Payment Element (add-card) is available.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isCreditConfigured()) {
    return Response.json({
      configured: false,
      nativeEnabled: false,
      subscription: null,
      invoices: [],
      paymentMethods: [],
    });
  }

  const overview = await getBillingOverview(session.user.id);
  return Response.json(
    {
      configured: true,
      nativeEnabled: isNativeBillingConfigured(),
      ...overview,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
