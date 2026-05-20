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
 * On success → redirects to `/audric-chat` (the Phase 2 chat surface).
 * On failure → renders the error inline with a retry button.
 *
 * Ported from `apps/web/app/auth/callback/page.tsx`. The legacy page
 * uses a custom `LoadingScreen` component that web-v2 doesn't have yet
 * — we inline a minimal progress display instead. Phase 4+ can vendor
 * the richer loading UI when the broader marketing surface lands.
 */

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
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
      const timer = setTimeout(() => router.replace("/chat"), 1200);
      return () => clearTimeout(timer);
    }
  }, [status, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="font-semibold text-2xl">Signing you in…</h1>
      <p className="text-muted-foreground text-sm">
        {provingStep === "jwt" && "Verifying your identity…"}
        {provingStep === "salt" && "Deriving your Sui wallet address…"}
        {provingStep === "proof" &&
          "Generating zero-knowledge proof (this takes 3–8 seconds)…"}
        {provingStep === "done" && "All set — redirecting to chat…"}
        {!provingStep && status !== "authenticated" && "Reading callback data…"}
      </p>
      {error && (
        <div className="mt-4 flex flex-col items-center gap-3">
          <p className="text-destructive text-sm">Login failed: {error}</p>
          <button
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground text-sm"
            onClick={() => {
              login().catch((err) => {
                console.error("[auth/callback] retry login failed:", err);
              });
            }}
            type="button"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
