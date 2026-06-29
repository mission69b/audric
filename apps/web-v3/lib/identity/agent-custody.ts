import "server-only";

import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import type { Transaction } from "@mysten/sui/transactions";
import { SuinsClient } from "@mysten/suins";
import {
  AGENT_ID_PARENT,
  AGENT_ID_PARENT_NAME,
  buildAddLeafTx,
  buildRevokeLeafTx,
  displayHandle,
  fullHandle,
} from "@t2000/sdk";
import { env } from "@/lib/env";

/**
 * Agent ID handle minting — server-only (Agent ID B.1 gate 5a/item 2). The
 * custody key (`0x6988…`) owns the `agent-id.sui` parent NFT and signs +
 * gas-pays the SuiNS leaf mint `<label>.agent-id.sui → <agent address>`. The
 * agent proves it owns the target address via a signed challenge at the route
 * layer; the mint/revoke itself is custody-signed (the agent never needs SUI).
 *
 * Leaf-tx building + handle formatting come from `@t2000/sdk` (the single source
 * of truth for the `agent-id.sui` parent + SuiNS label rules) — DISTINCT from
 * `custody.ts`, which serves the `audric.sui` parent.
 */

const NETWORK = (env.NEXT_PUBLIC_SUI_NETWORK ?? "mainnet") as
  | "mainnet"
  | "testnet";

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

/** Sign `tx` with the custody key + submit via the unified core API. */
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
      `Agent handle tx reverted: ${txn.effects?.status?.error ?? "unknown"}`
    );
  }
  return txn.digest;
}

/** The full handle (`<label>.agent-id.sui`). */
export function agentHandle(label: string): string {
  return fullHandle(label, AGENT_ID_PARENT_NAME);
}

/** The display handle (`<label>@agent-id`). */
export function agentDisplayHandle(label: string): string {
  return displayHandle(label, AGENT_ID_PARENT_NAME);
}

/** Resolve `<label>.agent-id.sui` → its target address (null if unset/error).
 *  Used to authorize release (only the leaf's current target may release it). */
export async function resolveAgentHandle(
  label: string
): Promise<string | null> {
  try {
    const { suinsClient } = makeClients();
    const rec = await suinsClient.getNameRecord(agentHandle(label));
    return rec?.targetAddress ?? null;
  } catch {
    return null;
  }
}

/**
 * Mint an `<label>.agent-id.sui` leaf pointing at the agent's address, signed
 * by the custody key. Returns the tx digest. Throws if the label is taken
 * (the create reverts) or minting is unconfigured.
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
  const tx = buildAddLeafTx(suinsClient, {
    label,
    targetAddress,
    parent: AGENT_ID_PARENT,
  });
  return await signAndSubmit(suiClient, keypair, tx);
}

/**
 * Revoke (release) an `<label>.agent-id.sui` leaf, custody-signed. Returns the
 * tx digest. The route layer authorizes (only the leaf's current target may
 * release it, via a signed challenge).
 */
export async function revokeAgentHandle(label: string): Promise<string> {
  const keypair = loadCustodyKeypair();
  if (!keypair) {
    throw new Error("Agent ID handle minting is not configured.");
  }
  const { suiClient, suinsClient } = makeClients();
  const tx = buildRevokeLeafTx(suinsClient, { label, parent: AGENT_ID_PARENT });
  return await signAndSubmit(suiClient, keypair, tx);
}
