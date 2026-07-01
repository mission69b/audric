import "server-only";

import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { pinReceipt } from "@/lib/api/walrus";
import { env } from "@/lib/env";
import { getReadyRedisClient } from "@/lib/ratelimit";

/**
 * Sui anchor for confidential receipts — SPEC_CONFIDENTIAL_API v3.0, Phase C
 * (the Sui-native wedge over RedPill's Ethereum anchor). On demand, anchor a
 * confidential response receipt on Sui: fetch the signed ACI receipt, extract
 * its `response.returned.wire_hash` + `workload_id` + `served_at`, and call
 * `confidential_anchor::anchor::anchor_receipt` (emits a `ReceiptAnchored`
 * event) — a tamper-evident, publicly-timestamped on-chain commitment the
 * Phase-D verifier matches against. The full signed receipt stays off-chain.
 *
 * Config (degrades gracefully — returns `anchored:false` until set):
 *   CONFIDENTIAL_ANCHOR_PACKAGE_ID — the deployed Move package id.
 *   CONFIDENTIAL_ANCHOR_SIGNER_KEY — a SUI-funded signer (suiprivkey1…) that
 *     pays gas + submits the anchor tx (anchor_receipt is a normal Move call,
 *     not the gasless stablecoin path → the signer needs a little SUI).
 */

const NETWORK = (env.NEXT_PUBLIC_SUI_NETWORK ?? "mainnet") as
  | "mainnet"
  | "testnet";
const ACI_BASE = "https://inference.phala.com";
const ANCHOR_GAS_BUDGET = 10_000_000n; // 0.01 SUI — one small event-emit MoveCall.
const ANCHOR_KEY_PREFIX = "aci-anchor:";
const ANCHOR_TTL_SECONDS = 60 * 60 * 24 * 365; // 1y — anchored once, kept for verify.

/**
 * Anchor-every + pin — the one background job fired after every confidential
 * response (SPEC_CONFIDENTIAL_UI §2). Pins the signed receipt to Walrus
 * (durable, §3) then anchors it on Sui. Best-effort + idempotent: the response
 * already shipped; both steps no-op if already done. Fire via `after()` so it
 * runs post-response without adding latency.
 */
export async function anchorAndPin(receiptId: string): Promise<void> {
  try {
    // Fetch the signed receipt once (while fresh) → pin to Walrus for durability.
    if (env.PHALA_API_KEY) {
      const res = await fetch(
        `${ACI_BASE}/v1/aci/receipts/${encodeURIComponent(receiptId)}`,
        { headers: { Authorization: `Bearer ${env.PHALA_API_KEY}` } }
      );
      if (res.ok) {
        await pinReceipt(receiptId, await res.text());
      }
    }
  } catch (e) {
    console.error("[anchorAndPin] pin step failed", receiptId, e);
  }
  try {
    await anchorReceipt(receiptId);
  } catch (e) {
    console.error("[anchorAndPin] anchor step failed", receiptId, e);
  }
}

/** The anchor tx digest for a receipt, if it's been anchored (else null). */
export async function getAnchorDigest(
  receiptId: string
): Promise<string | null> {
  const redis = await getReadyRedisClient();
  if (!redis) {
    return null;
  }
  return (await redis.get(`${ANCHOR_KEY_PREFIX}${receiptId}`)) as string | null;
}

async function storeAnchorDigest(
  receiptId: string,
  digest: string
): Promise<void> {
  const redis = await getReadyRedisClient();
  if (!redis) {
    return;
  }
  await redis.set(`${ANCHOR_KEY_PREFIX}${receiptId}`, digest, {
    EX: ANCHOR_TTL_SECONDS,
  });
}

export interface AnchorResult {
  anchored: boolean;
  reason?: string;
  txDigest?: string;
}

/** True when the anchor package id + signer are both provisioned. */
export function isAnchorConfigured(): boolean {
  return Boolean(
    env.CONFIDENTIAL_ANCHOR_PACKAGE_ID && env.CONFIDENTIAL_ANCHOR_SIGNER_KEY
  );
}

function loadSigner(): Ed25519Keypair | null {
  const raw = env.CONFIDENTIAL_ANCHOR_SIGNER_KEY;
  if (!raw) {
    return null;
  }
  try {
    const { scheme, secretKey } = decodeSuiPrivateKey(raw);
    return scheme === "ED25519"
      ? Ed25519Keypair.fromSecretKey(secretKey)
      : null;
  } catch {
    return null;
  }
}

function grpcClient(): SuiGrpcClient {
  return new SuiGrpcClient({
    baseUrl:
      NETWORK === "testnet"
        ? "https://fullnode.testnet.sui.io"
        : "https://fullnode.mainnet.sui.io",
    network: NETWORK,
  });
}

interface AciReceipt {
  event_log?: { type?: string; wire_hash?: string }[];
  served_at?: number;
  workload_id?: string;
}

/** Anchor the receipt `receiptId` on Sui. Returns the anchor tx digest. */
export async function anchorReceipt(receiptId: string): Promise<AnchorResult> {
  // Idempotent: a receipt is anchored once — return the existing digest rather
  // than emit a duplicate event + burn gas.
  const existing = await getAnchorDigest(receiptId);
  if (existing) {
    return { anchored: true, txDigest: existing };
  }

  const pkg = env.CONFIDENTIAL_ANCHOR_PACKAGE_ID;
  const signer = loadSigner();
  if (!(pkg && signer && env.PHALA_API_KEY)) {
    return { anchored: false, reason: "anchoring not configured" };
  }

  // 1. Fetch the signed receipt → extract the committed fields.
  let receipt: AciReceipt;
  try {
    const res = await fetch(
      `${ACI_BASE}/v1/aci/receipts/${encodeURIComponent(receiptId)}`,
      { headers: { Authorization: `Bearer ${env.PHALA_API_KEY}` } }
    );
    if (!res.ok) {
      return { anchored: false, reason: `receipt fetch ${res.status}` };
    }
    receipt = (await res.json()) as AciReceipt;
  } catch (e) {
    return {
      anchored: false,
      reason: e instanceof Error ? e.message : "receipt fetch error",
    };
  }
  const wireHash = receipt.event_log?.find(
    (ev) => ev.type === "response.returned"
  )?.wire_hash;
  const workloadId = receipt.workload_id;
  if (!(wireHash && workloadId)) {
    return { anchored: false, reason: "receipt missing wire_hash/workload_id" };
  }
  const servedAtMs = BigInt((receipt.served_at ?? 0) * 1000);

  // 2. Build + sign + execute the anchor MoveCall.
  //
  // Prefer ADDRESS-BALANCE GAS (`setGasPayment([])`, SIP-58): gas is a withdrawal
  // from the signer's SUI address balance, not a gas-coin object — so concurrent
  // anchors don't equivocate on a shared coin. This is the only thing that makes
  // the signer safe under serverless concurrency (separate invocations can't be
  // serialized in-process). Requires the signer's SUI to be in its address
  // BALANCE (accumulator). Falls back to coin gas if it isn't there yet, so the
  // path never breaks pre-provisioning.
  const client = grpcClient();
  const buildAnchorTx = (addressBalanceGas: boolean): Transaction => {
    const tx = new Transaction();
    tx.setSender(signer.toSuiAddress());
    tx.setGasBudget(ANCHOR_GAS_BUDGET);
    if (addressBalanceGas) {
      tx.setGasPayment([]); // pay gas from the SUI address balance
    }
    tx.moveCall({
      target: `${pkg}::anchor::anchor_receipt`,
      arguments: [
        tx.pure.string(receiptId),
        tx.pure.string(wireHash),
        tx.pure.string(workloadId),
        tx.pure.u64(servedAtMs),
        tx.object("0x6"), // Clock — on-chain anchored_at_ms
      ],
    });
    return tx;
  };
  const submit = async (addressBalanceGas: boolean): Promise<string> => {
    const bytes = await buildAnchorTx(addressBalanceGas).build({ client });
    const { signature } = await signer.signTransaction(bytes);
    const result = await client.core.executeTransaction({
      transaction: bytes,
      signatures: [signature],
      include: { effects: true },
    });
    const txn =
      result.$kind === "Transaction"
        ? result.Transaction
        : result.FailedTransaction;
    if (!txn.effects?.status?.success) {
      throw new Error("anchor tx reverted");
    }
    return txn.digest;
  };
  try {
    let digest: string;
    try {
      digest = await submit(true);
    } catch (e) {
      // No address balance yet (or a gas-path issue) → coin-gas fallback. Anchor
      // is idempotent + event-only, so a fallback re-attempt is harmless.
      console.warn(
        "[anchor] address-balance gas failed → coin-gas fallback",
        e instanceof Error ? e.message : e
      );
      digest = await submit(false);
    }
    await storeAnchorDigest(receiptId, digest);
    return { anchored: true, txDigest: digest };
  } catch (e) {
    return {
      anchored: false,
      reason: e instanceof Error ? e.message : "anchor tx error",
    };
  }
}
