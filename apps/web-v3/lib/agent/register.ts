import "server-only";

import { randomBytes } from "node:crypto";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { fromBase64, toBase64 } from "@mysten/sui/utils";
import { buildRegisterTx } from "@t2000/id";
import { env } from "@/lib/env";
import { getReadyRedisClient } from "@/lib/ratelimit";

// Sponsored on-chain registration — Agent ID B.1 gate 5b. The registry requires
// `sender == agent`, but the agent may hold 0 SUI, so this is a native SPONSORED
// transaction: the agent is the sender (auth holds) and the sponsor (0x6988 —
// the same key that mints handles, which holds SUI) owns + pays the gas.
//
// Two-phase, Redis-backed for safety: `prepare` builds the FULL register tx
// (sender=agent, gasOwner=sponsor) server-side and stores the exact bytes under
// a single-use regNonce; the agent signs those bytes; `submit` loads the STORED
// bytes (so we never sponsor client-supplied bytes — that would be a gas-drain
// vuln), sponsor-co-signs, and executes. Idempotent: a double-register aborts
// on-chain (EAlreadyRegistered) — surfaced as `alreadyRegistered`.

const NETWORK = (env.NEXT_PUBLIC_SUI_NETWORK ?? "mainnet") as
  | "mainnet"
  | "testnet";
const REG_PREFIX = "agent-reg:";
const REG_TTL_SECONDS = 5 * 60;
// 0.02 SUI — register is a single small MoveCall; generous headroom.
const REGISTER_GAS_BUDGET = 20_000_000n;

/** True when the sponsor key is provisioned (sponsored register available). */
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

export type PrepareResult =
  | { ok: true; alreadyRegistered: false; regNonce: string; txBytes: string }
  | { ok: true; alreadyRegistered: true }
  | { ok: false; reason: "unconfigured" | "build_failed" };

/** The gRPC `build()` resolves via simulation, so a re-register surfaces the
 *  `EAlreadyRegistered` (abort code 0) abort HERE, at prepare — not submit. */
function isAlreadyRegisteredError(message: string): boolean {
  return /abort code: 0\b/.test(message) && /registry::register/.test(message);
}

/**
 * Build the sponsored register tx for `address` and stash the bytes under a
 * single-use regNonce. Returns the bytes for the agent to sign.
 */
export async function prepareSponsoredRegister(opts: {
  address: string;
  mcpEndpoint?: string | null;
  paymentMethods?: string[];
  did?: string | null;
}): Promise<PrepareResult> {
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
    const tx = buildRegisterTx({
      mcpEndpoint: opts.mcpEndpoint ?? null,
      paymentMethods: opts.paymentMethods ?? [],
      did: opts.did ?? null,
      metadataUri: null,
    });
    tx.setSender(opts.address);
    tx.setGasOwner(sponsor.toSuiAddress());
    tx.setGasBudget(REGISTER_GAS_BUDGET);
    const bytes = await tx.build({ client });
    const txBytes = toBase64(bytes);

    const regNonce = randomBytes(24).toString("base64url");
    await redis.set(
      `${REG_PREFIX}${regNonce}`,
      JSON.stringify({ address: opts.address, txBytes }),
      { EX: REG_TTL_SECONDS }
    );
    return { ok: true, alreadyRegistered: false, regNonce, txBytes };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Idempotent: a re-register aborts at build-time simulation.
    if (isAlreadyRegisteredError(msg)) {
      return { ok: true, alreadyRegistered: true };
    }
    return { ok: false, reason: "build_failed" };
  }
}

export type SubmitResult =
  | { ok: true; digest: string; alreadyRegistered: boolean }
  | {
      ok: false;
      reason: "unconfigured" | "expired" | "failed";
      error?: string;
    };

/**
 * Load the stored (server-built) bytes for `regNonce`, sponsor-co-sign, and
 * execute with [agentSignature, sponsorSignature].
 */
export async function submitSponsoredRegister(opts: {
  regNonce: string;
  address: string;
  agentSignature: string;
}): Promise<SubmitResult> {
  const sponsor = loadSponsorKeypair();
  if (!sponsor) {
    return { ok: false, reason: "unconfigured" };
  }
  const redis = await getReadyRedisClient();
  if (!redis) {
    return { ok: false, reason: "unconfigured" };
  }

  // Single-use load (GETDEL), bound to the address it was prepared for.
  const raw = await redis.getDel(`${REG_PREFIX}${opts.regNonce}`);
  if (!raw) {
    return { ok: false, reason: "expired" };
  }
  let stored: { address: string; txBytes: string };
  try {
    stored = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "expired" };
  }
  if (stored.address !== opts.address) {
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
      signatures: [opts.agentSignature, sponsorSignature],
      include: { effects: true },
    });
    const txn =
      result.$kind === "Transaction"
        ? result.Transaction
        : result.FailedTransaction;

    const status = txn.effects?.status;
    if (!status?.success) {
      // v2 `status.error` is a structured ExecutionError, not a string.
      const errObj = status?.error as
        | { $kind?: string; message?: string }
        | undefined;
      const errMsg =
        typeof errObj?.message === "string"
          ? errObj.message
          : "transaction failed";
      // Race: registered between prepare + submit → EAlreadyRegistered (code 0)
      // — treat as idempotent success (the identity already exists).
      if (errObj?.$kind === "MoveAbort") {
        return { ok: true, digest: txn.digest, alreadyRegistered: true };
      }
      return { ok: false, reason: "failed", error: errMsg };
    }
    await client.core.waitForTransaction({ digest: txn.digest });
    return { ok: true, digest: txn.digest, alreadyRegistered: false };
  } catch (e) {
    return {
      ok: false,
      reason: "failed",
      error: e instanceof Error ? e.message : "execute failed",
    };
  }
}
