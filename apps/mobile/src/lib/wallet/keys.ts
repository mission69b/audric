import * as SecureStore from "expo-secure-store";
import type { ZkLoginSignatureInputs } from "@mysten/sui/zklogin";

// The zkProof the exchange computes and returns. It feeds getZkLoginSignature's
// `inputs`. Bound (via the sign-in nonce) to the device's ephemeral public key —
// unusable without the on-device ephemeral secret.
export type ZkProof = ZkLoginSignatureInputs;

export type WalletKeys = {
  ephemeralSecret: string; // bech32 — generated on-device, NEVER transmitted
  proof: ZkProof;
  maxEpoch: number;
  address: string;
  expiresAt: number; // unix ms (Enoki estimatedExpiration)
};

const KEY = "audric-wallet-keys";
const OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function saveWalletKeys(k: WalletKeys): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(k), OPTS);
}

export async function loadWalletKeys(): Promise<WalletKeys | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY, OPTS);
    return raw ? (JSON.parse(raw) as WalletKeys) : null;
  } catch {
    return null;
  }
}

export async function clearWalletKeys(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY, OPTS);
}

export function isProofExpired(k: { expiresAt: number }, nowMs: number = Date.now()): boolean {
  return nowMs >= k.expiresAt;
}
