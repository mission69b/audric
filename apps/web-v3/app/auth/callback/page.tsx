"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useZkLogin } from "@/components/auth/zklogin-provider";

const STEP_LABEL: Record<string, string> = {
  jwt: "Verifying sign-in…",
  address: "Deriving your Passport wallet…",
  proof: "Securing your session…",
  done: "Done",
};

export default function AuthCallbackPage() {
  const { handleCallback, status, error, provingStep } = useZkLogin();
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) {
      return;
    }
    ran.current = true;
    // biome-ignore lint/complexity/noVoid: deliberate fire-and-forget in an effect
    void handleCallback();
  }, [handleCallback]);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      {error ? (
        <>
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            className="rounded-lg bg-foreground px-4 py-2 text-background text-sm"
            onClick={() => router.replace("/")}
            type="button"
          >
            Back to Audric
          </button>
        </>
      ) : (
        <>
          <div className="size-6 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
          <p className="text-muted-foreground text-sm">
            {STEP_LABEL[provingStep ?? "jwt"] ?? "Signing you in…"}
          </p>
        </>
      )}
    </div>
  );
}
