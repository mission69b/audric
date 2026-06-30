import "server-only";

import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { env } from "@/lib/env";

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

  // 2. Build + sign + execute the anchor MoveCall (signer pays gas).
  try {
    const tx = new Transaction();
    tx.setSender(signer.toSuiAddress());
    tx.setGasBudget(ANCHOR_GAS_BUDGET);
    tx.moveCall({
      target: `${pkg}::anchor::anchor_receipt`,
      arguments: [
        tx.pure.string(receiptId),
        tx.pure.string(wireHash),
        tx.pure.string(workloadId),
        tx.pure.u64(servedAtMs),
      ],
    });
    const client = grpcClient();
    const bytes = await tx.build({ client });
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
      return { anchored: false, reason: "anchor tx reverted" };
    }
    return { anchored: true, txDigest: txn.digest };
  } catch (e) {
    return {
      anchored: false,
      reason: e instanceof Error ? e.message : "anchor tx error",
    };
  }
}
