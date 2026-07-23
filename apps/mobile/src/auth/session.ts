import * as SecureStore from "expo-secure-store";

const KEY = "audric.session.v1";

export type StoredSession = {
  address: string;
  email: string | null;
  /** epoch ms when this record was written. */
  savedAt: number;
  /**
   * The `audric_session` token (HS256, minted by the exchange) that
   * authenticates the data routes. Absent only on an untokened guest session —
   * those fall back to the dev-guest path server-side, never to a real prod route.
   */
  token?: string;
  /** Epoch ms when `token` expires (server-set 7-day cap). */
  expiresAt?: number;
};

/**
 * Has this stored session's token passed its server-set expiry?
 *
 * A session with NO `expiresAt` is an untokened guest record, not an expired one —
 * it never carried a deadline, so it is never expired here (see `token?` above).
 * Only a token that HAS a deadline can outlive it.
 *
 * Pure + injectable clock so the launch path can be unit-tested without faking time.
 */
export function isSessionExpired(
  s: StoredSession | null,
  nowMs: number = Date.now()
): boolean {
  if (!s?.expiresAt) return false;
  return nowMs >= s.expiresAt;
}

/**
 * Bearer header for the session token, or an empty object when there is no token
 * (guest). Spread into a `fetch` `headers` map. Client-safe — carries
 * only the opaque token, never the secret; the token is verified server-side.
 */
export function authHeader(token?: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

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

// --- Biometric app-lock preference ------------------------------------------
// A tiny on/off flag ("require Face ID to open the app"), kept next to the
// session in the Keychain. Separate from the session record so toggling the lock
// never rewrites the derived identity. Not device-only here: a user re-signing in
// on a new device re-derives the session anyway, and the pref self-heals.
const LOCK_KEY = "audric.lock.v1";

export async function loadLockPref(): Promise<boolean> {
  return (await SecureStore.getItemAsync(LOCK_KEY)) === "1";
}

export async function saveLockPref(on: boolean): Promise<void> {
  if (on) {
    await SecureStore.setItemAsync(LOCK_KEY, "1");
  } else {
    await SecureStore.deleteItemAsync(LOCK_KEY);
  }
}
