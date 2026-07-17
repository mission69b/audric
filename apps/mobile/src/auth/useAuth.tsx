import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import { generateAPIUrl } from "@/lib/api-url";
import { clearWalletKeys, saveWalletKeys } from "@/lib/wallet/keys";
import { authenticate } from "./biometrics";
import { type DerivedIdentity, exchangeForAddress } from "./exchange";
import { AuthCancelled, authorizeWithGoogle } from "./google";
import { clearPendingAuth, loadPendingAuth } from "./pending-auth";
import {
  authHeader,
  clearSession,
  loadLockPref,
  loadSession,
  saveLockPref,
  saveSession,
  type StoredSession,
} from "./session";

type Status = "loading" | "signed-out" | "signing-in" | "signed-in";

type AuthState = {
  status: Status;
  session: StoredSession | null;
  /** Result of the most recent sign-in — carries the Phase 0 gate signal. */
  lastDerived: DerivedIdentity | null;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * __DEV__-only: enter the app with a placeholder session, no real OAuth /
   * derivation. Lets us build screens behind the auth gate while production
   * address-parity is still pending funkii's keys. No-op in production builds.
   */
  devBypass: () => Promise<void>;
  /** Biometric app-lock is turned on for this install. */
  lockEnabled: boolean;
  /** The app is currently locked (session exists but is hidden behind biometrics). */
  locked: boolean;
  /** Turn the lock on/off — the caller confirms with a biometric prompt first. */
  setLockEnabled: (on: boolean) => Promise<void>;
  /** Prompt biometrics to reveal the app; returns whether it succeeded. */
  unlock: () => Promise<boolean>;
};

const AuthContext = createContext<AuthState | null>(null);

/**
 * Obviously-fake, correctly-shaped Sui address (32 bytes / 64 hex). Marks a dev
 * bypass session so it can never be mistaken for a derived wallet address.
 */
const DEV_STUB_ADDRESS = `0x${"de".repeat(32)}`;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [session, setSession] = useState<StoredSession | null>(null);
  const [lastDerived, setLastDerived] = useState<DerivedIdentity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lockEnabled, setLockEnabledState] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    (async () => {
      const [s, pref] = await Promise.all([loadSession(), loadLockPref()]);
      setSession(s);
      setLockEnabledState(pref);
      // If the lock is on and a session exists, start locked — the app must not
      // flash its content before the first biometric unlock.
      setLocked(Boolean(s && pref));
      setStatus(s ? "signed-in" : "signed-out");
    })();
  }, []);

  // Re-lock when the app returns to the foreground (app switcher, notification,
  // etc.) so a walk-away can't leave the session exposed. Only arms while the lock
  // is on and a session exists.
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (
        next === "active" &&
        /inactive|background/.test(prev) &&
        lockEnabled &&
        session
      ) {
        setLocked(true);
      }
    });
    return () => sub.remove();
  }, [lockEnabled, session]);

  const signIn = useCallback(async () => {
    setError(null);
    setStatus("signing-in");
    try {
      const code = await authorizeWithGoogle();
      // Loaded after authorizeWithGoogle (which is what writes it) and before
      // the exchange: the ephemeral secret deliberately never round-trips
      // through the exchange response, so it must come from the on-device
      // pending handoff, not from `derived`.
      const pending = await loadPendingAuth();
      const derived = await exchangeForAddress(code);
      const next: StoredSession = {
        address: derived.address,
        email: derived.email,
        savedAt: Date.now(),
        token: derived.token,
        expiresAt: derived.expiresAt,
      };
      await saveSession(next);
      setSession(next);
      setLastDerived(derived);
      // Persisting the signing keys is a NON-FATAL enhancement — the server
      // already falls back to a read-only wallet when it can't mint a proof,
      // so a SecureStore write failure here must not negate an otherwise
      // successful sign-in. Degrade to read-only; never surface it as a
      // sign-in error.
      try {
        if (derived.proof && derived.maxEpoch != null && pending) {
          await saveWalletKeys({
            ephemeralSecret: pending.ephemeralSecret,
            proof: derived.proof,
            maxEpoch: derived.maxEpoch,
            address: derived.address,
            expiresAt: pending.expiresAt,
          });
        } else {
          // No fresh proof this sign-in → clear any PRIOR account's wallet keys.
          // Leaving them would let a send sign from the wrong wallet: session B could
          // display B's balance while the on-device keys still belong to account A.
          // Degrade to read-only until the next proof-bearing sign-in instead.
          await clearWalletKeys();
        }
        // Single-use per sign-in: once the ephemeral secret is durably
        // persisted into wallet-keys (or there was nothing to persist), the
        // transient pending copy must be cleared.
        await clearPendingAuth();
      } catch (keyErr) {
        // Setup failed partway → clear rather than leave a stale/partial key set that
        // could belong to a different account than this session.
        await clearWalletKeys().catch(() => {});
        console.warn(
          "[auth] wallet-key setup failed (continuing read-only):",
          keyErr instanceof Error ? keyErr.message : String(keyErr)
        );
      }
      setStatus("signed-in");
    } catch (e) {
      // A user-cancelled browser session is not an error — restore prior state.
      if (e instanceof AuthCancelled) {
        setStatus(session ? "signed-in" : "signed-out");
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
      setStatus(session ? "signed-in" : "signed-out");
    }
  }, [session]);

  const signOut = useCallback(async () => {
    await clearSession();
    await clearWalletKeys();
    setSession(null);
    setLastDerived(null);
    setError(null);
    setLocked(false); // no session → nothing to lock (the pref persists for next sign-in)
    setStatus("signed-out");
  }, []);

  const setLockEnabled = useCallback(async (on: boolean) => {
    await saveLockPref(on);
    setLockEnabledState(on);
    if (!on) setLocked(false);
  }, []);

  const unlock = useCallback(async () => {
    const ok = await authenticate("Unlock Audric");
    if (ok) setLocked(false);
    return ok;
  }, []);

  const devBypass = useCallback(async () => {
    if (!__DEV__) return;
    const stub: StoredSession = {
      address: DEV_STUB_ADDRESS,
      email: "dev@audric.local",
      savedAt: Date.now(),
      dev: true,
    };
    await saveSession(stub);
    setSession(stub);
    setLastDerived(null);
    setError(null);
    setStatus("signed-in");
  }, []);

  // Onboarding side effect: whenever a session becomes active — fresh sign-in, dev
  // bypass, OR a session restored from the Keychain on launch — create the User row
  // in the DB (server route, idempotent upsert) so chat persistence has an identity
  // to FK against. Fire-and-forget: a failure must NEVER block entry into the app;
  // the row self-heals on the next launch (upsert). Not a wallet write — the address
  // only keys an identity row.
  useEffect(() => {
    const address = session?.address;
    if (!address) return;
    const email = session?.email ?? null;
    const token = session?.token ?? null;
    let cancelled = false;
    (async () => {
      try {
        await fetch(generateAPIUrl("/api/user"), {
          method: "POST",
          // Bearer present on a real session → the route derives identity from the
          // verified token (the body address/email are ignored server-side). Absent
          // on the dev bypass → the route's dev fallback trusts the body.
          headers: { "Content-Type": "application/json", ...authHeader(token) },
          body: JSON.stringify({ address, email }),
        });
      } catch (e) {
        if (!cancelled) {
          console.warn(
            "[auth] onboarding upsert failed:",
            e instanceof Error ? e.message : String(e)
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.address, session?.email, session?.token]);

  const value = useMemo(
    () => ({
      status,
      session,
      lastDerived,
      error,
      signIn,
      signOut,
      devBypass,
      lockEnabled,
      locked,
      setLockEnabled,
      unlock,
    }),
    [
      status,
      session,
      lastDerived,
      error,
      signIn,
      signOut,
      devBypass,
      lockEnabled,
      locked,
      setLockEnabled,
      unlock,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within <AuthProvider>");
  }
  return ctx;
}
