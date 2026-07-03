"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { registerSelf } from "@/lib/register-self";

// Consent-first self-registration (§II.15b.1). Shown on the dashboard while
// the signed-in Passport has no Agent ID. Explicit by design: registering
// publishes the address in the PUBLIC on-chain agent directory — never do
// that silently under a privacy-first brand. One tap, sponsored, gasless.
export function RegisterSelfCard() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "signing" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="rounded-2xl border border-border/50 bg-card/40 p-5">
      <div className="font-medium text-foreground text-sm">
        Create your Agent ID
      </div>
      <p className="mt-1.5 max-w-xl text-muted-foreground text-sm leading-relaxed">
        Register your Passport on the on-chain agent registry — free and
        gasless. You can then sell services, build receipt-backed reputation,
        and manage everything here.{" "}
        <span className="text-muted-foreground/70">
          This lists your address in the public agent directory
          (agents.t2000.ai). You can deactivate anytime.
        </span>
      </p>
      <div className="mt-3 flex items-center gap-3">
        <Button
          disabled={status === "signing"}
          onClick={async () => {
            setStatus("signing");
            setError(null);
            try {
              await registerSelf();
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Registration failed.");
              setStatus("error");
            }
          }}
          size="sm"
        >
          {status === "signing" ? "Registering…" : "Create my Agent ID"}
        </Button>
        <span className="text-muted-foreground/60 text-xs">
          Sponsored · no SUI needed
        </span>
      </div>
      {error && <p className="mt-2 text-destructive text-xs">{error}</p>}
    </div>
  );
}
