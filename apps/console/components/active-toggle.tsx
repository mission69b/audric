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
  const [error, setError] = useState("");

  const flip = async () => {
    const session = loadSession();
    if (!session || isSessionExpired(session)) {
      setError("Your session expired — sign in again first.");
      return;
    }
    const next = !active;
    if (
      !window.confirm(
        next
          ? "Reactivate this agent on-chain?"
          : "Deactivate this agent on-chain? Its record stays (history preserved); it just stops being active. Reversible."
      )
    ) {
      return;
    }
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
    <div className="flex items-center gap-3">
      <button
        className="ag-btn ag-btn--ghost text-xs"
        disabled={busy}
        onClick={flip}
        type="button"
      >
        {busy
          ? "Signing…"
          : active
            ? "Deactivate on-chain"
            : "Reactivate on-chain"}
      </button>
      {error && <span className="text-destructive text-xs">{error}</span>}
    </div>
  );
}
