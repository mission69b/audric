import {
  isSessionExpired,
  loadSession,
  toZkLoginSigner,
} from "@audric/auth/client";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { payWithMpp } from "@t2000/sdk/browser";
import { env } from "@/lib/env";

// Try-it checkout (§II.15a stage 4): buy a store listing from the browser.
// The Passport session signs the x402 payment (sign-then-settle — the GATEWAY
// submits, so a failed delivery is auto-refunded and a failed settle is never
// charged); the service response comes back in the same round trip.
//
// Money source: the wallet's ON-CHAIN USDC (not platform credit — §II.15b.5).
// Hard per-tap cap: $5 (marketplace services are cents; bounds hostile prices).
const RAIL_BASE = "https://x402.t2000.ai";
export const TRY_IT_CAP_USD = 5;

export type TryResult = {
  paid: boolean;
  /** The seller's service response (already parsed when JSON). */
  response: unknown;
  /** Settlement digest (the on-chain receipt), when available. */
  digest?: string;
  /** True when the gateway reported a refund (failed delivery). */
  refunded?: boolean;
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

export async function tryService(opts: {
  seller: string;
  priceUsdc: string;
}): Promise<TryResult> {
  const session = loadSession();
  if (!session || isSessionExpired(session)) {
    throw new Error("Sign in first — your session is missing or expired.");
  }

  const price = Number.parseFloat(opts.priceUsdc);
  if (!Number.isFinite(price) || price <= 0 || price > TRY_IT_CAP_USD) {
    throw new Error(
      `This listing's price ($${opts.priceUsdc}) is outside the in-browser cap ($${TRY_IT_CAP_USD}). Use the CLI: t2 agent pay ${opts.seller}`
    );
  }

  const signer = toZkLoginSigner(session);
  const result = await payWithMpp({
    signer,
    client: grpcClient(),
    options: {
      url: `${RAIL_BASE}/commerce/pay/${opts.seller}`,
      method: "POST",
      // The declared price is the exact charge; cap approves nothing above it.
      maxPrice: price,
    },
  });

  const body = result.body as
    | {
        ok?: boolean;
        error?: string;
        refunded?: boolean;
        receipt?: { collectDigest?: string };
        response?: unknown;
      }
    | undefined;

  return {
    paid: result.paid,
    response: body?.response ?? body,
    digest: body?.receipt?.collectDigest,
    refunded: body?.refunded,
    error: body?.ok === false ? (body?.error ?? "Delivery failed.") : undefined,
  };
}
