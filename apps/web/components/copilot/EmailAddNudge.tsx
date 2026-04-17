"use client";

import { useState } from "react";
import { EmailCaptureModal } from "@/components/auth/EmailCaptureModal";

interface EmailAddNudgeProps {
  address: string;
  jwt: string;
  confirmedCount: number;
  onDismiss: () => void;
}

/**
 * Wave C.7 — inline banner asking the user to add an email so we can
 * deliver the daily Copilot digest. Surfaces only after the user has
 * confirmed `threshold` (10) Copilot suggestions — a "you clearly use
 * this, want a daily summary?" moment with no random pop-up.
 *
 * Reuses the existing `EmailCaptureModal` for the actual capture +
 * verification flow so we don't fork the email-input UX.
 *
 * Dismiss is sticky (server-side stamp via `copilotEmailNudgeShownAt`).
 */
export function EmailAddNudge({
  address,
  jwt,
  confirmedCount,
  onDismiss,
}: EmailAddNudgeProps) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <div className="rounded-lg border border-accent/20 bg-accent/5 px-4 py-3 flex items-start gap-3">
        <div className="flex-1 space-y-1">
          <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-accent">
            Audric noticed
          </p>
          <p className="text-sm font-medium text-foreground">
            You&apos;ve confirmed {confirmedCount} suggestions — get a daily
            digest by email.
          </p>
          <p className="text-xs text-muted">
            One short email a day with what Audric spotted overnight. Skip
            the dashboard until you have an action to take.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="px-3 py-1.5 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90 transition"
          >
            Add email
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="text-[10px] uppercase tracking-[0.08em] text-dim hover:text-foreground transition"
          >
            Not now
          </button>
        </div>
      </div>
      <EmailCaptureModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          // Once the modal closes (regardless of verified or skipped) we
          // consider the nudge "addressed" — the user saw the capture flow.
          // If they verified, the next /api/user/copilot-onboarding tick
          // will hide the banner anyway via the email-verified branch.
          onDismiss();
        }}
        address={address}
        jwt={jwt}
      />
    </>
  );
}
