"use client";

import { useEffect } from "react";

interface CopilotOnboardingModalProps {
  open: boolean;
  hasMigratedActions: boolean;
  onDismiss: () => void;
}

/**
 * Wave C.7 — one-time intro to Audric Copilot (Smart Confirmations).
 *
 * Two copy variants:
 *   - Migrated user (`hasMigratedActions=true`): explains that previously
 *     autonomous schedules now ask every time, with a path to the new
 *     /settings/copilot tab.
 *   - Brand-new Copilot user: short pitch on what Smart Confirmations are
 *     and where suggestions show up (dashboard row + chat surface).
 *
 * Single primary CTA dismisses the modal (server-side stamp via the
 * onboarding mutation in the parent). No optional "later" path — this is
 * shown exactly once, so a single acknowledgement is the right model.
 */
export function CopilotOnboardingModal({
  open,
  hasMigratedActions,
  onDismiss,
}: CopilotOnboardingModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-40"
        aria-hidden="true"
        onClick={onDismiss}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="copilot-onboarding-title"
          className="bg-background border border-border rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4"
        >
          <div className="space-y-1">
            <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-accent">
              Audric Copilot
            </p>
            <h2
              id="copilot-onboarding-title"
              className="text-lg font-semibold text-foreground"
            >
              {hasMigratedActions
                ? "Your automations now ask first."
                : "Audric noticed — you decide."}
            </h2>
          </div>

          {hasMigratedActions ? (
            <div className="space-y-3 text-sm text-muted leading-relaxed">
              <p>
                We&apos;ve switched your previously autonomous schedules to
                ask-every-time. You stay in control of every transaction.
              </p>
              <p>
                When Audric spots a recurring pattern or an opportunity (idle
                balance, claimable rewards, low health factor), you&apos;ll
                see a suggestion card. Tap it to review and confirm — or
                snooze, skip, or pause it for good.
              </p>
              <p className="text-xs text-dim">
                Manage digest emails and the health-factor widget in{" "}
                <span className="font-mono">Settings → Copilot</span>.
              </p>
            </div>
          ) : (
            <div className="space-y-3 text-sm text-muted leading-relaxed">
              <p>
                When Audric spots a recurring pattern or an opportunity (idle
                balance, claimable rewards, low health factor), you&apos;ll
                see a suggestion card on your dashboard.
              </p>
              <p>
                Nothing happens on-chain until you tap{" "}
                <span className="text-foreground font-medium">Confirm</span>.
                You can snooze, skip, or pause patterns from the same card.
              </p>
              <p className="text-xs text-dim">
                Tweak digests + the health-factor widget in{" "}
                <span className="font-mono">Settings → Copilot</span>.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={onDismiss}
            className="w-full rounded-lg bg-foreground px-4 py-3 font-semibold text-background transition hover:opacity-80"
            autoFocus
          >
            Got it
          </button>
        </div>
      </div>
    </>
  );
}
