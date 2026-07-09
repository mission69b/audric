"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { renounceOwnership } from "@/lib/renounce-ownership";

// The Hide / Dismiss / Unlink actions behind ONE real confirmation modal
// (founder catch, S.692: the inline two-tap read as broken — several rows
// could sit in "confirm" at once, and nothing explained what each verb
// does). Each action states exactly what happens, warns when the agent is
// LIVE, and uses a destructive confirm for the on-chain one.

type Action = "hide" | "dismiss" | "unlink";

const COPY: Record<
  Action,
  {
    trigger: string;
    title: (name: string) => string;
    body: string;
    liveWarning?: string;
    confirm: string;
  }
> = {
  hide: {
    trigger: "Hide",
    title: (n) => `Hide ${n}?`,
    body: "Hides this agent from your console only. Its on-chain record, store listing, and receipts all persist — restore it anytime from the footer of this page.",
    liveWarning:
      "This agent is LIVE — hiding it does not delist it; it keeps selling.",
    confirm: "Hide agent",
  },
  dismiss: {
    trigger: "Dismiss",
    title: (n) => `Dismiss the proposal from ${n}?`,
    body: "This agent proposed you as its owner. Dismissing hides the request from your console — nothing binds on-chain, and the agent can propose again.",
    confirm: "Dismiss",
  },
  unlink: {
    trigger: "Unlink",
    title: (n) => `Unlink ${n}?`,
    body: "Your Passport publicly renounces ownership on-chain (one sponsored, gasless signature). The agent returns to autonomous and leaves your console. Re-linking requires the AGENT to propose again — if its key is lost, unlinking is permanent.",
    liveWarning:
      "This agent is LIVE — it keeps selling autonomously after you unlink (earnings stay in its own wallet, as always).",
    confirm: "Unlink — I understand",
  },
};

export function AgentActionButton({
  agent,
  name,
  action,
  active = false,
}: {
  agent: string;
  name: string;
  action: Action;
  /** Live agents get an extra warning line in the modal. */
  active?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[action];

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const act = async () => {
    setBusy(true);
    setError(null);
    try {
      if (action === "unlink") {
        await renounceOwnership(agent);
      } else {
        const res = await fetch("/api/agent/archive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent, archived: true }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!res.ok) {
          throw new Error(json.error ?? "Failed — try again.");
        }
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        className="ag-btn ag-btn--ghost ag-btn--sm text-fg-subtle"
        onClick={() => setOpen(true)}
        type="button"
      >
        {copy.trigger}
      </button>

      {open && (
        // biome-ignore lint/a11y/noStaticElementInteractions: scrim click-to-close
        // biome-ignore lint/a11y/useKeyWithClickEvents: Escape handled above
        // biome-ignore lint/a11y/noNoninteractiveElementInteractions: scrim click-to-close
        <div className="ag-scrim" onClick={() => setOpen(false)}>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: stop scrim close */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: container only */}
          {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: stop scrim close */}
          <div
            className="ag-modal max-w-[440px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5">
              <div className="font-semibold text-[16px] text-foreground">
                {copy.title(name)}
              </div>
              <p className="mt-2 mb-0 text-[13.5px] text-fg-muted leading-relaxed">
                {copy.body}
              </p>
              {active && copy.liveWarning && (
                <p className="mt-3 mb-0 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12.5px] text-amber-500">
                  {copy.liveWarning}
                </p>
              )}
              {error && (
                <p className="mt-3 mb-0 text-[12.5px] text-destructive">
                  {error}
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4">
              <button
                className="ag-btn ag-btn--ghost ag-btn--sm"
                disabled={busy}
                onClick={() => setOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className={
                  action === "unlink"
                    ? "ag-btn ag-btn--sm border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
                    : "ag-btn ag-btn--sm"
                }
                disabled={busy}
                onClick={act}
                type="button"
              >
                {busy ? "Working…" : copy.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** One-tap restore (un-hide) — harmless, no modal needed. */
export function RestoreButton({ agent }: { agent: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent, archived: false }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Failed — try again.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed — try again.");
      setBusy(false);
    }
  };

  if (error) {
    return <span className="text-destructive text-xs">{error}</span>;
  }
  return (
    <button
      className="ag-btn ag-btn--ghost ag-btn--sm"
      disabled={busy}
      onClick={act}
      type="button"
    >
      {busy ? "…" : "Restore"}
    </button>
  );
}
