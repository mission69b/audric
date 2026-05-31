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
 * On failure → renders the AU3 error variant (Back / Try again).
 *
 * [R6.5 5c — 2026-05-31] The screen is now the calm AU3 holding screen
 * (pulsing `AudricMark`), rebuilt from the v1-ported 3-step progress list
 * to match `phase2-auth-callback.html`. See `loading-screen.tsx`.
 */

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { LoadingScreen } from "@/components/auth/loading-screen";
import { useZkLogin } from "@/components/auth/use-zklogin";
import { isJwtExpired, loadSession } from "@/lib/zklogin";

export default function AuthCallbackPage() {
  const router = useRouter();
  const { status, provingStep, error, handleCallback, login } = useZkLogin();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    // Already signed in (e.g. a bookmarked /auth/callback with no OAuth
    // hash) → skip `completeLogin` (which would throw "No JWT found" and
    // show the error screen) and go straight to chat.
    const existing = loadSession();
    if (existing && !isJwtExpired(existing)) {
      router.replace("/chat");
      return;
    }
    handleCallback().catch((err) => {
      console.error("[auth/callback] handleCallback failed:", err);
    });
  }, [handleCallback, router]);

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
      onBack={() => router.replace("/")}
      onRetry={() => {
        login().catch((err) => {
          console.error("[auth/callback] retry login failed:", err);
        });
      }}
      step={provingStep}
    />
  );
}
