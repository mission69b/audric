"use client";

import { XIcon } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * GraceBanner — the DeFi wind-down contact surface (SPEC_AUDRIC_DEFI_REMOVAL
 * §2d "contact users", founder-locked banner-only channel; S.408).
 *
 * Shown to everyone while the 7-day grace window runs (cut deployed
 * 2026-06-12 → window closes 2026-06-19). Dismissible per-browser via
 * localStorage. The "Consolidate to USDC" action prefills the composer with
 * the canonical exit prompt (injection-only, CHIP_REVIEW_3 — the agent +
 * grace-window tools do the work; no custom stepper).
 *
 * Delete this component at the post-window cut along with
 * withdraw/repay_debt/swap.
 */

const GRACE_WINDOW_ENDS_MS = Date.parse("2026-06-19T23:59:59Z");
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
    if (Date.now() > GRACE_WINDOW_ENDS_MS) {
      return;
    }
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
          Savings &amp; DeFi are winding down.
        </span>{" "}
        Withdraw, repay, and swap-to-USDC stay available through{" "}
        <span className="font-medium text-foreground">June 19</span> — after
        that, manage legacy positions at app.naviprotocol.io.
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
