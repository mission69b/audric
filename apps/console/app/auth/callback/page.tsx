"use client";

import { completeLogin } from "@audric/auth/client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ZK_CONFIG } from "@/lib/zk-config";

export default function CallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) {
      return;
    }
    ran.current = true;

    (async () => {
      try {
        const session = await completeLogin(ZK_CONFIG);
        // Mint the server session (httpOnly cookie scoped to this domain).
        const res = await fetch("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jwt: session.jwt,
            expiresAt: session.expiresAt,
          }),
        });
        if (!res.ok) {
          throw new Error("Failed to establish session");
        }
        router.replace("/manage/dashboard");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sign-in failed");
      }
    })();
  }, [router]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center px-6 text-center">
      {error ? (
        <div className="space-y-4">
          <p className="text-foreground">{error}</p>
          <a
            className="text-accent text-sm underline underline-offset-4"
            href="/"
          >
            Try again
          </a>
        </div>
      ) : (
        <p className="text-muted-foreground">Signing you in…</p>
      )}
    </main>
  );
}
