import { auth } from "@/app/(auth)/auth";
import { getUserById, setAutoRecharge } from "@/lib/db/queries";
import { isCreditConfigured } from "@/lib/stripe";

// Toggle / configure auto-recharge (card-only — a self-custody USDC wallet
// can't be auto-charged). Enabling requires a saved card (from a prior top-up).
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isCreditConfigured()) {
    return new Response("Credit is not available.", { status: 503 });
  }

  let enabled = false;
  let thresholdUsd: number | undefined;
  let amountUsd: number | undefined;
  try {
    const body = await request.json();
    enabled = body?.enabled === true;
    if (body?.thresholdUsd !== undefined) {
      thresholdUsd = Math.max(1, Math.floor(Number(body.thresholdUsd)));
    }
    if (body?.amountUsd !== undefined) {
      amountUsd = Math.max(5, Math.floor(Number(body.amountUsd)));
    }
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  if (enabled) {
    const u = await getUserById(session.user.id);
    if (!u?.defaultPaymentMethodId) {
      return Response.json(
        { error: "Add a card with a top-up first, then enable auto-recharge." },
        { status: 400 }
      );
    }
  }

  await setAutoRecharge(session.user.id, { enabled, thresholdUsd, amountUsd });
  return Response.json({ ok: true });
}
