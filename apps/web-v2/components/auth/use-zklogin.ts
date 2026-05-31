"use client";

/**
 * useZkLogin — full zkLogin session hook.
 *
 * Replaces the partial `useAudricSession` (which only stored
 * `{jwt, address, expiresAt}`) for any consumer that needs the FULL
 * `ZkLoginSession` (ephemeral keypair + proof + maxEpoch) — required
 * for signing transactions via `ZkLoginSigner` (Phase 3 writes).
 *
 * Ported from `apps/web/components/auth/useZkLogin.ts` (~187 LoC) with
 * two diffs from legacy:
 *
 *   1. Drop the `auth-fetch.ts` / `ZKLOGIN_EXPIRED_EVENT` dependency.
 *      Web-v2 doesn't ship the `authFetch` helper today; the engine
 *      route + sponsored-tx routes inject `x-zklogin-jwt` directly via
 *      `headers` on each fetch. Phase 4 can re-add the global expired-
 *      event surface if the UX warrants it.
 *
 *   2. The hook reads the session from localStorage via `loadSession`
 *      (in `lib/zklogin.ts`) — the storage key matches legacy
 *      (`t2000:zklogin:session`), so a user signed in via the legacy
 *      shell carries over to web-v2 on same-origin DNS cutover (G11).
 *
 * Traceability: BENEFITS_SPEC_v07c.md §"Phase 3 Day 3c" + S.175.
 */

import { useSuiClient } from "@mysten/dapp-kit";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ZKLOGIN_EXPIRED_EVENT } from "@/lib/auth-fetch";
import {
  clearSession,
  completeLogin,
  isJwtExpired,
  isSessionExpired,
  isSessionExpiringSoon,
  loadSession,
  startLogin,
  type ZkLoginSession,
  type ZkLoginStep,
} from "@/lib/zklogin";

export type ZkLoginStatus =
  | "loading" // checking localStorage for an existing session
  | "unauthenticated"
  | "redirecting" // heading to Google OAuth
  | "proving" // OAuth callback in progress (JWT → salt → proof)
  | "authenticated"
  | "expired";

export interface UseZkLoginReturn {
  address: string | null;
  /** Error message from the last failed login attempt. */
  error: string | null;
  /** Whether the Sui-epoch session expires within ~24h. */
  expiringSoon: boolean;
  /** Complete login from the callback URL (called by `/auth/callback`). */
  handleCallback: () => Promise<void>;
  /** Initiate Google OAuth redirect. */
  login: () => Promise<void>;
  /** Clear the session and return to unauthenticated. */
  logout: () => void;
  /** Current step during the proving phase (drives the loading UI). */
  provingStep: ZkLoginStep | null;
  /** Re-authenticate (clear + login). */
  refresh: () => Promise<void>;
  session: ZkLoginSession | null;
  status: ZkLoginStatus;
}

export function useZkLogin(): UseZkLoginReturn {
  const client = useSuiClient();
  const [status, setStatus] = useState<ZkLoginStatus>("loading");
  const [session, setSession] = useState<ZkLoginSession | null>(null);
  const [provingStep, setProvingStep] = useState<ZkLoginStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentEpoch, setCurrentEpoch] = useState<number>(0);

  // On mount: check localStorage for an existing session. Per
  // SPEC 30 Phase 1A.7, also gate on the JWT's `exp` claim — without
  // this a dashboard happily renders for a user whose JWT expired
  // hours ago, then every API call 401s.
  useEffect(() => {
    const existing = loadSession();
    if (existing) {
      setSession(existing);
      setStatus(isJwtExpired(existing) ? "expired" : "authenticated");
    } else {
      setStatus("unauthenticated");
    }
  }, []);

  // Fetch the current Sui epoch for expiry checks.
  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    let cancelled = false;
    client
      .getLatestSuiSystemState()
      .then((state) => {
        if (!cancelled) {
          setCurrentEpoch(Number(state.epoch));
        }
      })
      .catch(() => {
        // Best-effort — expiry check degrades gracefully.
      });

    return () => {
      cancelled = true;
    };
  }, [client, status]);

  // Tick the JWT-exp check every 60s so a session that crosses the
  // 1h Google-OIDC TTL during an active tab gets flipped to 'expired'.
  useEffect(() => {
    if (!session) {
      return;
    }

    const check = () => {
      if (currentEpoch > 0 && isSessionExpired(session, currentEpoch)) {
        setStatus("expired");
        return true;
      }
      if (isJwtExpired(session)) {
        setStatus("expired");
        return true;
      }
      return false;
    };

    if (check()) {
      return;
    }
    const id = window.setInterval(check, 60_000);
    return () => window.clearInterval(id);
  }, [session, currentEpoch]);

  // A server-side 401 (JWT revoked / clock-skew / crossed the 1h OIDC TTL
  // between 60s polls) is broadcast by `authFetch` as a window event.
  // Without this listener a mid-session 401 left the user on a dead chat
  // screen ("Reconnecting") with no redirect. Flip to `expired` + clear
  // the stale session so the chat routes bounce to `/` and `loadSession`
  // can't re-hydrate the dead session on the next mount (no redirect loop).
  // Guarded on `authenticated` so a 401 mid-login (`proving`) is ignored.
  const statusRef = useRef(status);
  statusRef.current = status;
  useEffect(() => {
    const onExpired = () => {
      if (statusRef.current !== "authenticated") {
        return;
      }
      clearSession();
      setSession(null);
      setCurrentEpoch(0);
      setStatus("expired");
    };
    window.addEventListener(ZKLOGIN_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(ZKLOGIN_EXPIRED_EVENT, onExpired);
  }, []);

  const expiringSoon = useMemo(() => {
    if (!session || currentEpoch === 0) {
      return false;
    }
    return isSessionExpiringSoon(session, currentEpoch);
  }, [session, currentEpoch]);

  const getCurrentEpoch = useCallback(async (): Promise<number> => {
    const state = await client.getLatestSuiSystemState();
    return Number(state.epoch);
  }, [client]);

  const login = useCallback(async () => {
    try {
      setError(null);
      setStatus("redirecting");
      await startLogin(getCurrentEpoch);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start login");
      setStatus("unauthenticated");
    }
  }, [getCurrentEpoch]);

  const handleCallback = useCallback(async () => {
    try {
      setError(null);
      setStatus("proving");
      const newSession = await completeLogin({ onStep: setProvingStep });
      setSession(newSession);
      setStatus("authenticated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setStatus("unauthenticated");
    }
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
    setCurrentEpoch(0);
    setProvingStep(null);
    setError(null);
    setStatus("unauthenticated");
    window.location.href = "/";
  }, []);

  const refresh = useCallback(async () => {
    logout();
    await login();
  }, [logout, login]);

  return {
    status,
    session,
    address: session?.address ?? null,
    provingStep,
    error,
    expiringSoon,
    login,
    handleCallback,
    logout,
    refresh,
  };
}
