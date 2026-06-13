"use client";

import { XIcon } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * GraceBanner — the DeFi wind-down surface (SPEC_AUDRIC_DEFI_REMOVAL §2d;
 * S.408, copy/gating revised S.428).
 *
 * S.428 reframe: web-v2 is kept FROZEN + INTACT (DeFi-exit tools +
 * BlockVision) as the legacy app until Audric v3 replaces it — the
 * post-window cut is CANCELLED. So there is NO June-19 close: the exit
 * tools stay available indefinitely. The banner shows (dismissible
 * per-browser) until web-v2 is deleted; the "Consolidate to USDC" action
 * prefills the composer with the canonical exit prompt (injection-only,
 * CHIP_REVIEW_3 — the agent + grace tools do the work; no custom stepper).
 *
 * Delete this component when web-v2 is deleted (v3 cutover).
 */

const DISMISS_KEY = "audric-defi-grace-banner-dismissed";

export const CONSOLIDATE_PROMPT =
  "Withdraw all my NAVI savings, repay any outstanding debt, and swap all my non-USDC tokens to USDC";

export function GraceBanner({
  onConsolidate,
}: {
  /** Fired with the canonical consolidate prompt — same contract as ChipBar. */
  onConsolidate: (prompt: string) => void;
}) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Private-mode storage failure — the in-memory dismiss above suffices.
    }
  };

  return (
    <div className="mx-auto mb-2 flex w-full max-w-4xl items-center gap-3 rounded-lg border border-warning/30 bg-warning/[0.06] px-4 py-2.5">
      <p className="flex-1 text-[12px] text-foreground/80 leading-relaxed">
        <span className="font-medium text-foreground">
          Something new is coming.
        </span>{" "}
        Savings &amp; DeFi are winding down — move everything back to USDC
        whenever you&apos;re ready, in one tap.
      </p>
      <button
        className="shrink-0 rounded-full border border-foreground/20 px-3 py-1 font-mono text-[10px] text-foreground uppercase tracking-[0.1em] transition hover:border-foreground/50"
        onClick={() => onConsolidate(CONSOLIDATE_PROMPT)}
        type="button"
      >
        Consolidate to USDC
      </button>
      <button
        aria-label="Dismiss"
        className="shrink-0 text-muted-foreground transition hover:text-foreground"
        onClick={handleDismiss}
        type="button"
      >
        <XIcon size={14} />
      </button>
    </div>
  );
}
