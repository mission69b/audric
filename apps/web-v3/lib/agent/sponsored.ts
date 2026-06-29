import "server-only";

import { randomBytes } from "node:crypto";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import type { Transaction } from "@mysten/sui/transactions";
import { fromBase64, toBase64 } from "@mysten/sui/utils";
import { env } from "@/lib/env";
import { getReadyRedisClient } from "@/lib/ratelimit";

// Generalized sponsored-transaction machinery — Agent ID B.1 (shared by gate 5b
// register + gate 7 ownership link). The registry calls require `sender ==
// actor`, but actors (agents, or human owners with a fresh Passport) may hold 0
// SUI → native SPONSORED tx: the actor is the sender (auth holds), the sponsor
// (0x6988, holds SUI) owns + pays gas.
//
// Two-phase, Redis-backed for safety: `prepare` builds the FULL tx server-side
// (sender=actor, gasOwner=sponsor) and stores the EXACT bytes under a single-use
// nonce; the actor signs those bytes; `submit` loads the STORED bytes (so we
// never sponsor client-supplied bytes — a gas-drain vuln), sponsor-co-signs, and
// executes. Per-action abort interpretation (e.g. register's "already
// registered") is left to the caller.

const NETWORK = (env.NEXT_PUBLIC_SUI_NETWORK ?? "mainnet") as
  | "mainnet"
  | "testnet";
const PREFIX = "agent-sponsored:";
const TTL_SECONDS = 5 * 60;
// 0.02 SUI — each is a single small MoveCall; generous headroom.
const SPONSORED_GAS_BUDGET = 20_000_000n;

/** True when the sponsor key is provisioned (sponsored txs available). */
export function isSponsorConfigured(): boolean {
  return Boolean(env.AGENT_ID_PARENT_NFT_PRIVATE_KEY);
}

function loadSponsorKeypair(): Ed25519Keypair | null {
  const raw = env.AGENT_ID_PARENT_NFT_PRIVATE_KEY;
  if (!raw) {
    return null;
  }
  try {
    const { scheme, secretKey } = decodeSuiPrivateKey(raw);
    if (scheme !== "ED25519") {
      return null;
    }
    return Ed25519Keypair.fromSecretKey(secretKey);
  } catch {
    return null;
  }
}

function makeGrpcClient(): SuiGrpcClient {
  const baseUrl =
    NETWORK === "testnet"
      ? "https://fullnode.testnet.sui.io"
      : "https://fullnode.mainnet.sui.io";
  return new SuiGrpcClient({ baseUrl, network: NETWORK });
}

export type SponsoredPrepareResult =
  | { ok: true; nonce: string; txBytes: string }
  | { ok: false; reason: "unconfigured" }
  | { ok: false; reason: "build_failed"; message: string };

/**
 * Set sender=actor + gas owner=sponsor on `tx`, build the bytes, and stash them
 * under a single-use nonce. The gRPC `build()` resolves via simulation, so a tx
 * that would Move-abort surfaces HERE (build_failed + message) — callers can
 * classify the abort (e.g. register → already-registered).
 */
export async function prepareSponsoredTx(
  actor: string,
  tx: Transaction
): Promise<SponsoredPrepareResult> {
  const sponsor = loadSponsorKeypair();
  if (!sponsor) {
    return { ok: false, reason: "unconfigured" };
  }
  const redis = await getReadyRedisClient();
  if (!redis) {
    return { ok: false, reason: "unconfigured" };
  }
  try {
    const client = makeGrpcClient();
    tx.setSender(actor);
    tx.setGasOwner(sponsor.toSuiAddress());
    tx.setGasBudget(SPONSORED_GAS_BUDGET);
    const txBytes = toBase64(await tx.build({ client }));
    const nonce = randomBytes(24).toString("base64url");
    await redis.set(`${PREFIX}${nonce}`, JSON.stringify({ actor, txBytes }), {
      EX: TTL_SECONDS,
    });
    return { ok: true, nonce, txBytes };
  } catch (e) {
    return {
      ok: false,
      reason: "build_failed",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export type SponsoredSubmitResult =
  | { ok: true; digest: string }
  | { ok: false; reason: "unconfigured" }
  | { ok: false; reason: "expired" }
  | { ok: false; reason: "aborted"; digest: string; message: string }
  | { ok: false; reason: "failed"; message: string };

/**
 * Load the stored (server-built) bytes for `nonce`, sponsor-co-sign, and execute
 * with [actorSignature, sponsorSignature]. A Move-abort is surfaced as
 * `reason: "aborted"` (the tx executed but reverted) so callers can interpret it.
 */
export async function submitSponsoredTx(opts: {
  nonce: string;
  actor: string;
  actorSignature: string;
}): Promise<SponsoredSubmitResult> {
  const sponsor = loadSponsorKeypair();
  if (!sponsor) {
    return { ok: false, reason: "unconfigured" };
  }
  const redis = await getReadyRedisClient();
  if (!redis) {
    return { ok: false, reason: "unconfigured" };
  }

  // Single-use load (GETDEL), bound to the actor it was prepared for.
  const raw = await redis.getDel(`${PREFIX}${opts.nonce}`);
  if (!raw) {
    return { ok: false, reason: "expired" };
  }
  let stored: { actor: string; txBytes: string };
  try {
    stored = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "expired" };
  }
  if (stored.actor !== opts.actor) {
    return { ok: false, reason: "expired" };
  }

  try {
    const client = makeGrpcClient();
    const bytes = fromBase64(stored.txBytes);
    const { signature: sponsorSignature } =
      await sponsor.signTransaction(bytes);
    const result = await client.core.executeTransaction({
      transaction: bytes,
      // Sender signature first, then the gas sponsor's.
      signatures: [opts.actorSignature, sponsorSignature],
      include: { effects: true },
    });
    const txn =
      result.$kind === "Transaction"
        ? result.Transaction
        : result.FailedTransaction;
    const status = txn.effects?.status;
    if (!status?.success) {
      const errObj = status?.error as
        | { $kind?: string; message?: string }
        | undefined;
      const message =
        typeof errObj?.message === "string"
          ? errObj.message
          : "transaction failed";
      if (errObj?.$kind === "MoveAbort") {
        return { ok: false, reason: "aborted", digest: txn.digest, message };
      }
      return { ok: false, reason: "failed", message };
    }
    await client.core.waitForTransaction({ digest: txn.digest });
    return { ok: true, digest: txn.digest };
  } catch (e) {
    return {
      ok: false,
      reason: "failed",
      message: e instanceof Error ? e.message : "execute failed",
    };
  }
}
