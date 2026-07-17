import { SuiGrpcClient } from "@mysten/sui/grpc";
import type { Transaction } from "@mysten/sui/transactions";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import {
  buildCreateJobTx,
  buildDeliverJobTx,
  buildRefundJobTx,
  buildRejectJobTx,
  buildReleaseJobTx,
} from "@t2000/sdk";
import { prepareSponsoredTx } from "@/lib/agent/sponsored";
import { openAiError } from "@/lib/api/keys";
import { env } from "@/lib/env";
import { checkAgentIpRateLimit, clientIp } from "@/lib/ratelimit";

// POST /v1/job/prepare { address, action, params } → { nonce, txBytes }
//
// A2A escrow (SPEC_A2A_ESCROW, t2 Agents Phase 3): builds the requested
// `a2a_escrow::escrow` transaction server-side (sender = the caller's wallet,
// gas owner = the t2000 sponsor) and stashes the exact bytes under a
// single-use nonce; the wallet signs those bytes and calls /v1/job/submit.
// Same sponsored-tx machinery as agent register — the server NEVER sponsors
// client-supplied bytes, and the Move calls authorize on `ctx.sender()`, so
// sponsorship cannot weaken job auth. The sponsor never touches the escrowed
// USDC: `create` sources the coin from the BUYER's own balance at build time.
//
// Public machine endpoint (the wallet's signature over the tx IS the auth).

const ACTIONS = ["create", "deliver", "release", "reject", "refund"] as const;
type JobAction = (typeof ACTIONS)[number];

const NETWORK = (env.NEXT_PUBLIC_SUI_NETWORK ?? "mainnet") as
  | "mainnet"
  | "testnet";

function makeClient(): SuiGrpcClient {
  const baseUrl =
    NETWORK === "testnet"
      ? "https://fullnode.testnet.sui.io"
      : "https://fullnode.mainnet.sui.io";
  return new SuiGrpcClient({ baseUrl, network: NETWORK });
}

function requireJobId(params: Record<string, unknown>): string {
  const jobId = normalizeSuiAddress(String(params.jobId ?? "").trim());
  if (!isValidSuiAddress(jobId)) {
    throw new Error("A valid jobId (0x…) is required.");
  }
  return jobId;
}

async function buildJobTx(
  action: JobAction,
  actor: string,
  params: Record<string, unknown>
): Promise<Transaction> {
  switch (action) {
    case "create": {
      const seller = String(params.seller ?? "").trim();
      // buildCreateJobTx preflights everything else (cap, deadline, split,
      // hash shape) and throws T2000Error with a precise message.
      return await buildCreateJobTx({
        client: makeClient(),
        buyer: actor,
        terms: {
          seller,
          amountUsdc: Number(params.amountUsdc),
          specHash: String(params.specHash ?? ""),
          deliverByMs: Number(params.deliverByMs),
          reviewWindowMs: Number(params.reviewWindowMs),
          rejectSplitBps: Number(params.rejectSplitBps),
        },
      });
    }
    case "deliver":
      return buildDeliverJobTx(
        requireJobId(params),
        String(params.deliveryHash ?? "")
      );
    case "release":
      return buildReleaseJobTx(requireJobId(params));
    case "reject":
      return buildRejectJobTx(requireJobId(params));
    case "refund":
      return buildRefundJobTx(requireJobId(params));
    default:
      throw new Error(`Unknown action: ${String(action)}`);
  }
}

export async function POST(request: Request) {
  if (!(await checkAgentIpRateLimit(clientIp(request)))) {
    return openAiError(
      429,
      "Too many requests — slow down.",
      "rate_limit_error",
      "rate_limit_exceeded"
    );
  }

  let address: string;
  let action: JobAction;
  let params: Record<string, unknown>;
  try {
    const body = await request.json();
    address = normalizeSuiAddress(String(body?.address ?? "").trim());
    action = String(body?.action ?? "") as JobAction;
    params =
      body?.params && typeof body.params === "object"
        ? (body.params as Record<string, unknown>)
        : {};
  } catch {
    return openAiError(
      400,
      "Bad request.",
      "invalid_request_error",
      "bad_request"
    );
  }
  if (!isValidSuiAddress(address)) {
    return openAiError(
      400,
      "A valid Sui address is required.",
      "invalid_request_error",
      "invalid_address"
    );
  }
  if (!ACTIONS.includes(action)) {
    return openAiError(
      400,
      `action must be one of: ${ACTIONS.join(", ")}.`,
      "invalid_request_error",
      "bad_request"
    );
  }

  let tx: Transaction;
  try {
    tx = await buildJobTx(action, address, params);
  } catch (e) {
    return openAiError(
      400,
      e instanceof Error ? e.message : "Could not build the job transaction.",
      "invalid_request_error",
      "build_failed"
    );
  }

  const prepared = await prepareSponsoredTx(address, tx);
  if (!prepared.ok) {
    if (prepared.reason === "unconfigured") {
      return openAiError(
        503,
        "Job transactions are temporarily unavailable.",
        "api_error",
        "service_unavailable"
      );
    }
    // Build-time simulation failure — surfaces Move aborts (wrong state,
    // deadline passed, not your job) with the node's message so the CLI can
    // show the actual rule that failed.
    return openAiError(
      400,
      prepared.message,
      "invalid_request_error",
      "build_failed"
    );
  }
  return Response.json({ nonce: prepared.nonce, txBytes: prepared.txBytes });
}
