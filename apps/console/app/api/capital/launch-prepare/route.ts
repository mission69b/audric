import { getCurrentUser } from "@audric/auth/server";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { toBase64 } from "@mysten/sui/utils";
import { buildPublishAgentCoinTx } from "@t2000/sdk";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

// POST /api/capital/launch-prepare — PTB 1 of tokenize-your-agent
// (SPEC_ACP_SUI §6): publish the agent's coin package + burn its UpgradeCap.
// Session-authed; the LAUNCHER is always the signed-in Passport, which also
// receives the full minted supply (split 50/50 in PTB 2). UNSPONSORED by
// design: the launch path seeds LP from the launcher's own SUI, so t2000
// never fronts gas or liquidity here.
export const maxDuration = 30;

function grpcClient(): SuiGrpcClient {
  const network =
    env.NEXT_PUBLIC_SUI_NETWORK === "testnet" ? "testnet" : "mainnet";
  const baseUrl =
    network === "testnet"
      ? "https://fullnode.testnet.sui.io"
      : "https://fullnode.mainnet.sui.io";
  return new SuiGrpcClient({ baseUrl, network });
}

export async function POST(request: NextRequest) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const launcher = session.user.id;

  let symbol: string;
  let name: string;
  let description: string;
  let iconUrl: string;
  try {
    const body = await request.json();
    symbol = String(body?.symbol ?? "").trim();
    name = String(body?.name ?? "").trim();
    description = String(body?.description ?? "").trim();
    iconUrl = String(body?.iconUrl ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  try {
    const { tx, moduleName, otw } = await buildPublishAgentCoinTx({
      coin: { symbol, name, description, iconUrl, recipient: launcher },
      launcher,
    });
    tx.setGasBudget(80_000_000n); // 0.08 SUI cap; measured ~0.015
    const txBytes = await tx.build({ client: grpcClient() });
    return NextResponse.json({
      txBytes: toBase64(txBytes),
      moduleName,
      otw,
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Couldn't prepare the launch.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
