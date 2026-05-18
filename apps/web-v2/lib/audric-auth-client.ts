"use client";

/**
 * audric-auth-client — client-only adapter that replaces next-auth's
 * `useSession` / `signOut` / `<SessionProvider>` surface for the v0.7c
 * fork.
 *
 * Companion file: `lib/audric-auth.ts` (types + server `getCurrentUser`).
 *
 * Why split: Next.js's RSC boundary requires that any module containing
 * React hooks or window access carry the `'use client'` directive.
 * `lib/audric-auth.ts` is imported by Server Components / Route Handlers
 * and CANNOT carry the directive.
 *
 * Day 1c scope (mirrors `audric-auth.ts` header):
 *  - `useAudricSession()` — hydrates from `localStorage` key
 *    `t2000:zklogin:session` (the audric/web canonical storage key).
 *    Returns the `{ data, status }` shape `next-auth/react`'s
 *    `useSession()` did, so consumers like `sidebar-user-nav.tsx` work
 *    without code-shape churn.
 *  - `signOutAudric()` — clears localStorage and navigates home.
 *    Audric's auth model is purely client-state-driven; there's no
 *    server session to invalidate.
 *  - `ZkLoginProvider` — children passthrough; replaces
 *    `<SessionProvider>` in `app/layout.tsx`. Phase 2 swaps in the full
 *    @mysten/dapp-kit `WalletProvider` tree sourced from
 *    `apps/web/components/auth/useZkLogin.ts`.
 */

import { decodeJwt } from "jose";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { AudricSession } from "./audric-auth";

export type AudricSessionStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated";

export interface AudricSessionHookResult {
  data: AudricSession | null;
  status: AudricSessionStatus;
}

/**
 * Hydrates the zkLogin session from `localStorage`. Storage key matches
 * `apps/web/lib/zklogin.ts` so a user signed in via the existing
 * audric/web shell would carry over to web-v2 on same-origin DNS cutover
 * (G11).
 *
 * Returns `{ data: null, status: 'loading' }` during SSR and the first
 * client paint; flips to `'authenticated'` (or `'unauthenticated'`)
 * after the `useEffect`-driven localStorage read completes. Close enough
 * to `useSession`'s contract for the existing template consumers.
 */
export function useAudricSession(): AudricSessionHookResult {
  const [state, setState] = useState<AudricSessionHookResult>({
    data: null,
    status: "loading",
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const raw = window.localStorage.getItem("t2000:zklogin:session");
      if (!raw) {
        setState({ data: null, status: "unauthenticated" });
        return;
      }
      const blob = JSON.parse(raw) as {
        jwt?: string;
        address?: string;
        expiresAt?: number;
      };
      if (!blob.jwt || !blob.address) {
        setState({ data: null, status: "unauthenticated" });
        return;
      }
      if (typeof blob.expiresAt === "number" && Date.now() > blob.expiresAt) {
        setState({ data: null, status: "unauthenticated" });
        return;
      }
      const payload = decodeJwt(blob.jwt);
      const email = typeof payload.email === "string" ? payload.email : null;
      setState({
        data: {
          user: {
            id: blob.address,
            email,
            type: "regular",
          },
        },
        status: "authenticated",
      });
    } catch {
      setState({ data: null, status: "unauthenticated" });
    }
  }, []);

  return state;
}

/**
 * Clears the audric/web zkLogin localStorage session and navigates home.
 * No server round-trip is required — audric's auth model is purely
 * client-state-driven.
 */
export async function signOutAudric(opts?: {
  redirectTo?: string;
}): Promise<void> {
  // Async signature preserved to match next-auth's `signOut()` so the
  // existing call sites (`await signOut({ redirectTo: "/" })`) work
  // verbatim. The body is synchronous (localStorage clears + window
  // navigation) so this is just contract fidelity, not real I/O.
  await Promise.resolve();
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem("t2000:zklogin:session");
    window.sessionStorage.removeItem("t2000:zklogin:pending");
  } catch {
    // localStorage / sessionStorage access can throw in private-browsing
    // mode; swallow because the redirect below is the load-bearing
    // sign-out signal.
  }
  const target = opts?.redirectTo ?? "/";
  window.location.assign(target);
}

/**
 * Day 1c minimal provider — children passthrough. The hook
 * `useAudricSession()` reads localStorage directly so no React context
 * is required for the Day 1c smoke. Phase 2 swaps this for the full
 * @mysten/dapp-kit `WalletProvider` + Enoki client tree sourced from
 * `apps/web/components/auth/useZkLogin.ts`.
 */
export function ZkLoginProvider({ children }: { children: ReactNode }) {
  return children as ReactNode;
}
