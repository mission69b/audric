import { auth } from "@/app/(auth)/auth";
import type { TierId } from "@/lib/credit/tiers";
import {
  changeSubscriptionTier,
  isCreditConfigured,
  previewSubscriptionChange,
  setSubscriptionCancel,
} from "@/lib/stripe";

const PAID_TIERS: TierId[] = ["pro", "max"];

/**
 * GET ?tier=pro|max — preview the exact proration a switch would charge now
 * (positive = charged; negative = credited). Drives the confirm-dialog breakdown.
 * Free (downgrade = cancel at period end) has no immediate charge → returns null.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isCreditConfigured()) {
    return Response.json({ preview: null });
  }
  const tier = new URL(request.url).searchParams.get("tier");
  if (!PAID_TIERS.includes(tier as TierId)) {
    return Response.json({ preview: null });
  }
  try {
    const preview = await previewSubscriptionChange(
      session.user.id,
      tier as TierId
    );
    return Response.json({ preview });
  } catch {
    return Response.json({ preview: null });
  }
}

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
