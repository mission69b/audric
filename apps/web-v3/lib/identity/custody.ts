import "server-only";

import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { SuinsClient, SuinsTransaction } from "@mysten/suins";
import { AUDRIC_PARENT_NAME, AUDRIC_PARENT_NFT_ID } from "@t2000/sdk";
import { env } from "@/lib/env";

/**
 * @audric handle minting — server-only. The parent-NFT custody key signs the
 * gas-paid SuiNS leaf-subname mint/change (NOT user-signed, NOT Enoki-sponsored
 * — a documented bypass of the user-sponsored-tx flow). A handle is a leaf
 * subname `<label>.audric.sui` whose target is the user's Passport address.
 */

const NETWORK = (env.NEXT_PUBLIC_SUI_NETWORK ?? "mainnet") as
  | "mainnet"
  | "testnet";

/** True when the custody key is provisioned (handle minting available). */
export function isIdentityConfigured(): boolean {
  return Boolean(env.AUDRIC_PARENT_NFT_PRIVATE_KEY);
}

function loadCustodyKeypair(): Ed25519Keypair | null {
  const raw = env.AUDRIC_PARENT_NFT_PRIVATE_KEY;
  if (!raw) {
    return null;
  }
  try {
    const { scheme, secretKey } = decodeSuiPrivateKey(raw);
    if (scheme !== "ED25519") {
      console.error(`[identity] custody key wrong scheme: ${scheme}`);
      return null;
    }
    return Ed25519Keypair.fromSecretKey(secretKey);
  } catch (e) {
    console.error("[identity] failed to decode custody key", e);
    return null;
  }
}

function leafName(label: string): string {
  return `${label}.${AUDRIC_PARENT_NAME}`;
}

function makeClients() {
  // gRPC (the migrated transport — JSON-RPC fullnode sunsets 2026-07-31).
  // SuinsClient accepts any `ClientWithCoreApi`, so the gRPC client serves both
  // building the leaf tx and executing via `core.*`.
  const baseUrl =
    NETWORK === "testnet"
      ? "https://fullnode.testnet.sui.io"
      : "https://fullnode.mainnet.sui.io";
  const suiClient = new SuiGrpcClient({ baseUrl, network: NETWORK });
  const suinsClient = new SuinsClient({ client: suiClient, network: NETWORK });
  return { suiClient, suinsClient };
}

/** Sign `tx` with the custody key + submit via the unified core API
 *  (transport-agnostic). Returns the digest; throws on a reverted effect. */
async function signAndSubmit(
  suiClient: SuiGrpcClient,
  keypair: Ed25519Keypair,
  tx: Transaction
): Promise<string> {
  tx.setSender(keypair.toSuiAddress());
  const bytes = await tx.build({ client: suiClient });
  const { signature } = await keypair.signTransaction(bytes);
  const result = await suiClient.core.executeTransaction({
    transaction: bytes,
    signatures: [signature],
    include: { effects: true },
  });
  const txn =
    result.$kind === "Transaction"
      ? result.Transaction
      : result.FailedTransaction;
  await suiClient.core.waitForTransaction({ digest: txn.digest });
  if (!txn.effects?.status?.success) {
    throw new Error(
      `Leaf tx reverted: ${txn.effects?.status?.error ?? "unknown"}`
    );
  }
  return txn.digest;
}

/**
 * Mint (claim) or atomically change an @audric handle for a user, signed by the
 * custody key. Returns the tx digest.
 *  - claim:  `oldLabel` absent → createLeafSubName(new)
 *  - change: `oldLabel` set    → removeLeafSubName(old) + createLeafSubName(new)
 *            in ONE PTB (Sui atomicity = whole-or-nothing, no half-changed limbo).
 */
export async function setLeafHandle({
  oldLabel,
  newLabel,
  targetAddress,
}: {
  oldLabel?: string | null;
  newLabel: string;
  targetAddress: string;
}): Promise<string> {
  const keypair = loadCustodyKeypair();
  if (!keypair) {
    throw new Error("Identity minting is not configured.");
  }
  const { suiClient, suinsClient } = makeClients();

  const tx = new Transaction();
  const suinsTx = new SuinsTransaction(suinsClient, tx);
  // Revoke BEFORE create so the namespace slot is freed first (defensive order).
  if (oldLabel) {
    suinsTx.removeLeafSubName({
      parentNft: AUDRIC_PARENT_NFT_ID,
      name: leafName(oldLabel),
    });
  }
  suinsTx.createLeafSubName({
    parentNft: AUDRIC_PARENT_NFT_ID,
    name: leafName(newLabel),
    targetAddress: normalizeSuiAddress(targetAddress),
  });

  return await signAndSubmit(suiClient, keypair, tx);
}

/** Best-effort revoke of a leaf (rollback when the DB write loses a race). */
export async function revokeLeafHandle(label: string): Promise<void> {
  const keypair = loadCustodyKeypair();
  if (!keypair) {
    return;
  }
  const { suiClient, suinsClient } = makeClients();
  const tx = new Transaction();
  const suinsTx = new SuinsTransaction(suinsClient, tx);
  suinsTx.removeLeafSubName({
    parentNft: AUDRIC_PARENT_NFT_ID,
    name: leafName(label),
  });
  // Best-effort rollback — swallow failures (the caller already errored).
  await signAndSubmit(suiClient, keypair, tx).catch(() => undefined);
}
