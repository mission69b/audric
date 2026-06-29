import { auth } from "@/app/(auth)/auth";
import { getTreasuryAddress, recordStablecoinTopup } from "@/lib/db/queries";
import { isCreditConfigured } from "@/lib/stripe";

// USDC → credit top-up (the crypto-native funding rail, shared with the t2000
// console via `recordUsdcTopup`). GET returns the treasury address the client
// pays; POST verifies the signed transfer on-chain and credits the exact
// amount received. Granting is idempotent on the digest.

export function GET() {
  // The credit ledger must be live for credit to mean anything.
  if (!isCreditConfigured()) {
    return Response.json({ configured: false });
  }
  return Response.json({ configured: true, treasury: getTreasuryAddress() });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isCreditConfigured()) {
    return Response.json(
      { error: "Credit is not available." },
      {
        status: 503,
      }
    );
  }

  let digest: string;
  try {
    const body = await request.json();
    digest = String(body?.digest ?? "").trim();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  if (!digest) {
    return Response.json(
      { error: "Missing transaction digest." },
      {
        status: 400,
      }
    );
  }

  const result = await recordStablecoinTopup({
    userId: session.user.id,
    digest,
  });
  if (!result.ok) {
    return Response.json(
      { error: result.error, code: result.code },
      {
        status: result.code === "not_found" ? 409 : 400,
      }
    );
  }

  return Response.json({
    credited: result.applied,
    amountUsd: result.amountUsd,
    asset: result.asset,
    balanceUsd: result.balanceMicros / 1_000_000,
  });
}
