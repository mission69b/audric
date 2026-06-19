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
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
import { fromHex } from "@mysten/sui/utils";
// Type-only — the runtime impl is dynamically imported (see walrusClient) so the
// heavy WASM-backed module never loads on the Seal-only / module-eval path.
import type { WalrusClient } from "@mysten/walrus";
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

// --- Walrus storage (decentralized blob store for the ciphertext) ---

// Storage duration in Walrus epochs (~14 days each on mainnet). Tunable; blobs
// are `deletable` so the deletion surface can purge them before expiry.
const STORAGE_EPOCHS = 12;

/** Audric's sponsored uploader — pays WAL (storage) + SUI (gas) for blobs. */
function uploaderSigner(): Ed25519Keypair {
  return Ed25519Keypair.fromSecretKey(
    env.AUDRIC_PARENT_NFT_PRIVATE_KEY as string
  );
}

async function walrusClient(suiClient: SuiGrpcClient): Promise<WalrusClient> {
  const { WalrusClient: Walrus } = await import("@mysten/walrus");
  return new Walrus({ network: "mainnet", suiClient });
}

/**
 * Encrypt for the owner (Seal) then store the ciphertext on Walrus. Returns the
 * Walrus `blobId` — persist THAT as the blob ref (Stage 3 `putBlob`).
 */
export async function sealStore(
  ownerAddress: string,
  data: Uint8Array
): Promise<{ blobId: string }> {
  const ciphertext = await sealEncryptForOwner(ownerAddress, data);
  const walrus = await walrusClient(sealSuiClient());
  const { blobId } = await walrus.writeBlob({
    blob: ciphertext,
    deletable: true,
    epochs: STORAGE_EPOCHS,
    signer: uploaderSigner(),
  });
  return { blobId };
}

/**
 * Read the ciphertext from Walrus by blobId, then Seal-decrypt it with the
 * user's session key (Stage 3 `getBlob`).
 */
export async function sealFetch(
  ownerAddress: string,
  exported: ExportedSessionKey,
  blobId: string
): Promise<Uint8Array> {
  const walrus = await walrusClient(sealSuiClient());
  const ciphertext = await walrus.readBlob({ blobId });
  return await sealDecryptForOwner(ownerAddress, exported, ciphertext);
}
