import {
  isSessionExpired,
  loadSession,
  toZkLoginSigner,
} from "@audric/auth/client";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { buildSendTx, executeTx } from "@t2000/sdk/browser";
import { ZK_CONFIG } from "@/lib/zk-config";

/**
 * USDC top-up — client half (runs in the browser on the Passport session key).
 *
 * Asks the server for the treasury address, signs a gasless USDC transfer to
 * it from the user's Passport, then hands the digest back to the server, which
 * verifies the transfer on-chain and credits the balance. The amount credited
 * is whatever the server reads on-chain — never a client-claimed number.
 */

function grpcClient(): SuiGrpcClient {
  const network = ZK_CONFIG.network === "testnet" ? "testnet" : "mainnet";
  const baseUrl =
    network === "testnet"
      ? "https://fullnode.testnet.sui.io"
      : "https://fullnode.mainnet.sui.io";
  return new SuiGrpcClient({ baseUrl, network });
}

type TopupResult = {
  credited: boolean;
  amountUsd: number;
  asset: string;
  balanceUsd: string;
};

export type TopupAsset = "USDC" | "USDsui";

export async function payStablecoinTopup(
  amount: number,
  asset: TopupAsset = "USDC"
): Promise<TopupResult> {
  const session = loadSession();
  if (!session) {
    throw new Error("Sign in with your Passport first.");
  }
  if (isSessionExpired(session)) {
    throw new Error("Your session expired — sign in again.");
  }

  // The server is authoritative for the treasury address — fetch it, don't
  // hardcode it client-side.
  const cfgRes = await fetch("/api/billing/usdc-topup");
  if (!cfgRes.ok) {
    throw new Error("Couldn't reach the top-up service.");
  }
  const { treasury } = (await cfgRes.json()) as { treasury: string };

  const signer = toZkLoginSigner(session);
  const client = grpcClient();

  const { digest } = await executeTx(
    client,
    signer,
    () =>
      buildSendTx({
        client,
        address: signer.getAddress(),
        to: treasury,
        amount,
        asset,
      }),
    { buildClient: client }
  );

  return await confirmTopup(digest);
}

// The payment is already on-chain — confirm + credit is idempotent on the
// digest, so retry transient "not confirmed yet" (409) / server blips a few
// times before giving up. On final failure, surface the digest so the paid
// user has a recovery reference (re-submitting later still credits).
async function confirmTopup(digest: string): Promise<TopupResult> {
  const CONFIRM_ATTEMPTS = 4;
  let lastError = "Couldn't confirm the top-up.";
  for (let i = 0; i < CONFIRM_ATTEMPTS; i++) {
    const res = await fetch("/api/billing/usdc-topup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ digest }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      return j as TopupResult;
    }
    lastError = j?.error ?? lastError;
    // 409 = indexer lag (retryable); 5xx = transient. 400 = terminal.
    const retryable = res.status === 409 || res.status >= 500;
    if (!retryable) {
      throw new Error(lastError);
    }
    if (i < CONFIRM_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error(
    `${lastError} Your payment is safe (tx ${digest.slice(0, 8)}…) — reopen Billing in a minute to credit it.`
  );
}
