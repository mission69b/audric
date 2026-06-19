import { auth } from "@/app/(auth)/auth";
import { getCreditBalanceMicros, getUserById } from "@/lib/db/queries";
import {
  isCreditConfigured,
  subscribableTiers,
  USD_TO_MICROS,
} from "@/lib/stripe";

// Credit state for the signed-in user: balance (USD) + auto-recharge config +
// whether a card is saved + terms acceptance. `configured` tells the client
// whether the credit rail is live at all. The sidebar uses balanceUsd; the
// Billing pane uses the rest.
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!isCreditConfigured()) {
    return Response.json({ configured: false, balanceUsd: null });
  }

  try {
    const [micros, u] = await Promise.all([
      getCreditBalanceMicros(session.user.id),
      getUserById(session.user.id),
    ]);
    return Response.json({
      configured: true,
      balanceUsd: micros / USD_TO_MICROS,
      hasCard: Boolean(u?.defaultPaymentMethodId),
      acceptedTerms: Boolean(u?.closedLoopAcceptedAt),
      tier: u?.subscriptionTier ?? "free",
      subscribableTiers: subscribableTiers(),
      autoRecharge: {
        enabled: u?.autoRechargeEnabled ?? false,
        thresholdUsd: u?.autoRechargeThresholdUsd ?? 5,
        amountUsd: u?.autoRechargeAmountUsd ?? 20,
      },
    });
  } catch {
    return Response.json({ configured: true, balanceUsd: null });
  }
}
