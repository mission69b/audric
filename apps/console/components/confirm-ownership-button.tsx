"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { confirmOwnership } from "@/lib/confirm-ownership";

// Confirms ownership of an agent that proposed the signed-in user (gate 8b).
// Signs the sponsored confirm tx with the Passport session key.
export function ConfirmOwnershipButton({ agent }: { agent: string }) {
  const [status, setStatus] = useState<"idle" | "signing" | "done" | "error">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);

  if (status === "done") {
    return <span className="text-muted-foreground text-xs">Confirmed ✓</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        disabled={status === "signing"}
        onClick={async () => {
          setStatus("signing");
          setError(null);
          try {
            await confirmOwnership(agent);
            setStatus("done");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Confirmation failed.");
            setStatus("error");
          }
        }}
        size="sm"
      >
        {status === "signing" ? "Confirming…" : "Confirm ownership"}
      </Button>
      {error && <span className="text-destructive text-xs">{error}</span>}
    </div>
  );
}
