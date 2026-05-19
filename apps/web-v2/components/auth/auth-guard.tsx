"use client";

/**
 * `<AuthGuard>` — client-side gate.
 *
 * Redirects unauthenticated visitors to `/` (marketing landing on apps/web
 * post-Phase-6 rewrites). Shows a spinner while the session resolves.
 *
 * Ported from `apps/web/components/auth/AuthGuard.tsx` with the spinner
 * source swapped for web-v2's `Spinner` from `components/ui/spinner.tsx`.
 */

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Spinner } from "@/components/ui/spinner";
import { useZkLogin } from "./use-zklogin";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const { status } = useZkLogin();

  useEffect(() => {
    if (status === "unauthenticated" || status === "expired") {
      router.replace("/");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center">
        <Spinner />
      </main>
    );
  }

  if (status === "unauthenticated" || status === "expired") {
    return null;
  }

  return <>{children}</>;
}
