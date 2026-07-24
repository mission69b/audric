import { getCurrentUser } from "@audric/auth/server";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { fromBase64 } from "@mysten/sui/utils";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

const COIN_TYPE_RE = /^.*Coin<(.+)>$/;

// POST /api/capital/launch-submit { txBytes, signature } — execute the
// browser-signed coin publish (PTB 1) and hand back what PTB 2 needs:
// the published coin type, the supply Coin object, and its CoinMetadata.
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
      include: { effects: true, objectTypes: true },
    });
    const txn =
      result.$kind === "Transaction"
        ? result.Transaction
        : result.FailedTransaction;
    if (!txn?.effects?.status?.success) {
      return NextResponse.json(
        { error: "Publish failed on-chain.", status: txn?.effects?.status },
        { status: 502 }
      );
    }
    await client.core
      .waitForTransaction({ digest: txn.digest })
      .catch(() => undefined);

    const types = txn.objectTypes ?? {};
    const created = (txn.effects.changedObjects ?? []).filter(
      (c) => c.idOperation === "Created"
    );
    const byType = (frag: string) =>
      created.find((c) => (types[c.objectId] ?? "").includes(frag));
    const supplyCoin = byType("::coin::Coin<");
    const metadata = byType("::coin::CoinMetadata<");
    // `Coin<PKG::mod::OTW>` → the coin type between the angle brackets.
    const coinType = supplyCoin
      ? (types[supplyCoin.objectId] ?? "").replace(COIN_TYPE_RE, "$1")
      : "";
    if (!(supplyCoin && metadata && coinType)) {
      return NextResponse.json(
        {
          error: "Publish succeeded but objects were not found.",
          digest: txn.digest,
        },
        { status: 502 }
      );
    }
    return NextResponse.json({
      digest: txn.digest,
      coinType,
      supplyCoinId: supplyCoin.objectId,
      coinMetadataId: metadata.objectId,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Execution failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
