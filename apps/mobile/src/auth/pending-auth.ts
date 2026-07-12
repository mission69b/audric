import * as SecureStore from "expo-secure-store";

const KEY = "audric.zklogin.pending.v1";

/** Pre-OAuth handoff — ephemeral key + Enoki nonce binding. B2 signing reuses this. */
export type PendingZkLogin = {
  /** Bech32 ephemeral secret (same shape as packages/auth PendingAuth). */
  ephemeralSecret: string;
  randomness: string;
  maxEpoch: number;
  expiresAt: number;
};

export async function savePendingAuth(pending: PendingZkLogin): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(pending), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function loadPendingAuth(): Promise<PendingZkLogin | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingZkLogin;
  } catch {
    return null;
  }
}

export async function clearPendingAuth(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
