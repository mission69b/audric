"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Owner-side remove/dismiss/restore (S.690) — two-tap confirm (no alert()),
// same pattern as the task takedown lane. Off-chain only: the listing's
// on-chain record + receipts persist; restore lives in the page footer.
export function ArchiveAgentButton({
  agent,
  archived,
  label,
}: {
  agent: string;
  /** True = this button RESTORES (the row is currently archived). */
  archived?: boolean;
  /** Button copy — "Remove" (owned) | "Dismiss" (pending) | "Restore". */
  label: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent, archived: !archived }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Failed — try again.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed — try again.");
      setBusy(false);
      setConfirming(false);
    }
  };

  if (error) {
    return <span className="text-destructive text-xs">{error}</span>;
  }

  if (archived || confirming) {
    return (
      <button
        className="ag-btn ag-btn--ghost ag-btn--sm"
        disabled={busy}
        onClick={act}
        type="button"
      >
        {busy ? "…" : archived ? label : `Confirm ${label.toLowerCase()}`}
      </button>
    );
  }

  return (
    <button
      className="ag-btn ag-btn--ghost ag-btn--sm text-fg-subtle"
      onClick={() => setConfirming(true)}
      type="button"
    >
      {label}
    </button>
  );
}
