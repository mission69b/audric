"use client";

/**
 * /auth/callback — Google OAuth landing page.
 *
 * Google redirects back here after the user clicks "Continue".
 * The page runs `useZkLogin.handleCallback()` once to:
 *  1. Extract the JWT from the URL hash
 *  2. Fetch salt + address from Enoki
 *  3. Generate the ZK proof (~3-8s)
 *  4. Persist the full session blob to localStorage
 *
 * On success → redirects to `/chat`.
 * On failure → renders the error inline with a retry button.
 *
 * Ported from `apps/web/app/auth/callback/page.tsx`. v0.7c Phase 2-stub
 * had a minimal inline progress UI; S.204+ Phase 6.7 polish replaces it
 * with the full v1 LoadingScreen (3-step monospace progress + bottom bar
 * + NewYork serif heading) so the splash matches v1 visually.
 */

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { LoadingScreen } from "@/components/auth/loading-screen";
import { useZkLogin } from "@/components/auth/use-zklogin";

export default function AuthCallbackPage() {
  const router = useRouter();
  const { status, provingStep, error, handleCallback, login } = useZkLogin();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    handleCallback().catch((err) => {
      console.error("[auth/callback] handleCallback failed:", err);
    });
  }, [handleCallback]);

  useEffect(() => {
    if (status === "authenticated") {
      // ~1.2s window after `done` lets LoadingScreen flash the
      // success state ("You're all set") before the route swap.
      const timer = setTimeout(() => router.replace("/chat"), 1200);
      return () => clearTimeout(timer);
    }
  }, [status, router]);

  return (
    <LoadingScreen
      error={error}
      onRetry={() => {
        login().catch((err) => {
          console.error("[auth/callback] retry login failed:", err);
        });
      }}
      step={provingStep}
    />
  );
}
