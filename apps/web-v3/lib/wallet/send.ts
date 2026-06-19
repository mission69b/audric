/**
 * Client-side P2P send executor (Audric v3 — the money path's second write).
 *
 * Runs in the browser on the zkLogin Passport session key, mirroring payService:
 *   session (localStorage) → ZkLoginSigner → buildSendTx → executeTx (gasless).
 *
 * USDC/USDsui transfers are gasless at the Sui protocol level (`balance::
 * send_funds`) — no Enoki sponsorship, no SUI required. The send_transfer agent
 * tool calls this on the user's tap-to-confirm (Allow).
 */

import { SuiGrpcClient } from "@mysten/sui/grpc";
import { buildSendTx, executeTx } from "@t2000/sdk/browser";
import { env } from "@/lib/env";
import { isSessionExpired, loadSession, toZkLoginSigner } from "@/lib/zklogin";

export type SendableAsset = "USDC" | "USDsui" | "SUI";

function grpcClient(): SuiGrpcClient {
  const network =
    env.NEXT_PUBLIC_SUI_NETWORK === "testnet" ? "testnet" : "mainnet";
  const baseUrl =
    network === "testnet"
      ? "https://fullnode.testnet.sui.io"
      : "https://fullnode.mainnet.sui.io";
  return new SuiGrpcClient({ baseUrl, network });
}

export async function sendTransfer(opts: {
  to: string;
  amount: number;
  asset: SendableAsset;
}): Promise<{ digest: string }> {
  const session = loadSession();
  if (!session) {
    throw new Error("Not signed in — connect your Passport first.");
  }
  if (isSessionExpired(session)) {
    throw new Error("Your session expired — sign in again.");
  }
  const signer = toZkLoginSigner(session);
  const client = grpcClient();

  const result = await executeTx(
    client,
    signer,
    () =>
      buildSendTx({
        client,
        address: signer.getAddress(),
        to: opts.to,
        amount: opts.amount,
        asset: opts.asset,
      }),
    { buildClient: client }
  );

  return { digest: result.digest };
}
