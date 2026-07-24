import { getCurrentUser } from "@audric/auth/server";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { normalizeSuiAddress, toBase64 } from "@mysten/sui/utils";
import { AGENT_ID_REGISTRY_ID } from "@t2000/id";
import { buildTokenizeTx, MIN_LP_SUI } from "@t2000/sdk";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

// POST /api/capital/tokenize-prepare — PTB 2: bind the coin type to the
// Agent ID, split the supply 50/50, create the Cetus AGENT/SUI pool, lock
// the LP for 10 years (fees → agent wallet only), finalize the registry —
// one atomic transaction. The pair orientation Cetus requires is discovered
// by SIMULATING (AGENT, SUI) first and flipping on the factory's
// wrong-order abort — deterministic, no local comparator to drift.
export const maxDuration = 60;

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

  let agent: string;
  let coinType: string;
  let supplyCoinId: string;
  let coinMetadataId: string;
  let lpSuiMist: bigint;
  let poolUrl: string | undefined;
  try {
    const body = await request.json();
    agent = normalizeSuiAddress(String(body?.agent ?? "").trim());
    coinType = String(body?.coinType ?? "").trim();
    supplyCoinId = normalizeSuiAddress(String(body?.supplyCoinId ?? "").trim());
    coinMetadataId = normalizeSuiAddress(
      String(body?.coinMetadataId ?? "").trim()
    );
    lpSuiMist = BigInt(String(body?.lpSuiMist ?? "0"));
    poolUrl = body?.poolUrl ? String(body.poolUrl) : undefined;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (lpSuiMist < MIN_LP_SUI) {
    return NextResponse.json(
      { error: "Seed at least 1 SUI of liquidity." },
      { status: 400 }
    );
  }

  const client = grpcClient();
  const build = async (suiFirst: boolean) => {
    const tx = buildTokenizeTx({
      agent,
      launcher,
      coinType,
      supplyCoinId,
      coinMetadataId,
      lpSuiAmount: lpSuiMist,
      poolUrl,
      suiFirst,
      agentRegistryId: AGENT_ID_REGISTRY_ID,
    });
    tx.setGasBudget(1_000_000_000n); // 1 SUI cap — pool creation is heavy
    return await tx.build({ client });
  };

  try {
    for (const suiFirst of [false, true]) {
      const txBytes = await build(suiFirst);
      const sim = await client.core.simulateTransaction({
        transaction: txBytes,
        include: { effects: true },
      });
      const txn =
        sim.$kind === "Transaction" ? sim.Transaction : sim.FailedTransaction;
      if (txn?.status?.success) {
        return NextResponse.json({ txBytes: toBase64(txBytes), suiFirst });
      }
      const err = JSON.stringify(txn?.status ?? {});
      // Cetus factory rejects the un-canonical pair order — try the flip.
      // Any other abort is a real error and must surface.
      if (!(err.includes("pool_creator") || err.includes("factory"))) {
        return NextResponse.json(
          { error: `Simulation failed: ${err.slice(0, 400)}` },
          { status: 400 }
        );
      }
    }
    return NextResponse.json(
      { error: "Pool creation failed in both pair orientations." },
      { status: 400 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Couldn't prepare.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
