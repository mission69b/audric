"use client";

/**
 * Username claim modal (safety-valve) — port from `apps/web/components/
 * identity/UsernameClaimModal.tsx`.
 *
 * Diffs from legacy:
 *   - Icon `close` → XIcon from lucide-react
 *   - `clearUsernameSkip` cross-app-imported from
 *     `apps/web/lib/identity/username-skip` so the localStorage skip
 *     flag is shared between v2-settings and legacy-dashboard surfaces.
 *
 * Mounted from the Passport section when the user has no claimed
 * handle (rare in production — the signup gate handles first-time
 * claim — but defensive for users who skipped via the "Skip for now"
 * affordance).
 */

import { XIcon } from "lucide-react";
import { useEffect } from "react";
import { clearUsernameSkip } from "@/lib/identity/username-skip";
import { UsernameClaimGate } from "./username-claim-gate";

export interface UsernameClaimModalProps {
  address: string;
  googleEmail?: string | null;
  googleName?: string | null;
  jwt: string;
  onClaimed: (label: string, fullHandle: string) => void;
  onClose: () => void;
  open: boolean;
}

export function UsernameClaimModal({
  open,
  address,
  jwt,
  googleName,
  googleEmail,
  onClaimed,
  onClose,
}: UsernameClaimModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: dialog scrim — Escape handled via global keydown listener in useEffect above
    // biome-ignore lint/a11y/useKeyWithClickEvents: scrim click is a click-out-to-close pattern; keyboard equivalent is Escape (handled in useEffect)
    <div
      aria-labelledby="claim-handle-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[rgba(0,0,0,0.42)] px-4 py-8"
      data-testid="username-claim-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
    >
      <div className="relative w-full max-w-[540px]">
        <h2 className="sr-only" id="claim-handle-title">
          Pick your handle
        </h2>

        <button
          aria-label="Close"
          className="absolute top-5 right-5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-sm text-fg-muted transition hover:bg-surface-sunken hover:text-fg-primary focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none"
          onClick={onClose}
          type="button"
        >
          <XIcon size={14} />
        </button>

        <UsernameClaimGate
          address={address}
          googleEmail={googleEmail}
          googleName={googleName}
          jwt={jwt}
          onClaimed={(label, fullHandle) => {
            clearUsernameSkip(address);
            onClaimed(label, fullHandle);
          }}
        />
      </div>
    </div>
  );
}
