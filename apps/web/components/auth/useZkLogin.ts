'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSuiClient } from '@mysten/dapp-kit';
import type { ZkLoginSession, ZkLoginStep } from '@/lib/zklogin';
import {
  loadSession,
  clearSession,
  startLogin,
  completeLogin,
  isSessionExpired,
  isSessionExpiringSoon,
  isJwtExpired,
} from '@/lib/zklogin';
import { ZKLOGIN_EXPIRED_EVENT } from '@/lib/auth-fetch';

export type ZkLoginStatus =
  | 'loading'       // checking localStorage for existing session
  | 'unauthenticated'
  | 'redirecting'   // heading to Google OAuth
  | 'proving'       // callback in progress (JWT → salt → ZK proof)
  | 'authenticated'
  | 'expired';

export interface UseZkLoginReturn {
  status: ZkLoginStatus;
  session: ZkLoginSession | null;
  address: string | null;
  /** Current step during proving phase (for loading screen) */
  provingStep: ZkLoginStep | null;
  /** Error message if login failed */
  error: string | null;
  /** Whether session expires within ~24h */
  expiringSoon: boolean;
  /** Initiate Google OAuth redirect */
  login: () => Promise<void>;
  /** Complete login from callback URL (called by auth/callback page) */
  handleCallback: () => Promise<void>;
  /** Clear session and return to unauthenticated */
  logout: () => void;
  /** Re-authenticate (clear + login) */
  refresh: () => Promise<void>;
}

export function useZkLogin(): UseZkLoginReturn {
  const client = useSuiClient();
  const [status, setStatus] = useState<ZkLoginStatus>('loading');
  const [session, setSession] = useState<ZkLoginSession | null>(null);
  const [provingStep, setProvingStep] = useState<ZkLoginStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentEpoch, setCurrentEpoch] = useState<number>(0);

  // On mount: check for existing session.
  //
  // SPEC 30 Phase 1A.7 — also gate on the underlying Google JWT's
  // `exp` claim, not just the Sui-epoch `maxEpoch`. Routes secured in
  // 1A/1A.5/1A.6 use `jose.jwtVerify` which enforces `exp` (1h on
  // Google's side) — without this check the dashboard happily renders
  // for a user whose JWT expired hours ago, then every API call 401s.
  useEffect(() => {
    const existing = loadSession();
    if (existing) {
      setSession(existing);
      setStatus(isJwtExpired(existing) ? 'expired' : 'authenticated');
    } else {
      setStatus('unauthenticated');
    }
  }, []);

  // Fetch current epoch for expiry checks
  useEffect(() => {
    if (status !== 'authenticated') return;

    let cancelled = false;
    client.getLatestSuiSystemState().then((state) => {
      if (!cancelled) {
        setCurrentEpoch(Number(state.epoch));
      }
    }).catch(() => { /* swallow — expiry check is best-effort */ });

    return () => { cancelled = true; };
  }, [client, status]);

  // Check if session is expired (Sui-epoch OR JWT exp).
  //
  // SPEC 30 Phase 1A.7 — tick the JWT-exp check every 60s so a session
  // that crosses the 1h Google-OIDC TTL during an active tab gets
  // flipped to 'expired' and AuthGuard redirects to re-login, instead
  // of leaving the user on a dashboard whose API calls all 401.
  useEffect(() => {
    if (!session) return;

    const check = () => {
      if (currentEpoch > 0 && isSessionExpired(session, currentEpoch)) {
        setStatus('expired');
        return true;
      }
      if (isJwtExpired(session)) {
        setStatus('expired');
        return true;
      }
      return false;
    };

    if (check()) return;
    const id = window.setInterval(check, 60_000);
    return () => window.clearInterval(id);
  }, [session, currentEpoch]);

  // SPEC 30 followup — server-confirmed 401 from any `authFetch` call
  // immediately flips status to 'expired'. This closes the race where
  // a canvas / hook fetch fires in the gap between actual JWT expiry
  // and the next 60s poll tick — without this, the user sees broken
  // canvases and stale data instead of getting redirected to re-login.
  //
  // See `lib/auth-fetch.ts` for the producer side.
  useEffect(() => {
    if (!session) return;
    const handleExpired = () => setStatus('expired');
    window.addEventListener(ZKLOGIN_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(ZKLOGIN_EXPIRED_EVENT, handleExpired);
  }, [session]);

  const expiringSoon = useMemo(() => {
    if (!session || currentEpoch === 0) return false;
    return isSessionExpiringSoon(session, currentEpoch);
  }, [session, currentEpoch]);

  const getCurrentEpoch = useCallback(async (): Promise<number> => {
    const state = await client.getLatestSuiSystemState();
    return Number(state.epoch);
  }, [client]);

  const login = useCallback(async () => {
    try {
      setError(null);
      setStatus('redirecting');
      await startLogin(getCurrentEpoch);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start login');
      setStatus('unauthenticated');
    }
  }, [getCurrentEpoch]);

  const handleCallback = useCallback(async () => {
    try {
      setError(null);
      setStatus('proving');
      const newSession = await completeLogin({
        onStep: setProvingStep,
      });
      setSession(newSession);
      setStatus('authenticated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setStatus('unauthenticated');
    }
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
    setCurrentEpoch(0);
    setProvingStep(null);
    setError(null);
    setStatus('unauthenticated');
    window.location.href = '/';
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
