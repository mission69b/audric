import * as SecureStore from "expo-secure-store";

const KEY = "audric.session.v1";

export type StoredSession = {
  address: string;
  email: string | null;
  /** epoch ms when this record was written. */
  savedAt: number;
  /**
   * True only for the __DEV__ auth bypass (no real derivation). Lets the UI
   * flag that this address is a placeholder and gates it out of any wallet
   * operation. Never set on a real signed-in session.
   */
  dev?: boolean;
};

/**
 * Persist the derived identity in the Keychain (iOS) / Keystore (Android).
 * `requireAuthentication` is intentionally OFF for Phase 0 so the parity check
 * is friction-free; the Face ID gate lands in a later phase.
 * WHEN_UNLOCKED_THIS_DEVICE_ONLY keeps it device-bound (never restored to a new
 * device) — appropriate for wallet-linked material.
 */
export async function saveSession(s: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(s), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function loadSession(): Promise<StoredSession | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
