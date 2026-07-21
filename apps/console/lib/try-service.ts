import {
  isSessionExpired,
  loadSession,
  toZkLoginSigner,
} from "@audric/auth/client";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { payWithMpp } from "@t2000/sdk/browser";
import { env } from "@/lib/env";

// Try-it checkout (the store-era §II.15a stage-4 pattern, pointed at the MPP
// CATALOG): buy one call to a cataloged endpoint from the browser. The
// Passport session signs the x402 payment; the service response comes back
// in the same round trip. Proxied services settle through the gateway (no
// charge on failure); DIRECT sellers settle straight to their wallet (no
// automatic refund) and the SDK auto-reports the digest to the activity
// ledger (S.743).
//
// Money source: the wallet's ON-CHAIN USDC (not platform credit).
// Hard per-tap cap: $5 (catalog services are cents; bounds hostile prices).
export const TRY_IT_CAP_USD = 5;

export type TryResult = {
  paid: boolean;
  status: number;
  /** The service response (already parsed when JSON). */
  response: unknown;
  /** Settlement digest (the on-chain receipt), when available. */
  digest?: string;
  error?: string;
};

function grpcClient(): SuiGrpcClient {
  const network =
    env.NEXT_PUBLIC_SUI_NETWORK === "testnet" ? "testnet" : "mainnet";
  const baseUrl =
    network === "testnet"
      ? "https://fullnode.testnet.sui.io"
      : "https://fullnode.mainnet.sui.io";
  return new SuiGrpcClient({ baseUrl, network });
}

export function hasWalletSession(): boolean {
  const session = loadSession();
  return Boolean(session && !isSessionExpired(session));
}

export async function tryEndpoint(opts: {
  /** The service's own origin (catalog serviceUrl) + endpoint path. */
  url: string;
  method: string;
  body?: string;
  priceUsdc: string;
}): Promise<TryResult> {
  const session = loadSession();
  if (!session || isSessionExpired(session)) {
    throw new Error("Sign in first — your session is missing or expired.");
  }

  const price = Number.parseFloat(opts.priceUsdc);
  if (!Number.isFinite(price) || price <= 0 || price > TRY_IT_CAP_USD) {
    throw new Error(
      `This endpoint's price ($${opts.priceUsdc}) is outside the in-browser cap ($${TRY_IT_CAP_USD}). Use the CLI: t2 pay ${opts.url}`
    );
  }

  const method = opts.method.toUpperCase();
  const signer = toZkLoginSigner(session);
  const result = await payWithMpp({
    signer,
    client: grpcClient(),
    options: {
      url: opts.url,
      method,
      body: method === "GET" || method === "HEAD" ? undefined : opts.body,
      // The listed price is the exact charge; approve nothing above it.
      maxPrice: price,
    },
  });

  const ok = result.status >= 200 && result.status < 300;
  return {
    paid: result.paid,
    status: result.status,
    response: result.body,
    digest: result.receipt?.reference,
    error: ok ? undefined : failureMessage(result.status, result.body),
  };
}

/** Non-2xx → surface the seller's own reason. A serve-style 402/422 carries
 *  `{ error }` in the body ("settlement failed: …", "invalid payment: …") —
 *  swallowing it turns a diagnosable failure into "HTTP 402" (dogfood,
 *  2026-07-21: a failing wallet couldn't be debugged from the UI). */
function failureMessage(status: number, body: unknown): string {
  const detail =
    body && typeof body === "object" && "error" in body
      ? String((body as { error: unknown }).error)
      : typeof body === "string" && body.length > 0
        ? body
        : "";
  const base = `The service answered HTTP ${status}.`;
  return detail ? `${base} ${detail.slice(0, 400)}` : base;
}
