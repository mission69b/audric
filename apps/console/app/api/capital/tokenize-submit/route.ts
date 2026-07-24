import { getCurrentUser } from "@audric/auth/server";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { fromBase64 } from "@mysten/sui/utils";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

// POST /api/capital/tokenize-submit { txBytes, signature } — execute the
// browser-signed tokenize PTB (bind → pool → 10y lock → finalize) and return
// the market's on-chain coordinates from the emitted events.
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

  let txBytes: string;
  let signature: string;
  try {
    const body = await request.json();
    txBytes = String(body?.txBytes ?? "").trim();
    signature = String(body?.signature ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!(txBytes && signature)) {
    return NextResponse.json(
      { error: "txBytes and signature are required." },
      { status: 400 }
    );
  }

  try {
    const client = grpcClient();
    const result = await client.core.executeTransaction({
      transaction: fromBase64(txBytes),
      signatures: [signature],
      include: { effects: true, events: true },
    });
    const txn =
      result.$kind === "Transaction"
        ? result.Transaction
        : result.FailedTransaction;
    if (!txn?.effects?.status?.success) {
      return NextResponse.json(
        { error: "Tokenize failed on-chain.", status: txn?.effects?.status },
        { status: 502 }
      );
    }
    await client.core
      .waitForTransaction({ digest: txn.digest })
      .catch(() => undefined);

    // AgentTokenFinalized carries pool_id + lock_id.
    let poolId: string | undefined;
    let lockId: string | undefined;
    for (const ev of txn.events ?? []) {
      if (ev.eventType?.endsWith("::registry::AgentTokenFinalized")) {
        const parsed = ev.json as
          | { pool_id?: string; lock_id?: string }
          | undefined;
        poolId = parsed?.pool_id;
        lockId = parsed?.lock_id;
      }
    }
    return NextResponse.json({ digest: txn.digest, poolId, lockId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Execution failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
