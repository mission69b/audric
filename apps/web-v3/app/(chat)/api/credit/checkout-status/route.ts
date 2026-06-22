import { auth } from "@/app/(auth)/auth";
import { getStripe, isCreditConfigured } from "@/lib/stripe";

/**
 * GET ?session_id=… — status of an embedded-checkout session, for the /checkout/
 * return page. Scoped to the caller (metadata.userId must match). Credit /
 * subscription are granted by the webhook, not here — this is read-only.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isCreditConfigured()) {
    return new Response("unavailable", { status: 503 });
  }
  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId) {
    return Response.json({ error: "missing session_id" }, { status: 400 });
  }
  try {
    const cs = await getStripe().checkout.sessions.retrieve(sessionId);
    if (cs.metadata?.userId !== session.user.id) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    return Response.json({
      status: cs.status, // "complete" | "open" | "expired"
      kind: cs.metadata?.kind ?? null,
      tier: cs.metadata?.tier ?? null,
      amountUsd: cs.metadata?.amountUsd ?? null,
    });
  } catch {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
}
