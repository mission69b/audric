"use client";

import {
  isSessionExpired,
  loadSession,
  toZkLoginSigner,
} from "@audric/auth/client";
import { fromBase64 } from "@mysten/sui/utils";
import { useRouter } from "next/navigation";
import { useState } from "react";

// SELF-agent on-chain active toggle (registry `set_active`) — the per-agent
// kill switch (§4b.1 supervision). Prepare (address pinned server-side) →
// zkLogin sign → submit. Sponsored, gasless. Explicit confirm; reversible.
export function ActiveToggle({ active }: { active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState("");

  const flip = async () => {
    const session = loadSession();
    if (!session || isSessionExpired(session)) {
      setError("Your session expired — sign in again first.");
      return;
    }
    // Two-step confirm (no browser dialogs): first click arms, second signs.
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    const next = !active;
    setBusy(true);
    setError("");
    try {
      const prep = await fetch("/api/agent/active-prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: next }),
      });
      const pj = (await prep.json().catch(() => ({}))) as {
        nonce?: string;
        txBytes?: string;
        error?: { message?: string } | string;
      };
      if (!(prep.ok && pj.nonce && pj.txBytes)) {
        throw new Error(
          typeof pj.error === "string"
            ? pj.error
            : (pj.error?.message ?? "Couldn't prepare the toggle.")
        );
      }
      const signer = toZkLoginSigner(session);
      const { signature } = await signer.signTransaction(
        fromBase64(pj.txBytes)
      );
      const sub = await fetch("/api/agent/active-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonce: pj.nonce, signature }),
      });
      const sj = (await sub.json().catch(() => ({}))) as {
        error?: { message?: string } | string;
      };
      if (!sub.ok) {
        throw new Error(
          typeof sj.error === "string"
            ? sj.error
            : (sj.error?.message ?? "Toggle failed.")
        );
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Toggle failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        className="ag-btn ag-btn--ghost text-xs"
        disabled={busy}
        onClick={flip}
        type="button"
      >
        {busy
          ? "Signing…"
          : armed
            ? active
              ? "Confirm deactivate?"
              : "Confirm reactivate?"
            : active
              ? "Deactivate on-chain"
              : "Reactivate on-chain"}
      </button>
      {error && <span className="text-destructive text-xs">{error}</span>}
      <span className="text-fg-subtle text-xs">
        {armed
          ? "Click again to sign — reversible, the record and history persist."
          : "The on-chain kill switch — hides the whole agent from the store (reversible). \u201CSave service\u201D above only edits the listing."}
      </span>
    </div>
  );
}
