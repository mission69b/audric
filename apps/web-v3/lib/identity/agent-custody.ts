import "server-only";

import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { SuinsClient, SuinsTransaction } from "@mysten/suins";
import { env } from "@/lib/env";

/**
 * Agent ID handle minting — server-only (Agent ID B.1 gate 5a). The custody
 * key (`0x6988…`) owns the `agent-id.sui` parent NFT and signs + gas-pays the
 * SuiNS leaf-subname mint `<label>.agent-id.sui → <agent address>`. The agent
 * proves it owns the target address via a signed challenge at the route layer;
 * the mint itself is custody-signed (the agent never needs SUI for a handle).
 *
 * DISTINCT from `custody.ts` (@audric handles): different parent + different
 * custody key. The parent NFT id mirrors `@t2000/sdk`'s `AGENT_ID_PARENT`
 * (inlined until the SDK ships that export; override via env for testnet).
 * // AGENT-ID-PARENT — keep in sync with packages/sdk suins-leaf.ts.
 */

const NETWORK = (env.NEXT_PUBLIC_SUI_NETWORK ?? "mainnet") as
  | "mainnet"
  | "testnet";

const AGENT_ID_PARENT_NAME = "agent-id.sui";
const AGENT_ID_PARENT_NFT_ID =
  process.env.AGENT_ID_PARENT_NFT_ID ??
  "0xc8c13f5b5a6d4c47c04877014794f65e67e2745d3bfa089b736eb54b0ebd5d1f";

/** True when the agent-id custody key is provisioned (minting available). */
export function isAgentIdentityConfigured(): boolean {
  return Boolean(env.AGENT_ID_PARENT_NFT_PRIVATE_KEY);
}

function loadCustodyKeypair(): Ed25519Keypair | null {
  const raw = env.AGENT_ID_PARENT_NFT_PRIVATE_KEY;
  if (!raw) {
    return null;
  }
  try {
    const { scheme, secretKey } = decodeSuiPrivateKey(raw);
    if (scheme !== "ED25519") {
      console.error(`[agent-id] custody key wrong scheme: ${scheme}`);
      return null;
    }
    return Ed25519Keypair.fromSecretKey(secretKey);
  } catch (e) {
    console.error("[agent-id] failed to decode custody key", e);
    return null;
  }
}

function leafName(label: string): string {
  return `${label}.${AGENT_ID_PARENT_NAME}`;
}

function makeClients() {
  // gRPC (the migrated transport — JSON-RPC fullnode sunsets 2026-07-31).
  // SuinsClient accepts any `ClientWithCoreApi`, so the gRPC client works for
  // both building the leaf tx and executing via `core.*`.
  const baseUrl =
    NETWORK === "testnet"
      ? "https://fullnode.testnet.sui.io"
      : "https://fullnode.mainnet.sui.io";
  const suiClient = new SuiGrpcClient({ baseUrl, network: NETWORK });
  const suinsClient = new SuinsClient({ client: suiClient, network: NETWORK });
  return { suiClient, suinsClient };
}

/** The full handle (`<label>.agent-id.sui`). */
export function agentHandle(label: string): string {
  return leafName(label);
}

/** The display handle (`<label>@agent-id`). */
export function agentDisplayHandle(label: string): string {
  return `${label}@agent-id`;
}

/**
 * Mint an `<label>.agent-id.sui` leaf pointing at the agent's address, signed
 * by the custody key. Returns the tx digest. Throws if the label is already
 * taken (the createLeafSubName reverts) or minting is unconfigured.
 */
export async function mintAgentHandle({
  label,
  targetAddress,
}: {
  label: string;
  targetAddress: string;
}): Promise<string> {
  const keypair = loadCustodyKeypair();
  if (!keypair) {
    throw new Error("Agent ID handle minting is not configured.");
  }
  const { suiClient, suinsClient } = makeClients();

  const tx = new Transaction();
  const suinsTx = new SuinsTransaction(suinsClient, tx);
  suinsTx.createLeafSubName({
    parentNft: AGENT_ID_PARENT_NFT_ID,
    name: leafName(label),
    targetAddress: normalizeSuiAddress(targetAddress),
  });
  tx.setSender(keypair.toSuiAddress());

  // Sign with the custody key + submit via the unified core API (transport-
  // agnostic; mirrors the SDK's executeTx).
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
      `Agent handle mint reverted: ${txn.effects?.status?.error ?? "unknown"}`
    );
  }
  return txn.digest;
}
