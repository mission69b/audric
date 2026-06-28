import { getUserById, setAutoRecharge } from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";

// Read / update card auto-recharge config (the "never runs dry" setting). The
// off-session charge itself is fired by maybeAutoRecharge on the /v1 + chat
// debit paths; this just persists the shared User config. Requires a saved card
// (defaultPaymentMethodId), which the shared webhook stores on the first
// Checkout payment.
export async function GET() {
  const session = await getCurrentUser();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const u = await getUserById(session.user.id);
  return Response.json({
    enabled: u?.autoRechargeEnabled ?? false,
    thresholdUsd: u?.autoRechargeThresholdUsd ?? 5,
    amountUsd: u?.autoRechargeAmountUsd ?? 20,
    hasCard: Boolean(u?.defaultPaymentMethodId),
  });
}

export async function POST(request: Request) {
  const session = await getCurrentUser();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let enabled = false;
  let thresholdUsd: number | undefined;
  let amountUsd: number | undefined;
  try {
    const body = await request.json();
    enabled = body?.enabled === true;
    thresholdUsd =
      body?.thresholdUsd == null
        ? undefined
        : Math.floor(Number(body.thresholdUsd));
    amountUsd =
      body?.amountUsd == null ? undefined : Math.floor(Number(body.amountUsd));
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  await setAutoRecharge(session.user.id, { enabled, thresholdUsd, amountUsd });
  return Response.json({ ok: true });
}
