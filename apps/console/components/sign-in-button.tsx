"use client";

import { startLogin } from "@audric/auth/client";
import { useState } from "react";
import { ZK_CONFIG } from "@/lib/zk-config";

export function SignInButton() {
  const [loading, setLoading] = useState(false);

  return (
    <button
      className="inline-flex h-10 items-center justify-center rounded-lg bg-[var(--accent)] px-5 font-medium text-sm text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await startLogin(ZK_CONFIG);
        } catch {
          setLoading(false);
        }
      }}
      type="button"
    >
      {loading ? "Redirecting…" : "Sign in with Google"}
    </button>
  );
}
