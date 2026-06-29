import { getTreasuryAddress, recordStablecoinTopup } from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import { env } from "@/lib/env";

// USDC → credit top-up. GET returns the treasury address (the client always
// pays the server-authoritative wallet); POST verifies the signed transfer
// on-chain and credits the exact amount received. Granting lives in the shared
// `recordUsdcTopup` (idempotent on the digest), never trusting a client amount.

export function GET() {
  return Response.json({
    treasury: getTreasuryAddress(),
    network: env.NEXT_PUBLIC_SUI_NETWORK,
  });
}

export async function POST(request: Request) {
  const session = await getCurrentUser();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
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
    balanceUsd: (Math.floor(result.balanceMicros / 10_000) / 100).toFixed(2),
  });
}
