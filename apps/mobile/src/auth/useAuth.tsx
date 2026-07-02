import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { generateAPIUrl } from "@/lib/api-url";
import { type DerivedIdentity, exchangeForAddress } from "./exchange";
import { AuthCancelled, authorizeWithGoogle } from "./google";
import {
  clearSession,
  loadSession,
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

  useEffect(() => {
    loadSession().then((s) => {
      setSession(s);
      setStatus(s ? "signed-in" : "signed-out");
    });
  }, []);

  const signIn = useCallback(async () => {
    setError(null);
    setStatus("signing-in");
    try {
      const code = await authorizeWithGoogle();
      const derived = await exchangeForAddress(code);
      const next: StoredSession = {
        address: derived.address,
        email: derived.email,
        savedAt: Date.now(),
      };
      await saveSession(next);
      setSession(next);
      setLastDerived(derived);
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
    setSession(null);
    setLastDerived(null);
    setError(null);
    setStatus("signed-out");
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
    let cancelled = false;
    (async () => {
      try {
        await fetch(generateAPIUrl("/api/user"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
  }, [session?.address, session?.email]);

  const value = useMemo(
    () => ({ status, session, lastDerived, error, signIn, signOut, devBypass }),
    [status, session, lastDerived, error, signIn, signOut, devBypass]
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
