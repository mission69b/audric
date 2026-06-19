"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  clearSession,
  completeLogin,
  isSessionExpired,
  loadSession,
  startLogin,
  type ZkLoginSession,
  type ZkLoginStep,
} from "@/lib/zklogin";

export type ZkLoginStatus =
  | "loading" // checking localStorage on mount
  | "unauthenticated"
  | "redirecting" // heading to Google
  | "proving" // callback in progress (address + proof)
  | "authenticated"
  | "expired";

interface ZkLoginContextValue {
  address: string | null;
  /** Verified Google email (decoded from the session id_token), if signed in. */
  email: string | null;
  error: string | null;
  /** Called by /auth/callback — completes the flow + mints the server session. */
  handleCallback: () => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  provingStep: ZkLoginStep | null;
  session: ZkLoginSession | null;
  status: ZkLoginStatus;
}

/** Decode the `email` claim from the Google id_token (no verification needed —
 * the server already verified it at session mint; this is display-only). */
function emailFromJwt(jwt: string | undefined): string | null {
  if (!jwt) {
    return null;
  }
  try {
    const payload = jwt.split(".")[1];
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    ) as { email?: unknown };
    return typeof json.email === "string" ? json.email : null;
  } catch {
    return null;
  }
}

const ZkLoginContext = createContext<ZkLoginContextValue | null>(null);

export function ZkLoginProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ZkLoginStatus>("loading");
  const [session, setSession] = useState<ZkLoginSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [provingStep, setProvingStep] = useState<ZkLoginStep | null>(null);

  // Mount: hydrate from localStorage.
  useEffect(() => {
    const existing = loadSession();
    if (existing) {
      setSession(existing);
      setStatus(isSessionExpired(existing) ? "expired" : "authenticated");
    } else {
      setStatus("unauthenticated");
    }
  }, []);

  // Flip to `expired` when the session window closes during an active tab.
  useEffect(() => {
    if (!session || status !== "authenticated") {
      return;
    }
    const check = () => {
      if (isSessionExpired(session)) {
        setStatus("expired");
      }
    };
    check();
    const id = window.setInterval(check, 60_000);
    return () => window.clearInterval(id);
  }, [session, status]);

  const login = useCallback(async () => {
    try {
      setError(null);
      setStatus("redirecting");
      await startLogin();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start sign-in");
      setStatus("unauthenticated");
    }
  }, []);

  const handleCallback = useCallback(async () => {
    try {
      setError(null);
      setStatus("proving");
      const newSession = await completeLogin({ onStep: setProvingStep });
      // Mint the server session (httpOnly cookie) — the per-request identity.
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jwt: newSession.jwt,
          expiresAt: newSession.expiresAt,
        }),
      });
      if (!res.ok) {
        throw new Error("Failed to establish session");
      }
      setSession(newSession);
      setStatus("authenticated");
    } catch (e) {
      clearSession();
      setSession(null);
      setError(e instanceof Error ? e.message : "Sign-in failed");
      setStatus("unauthenticated");
    }
  }, []);

  const logout = useCallback(async () => {
    clearSession();
    setSession(null);
    setProvingStep(null);
    setError(null);
    setStatus("unauthenticated");
    await fetch("/api/auth/session", { method: "DELETE" }).catch(
      () => undefined
    );
    window.location.href = "/";
  }, []);

  const value = useMemo<ZkLoginContextValue>(
    () => ({
      status,
      address: session?.address ?? null,
      email: emailFromJwt(session?.jwt),
      session,
      error,
      provingStep,
      login,
      handleCallback,
      logout,
    }),
    [status, session, error, provingStep, login, handleCallback, logout]
  );

  return (
    <ZkLoginContext.Provider value={value}>{children}</ZkLoginContext.Provider>
  );
}

export function useZkLogin(): ZkLoginContextValue {
  const ctx = useContext(ZkLoginContext);
  if (!ctx) {
    throw new Error("useZkLogin must be used within <ZkLoginProvider>");
  }
  return ctx;
}
