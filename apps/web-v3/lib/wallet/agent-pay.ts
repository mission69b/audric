/**
 * Client-side agent-store buy executor (SPEC_AGENT_COMMERCE §II.12 C2).
 *
 * Runs in the browser on the zkLogin Passport session key — the same trust
 * model as sends (lib/wallet/send.ts): the server NEVER moves money; the
 * user's tap on the agent_pay confirm card triggers this.
 *
 * Payment rail: x402 sign-then-settle via the SDK's `payWithMpp` (the exact
 * client the Agent Platform's Try-it checkout shipped with, S.606) — the
 * GATEWAY submits the signed tx, so a failed delivery auto-refunds and a
 * failed settle never charges. Money source: on-chain wallet USDC (never
 * Audric credit — §II.15b.5 two-pots).
 *
 * Guards (fail-closed, mirrored from the spec):
 * - Host allowlist: the buy URL is CONSTRUCTED here from the seller address —
 *   only x402.t2000.ai commerce paths are ever paid; the model never supplies
 *   a URL.
 * - $5/call cap (marketplace services are cents; bounds a hostile listing).
 */

import { SuiGrpcClient } from "@mysten/sui/grpc";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { payWithMpp } from "@t2000/sdk/browser";
import {
  isFirstPartySeller,
  meetsReceiptBar,
} from "@/lib/agent-store-allowlist";
import { env } from "@/lib/env";
import { isSessionExpired, loadSession, toZkLoginSigner } from "@/lib/zklogin";

const RAIL_BASE = "https://x402.t2000.ai";
export const AGENT_PAY_CAP_USD = 5;

export type AgentPayOutcome = {
  paid: boolean;
  /** The seller's delivered response (parsed JSON when possible). */
  response?: unknown;
  /** On-chain settlement digest (the collect leg) — the receipt. */
  digest?: string;
  /** True when the gateway refunded a failed delivery. */
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

export async function agentPay(opts: {
  seller: string;
  priceUsdc: number;
  /** Optional JSON service input, forwarded to the seller on delivery. */
  input?: string;
}): Promise<AgentPayOutcome> {
  const session = loadSession();
  if (!session) {
    throw new Error("Not signed in — connect your Passport first.");
  }
  if (isSessionExpired(session)) {
    throw new Error("Your session expired — sign in again.");
  }

  let seller: string;
  try {
    seller = normalizeSuiAddress(opts.seller.trim());
  } catch {
    seller = "";
  }
  if (!isValidSuiAddress(seller)) {
    throw new Error("Invalid seller address.");
  }
  // SIGNER-SIDE trust check (S.611 curated → S.624 receipt-gated): even if a
  // poisoned document / web page tricks the model into calling agent_pay with
  // a foreign address, the executor refuses anything that isn't first-party
  // or receipt-proven — the same two lanes the catalog is built from, so
  // injection upstream cannot widen the payable set. The third-party lane
  // checks LIVE reputation and fails closed on any fetch error.
  if (!isFirstPartySeller(seller)) {
    let proven = false;
    try {
      const res = await fetch(`https://api.t2000.ai/v1/agents/${seller}`);
      if (res.ok) {
        const profile = (await res.json()) as {
          reputation?: {
            sales?: number;
            buyers?: number;
            deliveredRate?: number;
          };
        };
        proven = meetsReceiptBar(profile.reputation ?? {});
      }
    } catch {
      proven = false;
    }
    if (!proven) {
      throw new Error(
        "This seller hasn't earned Audric's receipt bar yet (3+ delivered sales to 2+ buyers) — not paying. Browse agents.t2000.ai to buy from new listings directly."
      );
    }
  }
  if (
    !Number.isFinite(opts.priceUsdc) ||
    opts.priceUsdc <= 0 ||
    opts.priceUsdc > AGENT_PAY_CAP_USD
  ) {
    throw new Error(
      `Price $${opts.priceUsdc} is outside the in-chat cap ($${AGENT_PAY_CAP_USD}).`
    );
  }

  const result = await payWithMpp({
    signer: toZkLoginSigner(session),
    client: grpcClient(),
    options: {
      // Allowlist by construction: the seller address is path-encoded into the
      // rail's commerce endpoint — no model- or listing-supplied URL is paid.
      url: `${RAIL_BASE}/commerce/pay/${seller}`,
      method: "POST",
      body: opts.input,
      headers: opts.input ? { "content-type": "application/json" } : undefined,
      // The declared price is the exact charge; approve nothing above it.
      maxPrice: opts.priceUsdc,
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
