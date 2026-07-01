import { auth } from "@/app/(auth)/auth";
import type { TierId } from "@/lib/credit/tiers";
import {
  changeSubscriptionTier,
  isCreditConfigured,
  setSubscriptionCancel,
} from "@/lib/stripe";

const PAID_TIERS: TierId[] = ["pro", "max"];

/**
 * Manage the user's active subscription — the native replacement for the hosted
 * portal. Body:
 *   { action: "cancel" | "resume" }              — cancel at period end / undo.
 *   { action: "change", tier: "pro" | "max" }    — switch paid tier (Stripe
 *     prorates + invoices immediately; tier syncs on the webhook).
 *   { action: "change", tier: "free" }           — downgrade to Free = cancel
 *     at period end (keep access until the cycle ends).
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
  let tier: string | undefined;
  try {
    const body = await request.json();
    action = String(body?.action);
    tier = body?.tier ? String(body.tier) : undefined;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  try {
    let ok: boolean;
    if (action === "cancel" || action === "resume") {
      ok = await setSubscriptionCancel(session.user.id, action === "cancel");
    } else if (action === "change") {
      // Downgrade to Free = cancel at period end (no paid sub to switch to).
      if (tier === "free") {
        ok = await setSubscriptionCancel(session.user.id, true);
      } else if (PAID_TIERS.includes(tier as TierId)) {
        ok = await changeSubscriptionTier(session.user.id, tier as TierId);
      } else {
        return Response.json({ error: "Unknown plan." }, { status: 400 });
      }
    } else {
      return Response.json({ error: "Unknown action." }, { status: 400 });
    }
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
