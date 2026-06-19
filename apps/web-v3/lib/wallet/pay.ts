// ⚠️ SHELVED (S.478) — not currently wired (generic in-chat x402 cut from MVP).
// PRESERVED: this is the proven client-side x402 pay loop, reused by Phase 4b
// Recipes (a Recipe = a sequence of payService calls). The same session→signer
// bridge pattern also backs send_transfer (4a).
/**
 * Client-side x402 pay executor (Audric v3 — the "green MPP loop").
 *
 * Runs ENTIRELY in the browser on the zkLogin Passport session key:
 *   session (localStorage) → ZkLoginSigner → payWithMpp → the gateway settles.
 *
 * This is the bridge our Phase-4 money writes ride: the SDK's browser-safe
 * `payWithMpp` signs the x402 authorization client-side and the gateway submits
 * (settle-then-serve — a failed upstream is auto-refunded, never charged, so we
 * never blind-retry). USDC is gasless at the Sui protocol level, so there is no
 * Enoki gas sponsorship and no SUI required.
 *
 * The `mpp_call` agent tool (p4a-services) calls this on approval; the dev probe
 * page calls it directly to validate the signer end-to-end first.
 */

import { SuiGrpcClient } from "@mysten/sui/grpc";
import {
  type PayOptions,
  type PayResult,
  payWithMpp,
} from "@t2000/sdk/browser";
import { env } from "@/lib/env";
import { isSessionExpired, loadSession, toZkLoginSigner } from "@/lib/zklogin";

function grpcClient(): SuiGrpcClient {
  const network =
    env.NEXT_PUBLIC_SUI_NETWORK === "testnet" ? "testnet" : "mainnet";
  const baseUrl =
    network === "testnet"
      ? "https://fullnode.testnet.sui.io"
      : "https://fullnode.mainnet.sui.io";
  return new SuiGrpcClient({ baseUrl, network });
}

/**
 * Pay for + call an x402 Service from the signed-in Passport. Throws if there is
 * no live session (the caller should gate on auth + surface the error verbatim —
 * never blind-retry, per the no-charge-on-failure rail contract).
 */
export function payService(options: PayOptions): Promise<PayResult> {
  const session = loadSession();
  if (!session) {
    throw new Error("Not signed in — connect your Passport first.");
  }
  if (isSessionExpired(session)) {
    throw new Error("Your session expired — sign in again.");
  }
  const signer = toZkLoginSigner(session);
  return payWithMpp({ signer, client: grpcClient(), options });
}
