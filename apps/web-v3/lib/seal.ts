import "server-only";

/**
 * Seal (decentralized private storage) — server-only wiring.
 *
 * Seal = threshold encryption with an on-chain access policy. Our policy is
 * `audric_seal::seal_policy::seal_approve(id)` (owner-only: id = the owner's
 * Passport address). The MPC committee dry-runs it before releasing key shares,
 * so a user can only ever decrypt data encrypted to their own address.
 *
 * Split: ENCRYPT needs no user signature (committee public keys, from chain).
 * DECRYPT needs (a) the API key — server-only, here — and (b) a `SessionKey`
 * the USER signed with their zkLogin key client-side, then exported to us. So
 * encryption + the committee call live server-side (key stays secret); only the
 * one-per-TTL SessionKey signature happens in the browser.
 */

import { SealClient, SessionKey } from "@mysten/seal";
import type { ExportedSessionKey } from "@mysten/seal";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
import { fromHex } from "@mysten/sui/utils";
import { env } from "@/lib/env";

// Mainnet Seal MPC committee (5-of-8) — a single logical endpoint.
const COMMITTEE_OBJECT_ID =
  "0x686098f1439237fff9f36b99c7329683c22979d2005c2465cb891acb012a7595";
const AGGREGATOR_URL = "https://seal-aggregator-mainnet.mystenlabs.com";
const SEAL_MODULE = "seal_policy";
// The committee counts as one logical server in the threshold config.
const THRESHOLD = 1;

/** Seal is usable only when the API key + our policy package are configured. */
export function isSealConfigured(): boolean {
  return Boolean(env.SEAL_API_KEY && env.SEAL_POLICY_PACKAGE_ID);
}

function sealSuiClient(): SuiGrpcClient {
  return new SuiGrpcClient({
    baseUrl: "https://fullnode.mainnet.sui.io",
    network: "mainnet",
  });
}

function sealClient(suiClient: SuiGrpcClient): SealClient {
  return new SealClient({
    suiClient,
    serverConfigs: [
      {
        objectId: COMMITTEE_OBJECT_ID,
        aggregatorUrl: AGGREGATOR_URL,
        apiKeyName: "x-api-key",
        apiKey: env.SEAL_API_KEY as string,
        weight: 1,
      },
    ],
    verifyKeyServers: false,
  });
}

/** id = owner address bytes (hex, no 0x) — matches seal_policy::seal_approve. */
function ownerId(address: string): string {
  return address.replace(/^0x/, "").toLowerCase();
}

/** Encrypt bytes so ONLY `ownerAddress` can later decrypt them. */
export async function sealEncryptForOwner(
  ownerAddress: string,
  data: Uint8Array
): Promise<Uint8Array> {
  const client = sealClient(sealSuiClient());
  const { encryptedObject } = await client.encrypt({
    threshold: THRESHOLD,
    packageId: env.SEAL_POLICY_PACKAGE_ID as string,
    id: ownerId(ownerAddress),
    data,
  });
  return encryptedObject;
}

/** Build the `seal_approve(id)` PTB the committee dry-runs as the requester. */
async function approveTxBytes(
  suiClient: SuiGrpcClient,
  ownerAddress: string
): Promise<Uint8Array> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${env.SEAL_POLICY_PACKAGE_ID}::${SEAL_MODULE}::seal_approve`,
    arguments: [tx.pure.vector("u8", fromHex(ownerId(ownerAddress)))],
  });
  return await tx.build({ client: suiClient, onlyTransactionKind: true });
}

/**
 * Decrypt using a SessionKey the user signed client-side (exported to us). The
 * committee releases keys only if `seal_approve` passes — i.e. the SessionKey's
 * address owns the identity.
 */
export async function sealDecryptForOwner(
  ownerAddress: string,
  exported: ExportedSessionKey,
  encrypted: Uint8Array
): Promise<Uint8Array> {
  const suiClient = sealSuiClient();
  const client = sealClient(suiClient);
  const sessionKey = SessionKey.import(exported, suiClient);
  const txBytes = await approveTxBytes(suiClient, ownerAddress);
  return await client.decrypt({ data: encrypted, sessionKey, txBytes });
}
