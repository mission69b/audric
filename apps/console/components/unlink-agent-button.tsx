"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { renounceOwnership } from "@/lib/renounce-ownership";

// Owner-side UNLINK (registry v2 renounce_ownership, S.691) — the on-chain
// verb next to the off-chain Remove: clears the public `owner` field, the
// record returns to autonomous, and the agent leaves your console because it
// genuinely isn't yours anymore. Two-tap confirm; gasless (sponsored);
// re-linking is the agent proposing again + you confirming.
export function UnlinkAgentButton({ agent }: { agent: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async () => {
    setBusy(true);
    setError(null);
    try {
      await renounceOwnership(agent);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unlink failed.");
      setBusy(false);
      setConfirming(false);
    }
  };

  if (error) {
    return <span className="text-destructive text-xs">{error}</span>;
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="hidden text-fg-subtle text-xs sm:inline">
          Public + on-chain — re-link needs the agent to propose again.
        </span>
        <button
          className="ag-btn ag-btn--ghost ag-btn--sm"
          disabled={busy}
          onClick={act}
          type="button"
        >
          {busy ? "Unlinking…" : "Confirm unlink"}
        </button>
      </span>
    );
  }

  return (
    <button
      className="ag-btn ag-btn--ghost ag-btn--sm text-fg-subtle"
      onClick={() => setConfirming(true)}
      type="button"
    >
      Unlink
    </button>
  );
}
