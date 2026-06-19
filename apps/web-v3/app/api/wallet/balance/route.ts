import { SuiGrpcClient } from "@mysten/sui/grpc";
import { queryBalance } from "@t2000/sdk";
import { auth } from "@/app/(auth)/auth";
import { env } from "@/lib/env";

/**
 * Authed Passport balance for the ambient sidebar readout (§5c). Reuses the
 * SDK's canonical priced reader (queryBalance) keyed by the signed-in user's
 * Sui address — same source as the balance_check tool. Ambient, not a dashboard.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const network =
    env.NEXT_PUBLIC_SUI_NETWORK === "testnet" ? "testnet" : "mainnet";
  const baseUrl =
    network === "testnet"
      ? "https://fullnode.testnet.sui.io"
      : "https://fullnode.mainnet.sui.io";

  try {
    const client = new SuiGrpcClient({ baseUrl, network });
    const balance = await queryBalance(client, session.user.id);
    return Response.json({
      usdc: balance.stables.USDC ?? 0,
      totalUsd: balance.totalUsd,
    });
  } catch {
    // Surface a soft null (the sidebar shows "—") rather than erroring the UI.
    return Response.json({ usdc: null, totalUsd: null });
  }
}
