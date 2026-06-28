"use client";

import { startLogin } from "@audric/auth/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ZK_CONFIG } from "@/lib/zk-config";

export function SignInButton() {
  const [loading, setLoading] = useState(false);

  return (
    <Button
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await startLogin(ZK_CONFIG);
        } catch {
          setLoading(false);
        }
      }}
    >
      {loading ? "Redirecting…" : "Sign in with Google"}
    </Button>
  );
}
