import "server-only";

import type { Signer } from "@mysten/sui/cryptography";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { walrus } from "@mysten/walrus";
import { env } from "@/lib/env";
import { getReadyRedisClient } from "@/lib/ratelimit";

/**
 * Walrus "pin & own" — durable, sovereign confidential receipts
 * (SPEC_CONFIDENTIAL_UI §3). The ACI gateway retains receipts only for a TTL;
 * the on-chain anchor is permanent but the receipt BODY expires. Pinning the
 * signed receipt to Walrus (decentralized storage on Sui) makes it verifiable
 * forever — and it's still trustless wherever it's served, because the receipt
 * is signed + its hash is anchored on-chain (we can't forge it).
 *
 * Config (degrades gracefully — pins are skipped until set):
 *   WALRUS_SIGNER_KEY — a SUI+WAL-funded signer (suiprivkey1…) that pays for
 *     blob storage. WAL for storage + SUI for the register-blob tx.
 *   WALRUS_RECEIPT_EPOCHS — storage duration (default 53 ≈ mainnet max, ~2y;
 *     renewal is a future op concern).
 */

const NETWORK = (env.NEXT_PUBLIC_SUI_NETWORK ?? "mainnet") as
  | "mainnet"
  | "testnet";
const AGGREGATOR =
  NETWORK === "testnet"
    ? "https://aggregator.walrus-testnet.walrus.space"
    : "https://aggregator.walrus-mainnet.walrus.space";
const FULLNODE =
  NETWORK === "testnet"
    ? "https://fullnode.testnet.sui.io"
    : "https://fullnode.mainnet.sui.io";
const BLOB_KEY_PREFIX = "aci-receipt-blob:";
const BLOB_INDEX_TTL_SECONDS = 60 * 60 * 24 * 365; // index retention (1y)
const RECEIPT_EPOCHS = Number(env.WALRUS_RECEIPT_EPOCHS ?? "53");

/** True when a WAL-funded signer is provisioned. */
export function isWalrusConfigured(): boolean {
  return Boolean(env.WALRUS_SIGNER_KEY);
}

function loadSigner(): Ed25519Keypair | null {
  const raw = env.WALRUS_SIGNER_KEY;
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

/**
 * Wrap a keypair so the Walrus SDK's internal register + certify txs pay gas
 * from the signer's SUI ADDRESS BALANCE (`setGasPayment([])`, SIP-58) instead
 * of a gas coin — so concurrent pins don't equivocate on a shared coin. (WAL is
 * already balance-drawable: the SDK pays it via `coinWithBalance`, which uses a
 * parallelizable withdrawal when the WAL is in the address balance.) The SDK
 * hands `signAndExecuteTransaction` a mutable `Transaction`, so we stamp the
 * gas-payment override there. Requires the signer's SUI (+ WAL) in its address
 * balance; `pinReceipt` falls back to coin gas if not, so it never regresses.
 */
function withAddressBalanceGas(signer: Ed25519Keypair): Signer {
  return new Proxy(signer, {
    get(target, prop, receiver) {
      if (prop === "signAndExecuteTransaction") {
        const original = target.signAndExecuteTransaction.bind(target);
        return (args: Parameters<typeof original>[0]) => {
          if (args.transaction instanceof Transaction) {
            args.transaction.setGasPayment([]);
          }
          return original(args);
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/** The Walrus blob id a receipt was pinned to, if any. */
export async function getReceiptBlobId(
  receiptId: string
): Promise<string | null> {
  const redis = await getReadyRedisClient();
  if (!redis) {
    return null;
  }
  return (await redis.get(`${BLOB_KEY_PREFIX}${receiptId}`)) as string | null;
}

async function storeBlobId(receiptId: string, blobId: string): Promise<void> {
  const redis = await getReadyRedisClient();
  if (!redis) {
    return;
  }
  await redis.set(`${BLOB_KEY_PREFIX}${receiptId}`, blobId, {
    EX: BLOB_INDEX_TTL_SECONDS,
  });
}

/**
 * Pin a signed receipt to Walrus (idempotent). Returns the blob id, or null if
 * unconfigured / on failure (pinning is best-effort — the on-chain anchor is
 * the permanent commitment regardless).
 */
export async function pinReceipt(
  receiptId: string,
  receiptJson: string
): Promise<string | null> {
  const signer = loadSigner();
  if (!signer) {
    return null;
  }
  const existing = await getReceiptBlobId(receiptId);
  if (existing) {
    return existing;
  }
  const client = new SuiGrpcClient({
    baseUrl: FULLNODE,
    network: NETWORK,
  }).$extend(walrus());
  const blob = new TextEncoder().encode(receiptJson);
  const write = (s: Signer) =>
    client.walrus.writeBlob({
      blob,
      deletable: false,
      epochs: RECEIPT_EPOCHS,
      signer: s,
    });
  try {
    let blobId: string;
    try {
      // Address-balance gas (concurrent-safe). Falls back to coin gas if the
      // signer's SUI isn't in its address balance yet.
      ({ blobId } = await write(withAddressBalanceGas(signer)));
    } catch (e) {
      console.warn(
        "[walrus] address-balance gas pin failed → coin-gas fallback",
        e instanceof Error ? e.message : e
      );
      ({ blobId } = await write(signer));
    }
    await storeBlobId(receiptId, blobId);
    return blobId;
  } catch (e) {
    console.error("[walrus] pinReceipt failed", e);
    return null;
  }
}

/**
 * Fetch a pinned receipt from Walrus (via a public aggregator) — the durable
 * fallback when the ACI gateway's TTL has expired.
 */
export async function fetchReceiptFromWalrus(
  receiptId: string
): Promise<string | null> {
  const blobId = await getReceiptBlobId(receiptId);
  if (!blobId) {
    return null;
  }
  try {
    const res = await fetch(
      `${AGGREGATOR}/v1/blobs/${encodeURIComponent(blobId)}`
    );
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}
