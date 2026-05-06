'use client';

import { useEffect } from 'react';
import { UsernameClaimGate } from './UsernameClaimGate';
import { clearUsernameSkip } from '@/lib/identity/username-skip';

// ───────────────────────────────────────────────────────────────────────────
// S.84 polish v4 — UsernameClaimModal
//
// The Settings → Passport safety valve. Wraps `<UsernameClaimGate>` in
// a modal frame so a user who clicked "Skip for now" on the dashboard
// picker can still claim a handle later. Mirrors `<UsernameChangeModal>`'s
// portal/escape/click-outside semantics so the two identity-modify
// modals feel like the same pattern (the only structural difference:
// no current-handle pill, no warning callout — those are change-flow
// concerns, not claim-flow concerns).
//
// Why a modal vs. inlining the gate inside the empty-state Identity
// card:
//   • The gate's UI is heavy (suggestions row, smart-pre-filled chips,
//     status line, input + submit). Inlining it would dominate the
//     500–600px Settings layout and bury the surrounding Account /
//     Appearance cards. A modal preserves the section's information
//     hierarchy.
//   • Claiming is an explicit action, not a passive display. Treating
//     it like the change-handle action (modal) matches the user's
//     mental model.
//
// Why no Skip button in this surface:
//   The dashboard gate has a Skip button because the first-claim moment
//   is OPTIONAL — the user can skip and use Audric without a handle.
//   This surface only exists AFTER the user has already navigated to
//   Settings to claim — they're past the skip threshold. Cancel/✕ is
//   the right dismissal (closes the modal, leaves the existing skip
//   flag intact). Hence we pass `onSkipped={undefined}` to the gate,
//   which makes the picker omit the Skip button entirely (per the
//   gate's optional-onSkipped contract).
//
// Skip-flag side-effect on success:
//   When the claim succeeds we clear the per-address skip flag. Strictly
//   speaking the dashboard gate would already hide once `userStatus.username`
//   is set (the gate's render condition is `!username && !skipFlag`, so
//   either condition false hides it). But leaving the flag in localStorage
//   is residual state that becomes confusing if the user later releases
//   the handle (via change-flow's revoke half) — they'd land on the
//   dashboard with `!username && skipFlag === '1'` and silently never
//   see the gate again. Clearing it on every successful re-claim from
//   Settings keeps the storage in sync with the actual claim state.
// ───────────────────────────────────────────────────────────────────────────

export interface UsernameClaimModalProps {
  open: boolean;
  /** Caller's Sui address — used by the gate's reserve fetcher + skip clear. */
  address: string;
  /** zkLogin JWT — passed through to the gate's reserve fetcher. */
  jwt: string;
  /** Google `name` claim — used for picker smart pre-fill. */
  googleName?: string | null;
  /** Google `email` claim — used for picker smart pre-fill. */
  googleEmail?: string | null;
  /**
   * Called after the user clicks Continue on the gate's success card.
   * Parent should refetch `userStatus` so the rest of the app picks up
   * the new handle (Identity card, sidebar footer, greeting, system
   * prompt). Parent is also responsible for closing the modal here.
   */
  onClaimed: (label: string, fullHandle: string) => void;
  /** Called when the user dismisses without claiming (Cancel / ✕ / Escape / outside). */
  onClose: () => void;
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
  // Escape closes the modal. The gate has its own claiming-in-flight
  // state, but the Settings re-claim flow is short enough (<1s typical)
  // that we don't bother gating Escape on phase like the change modal
  // does — worst case the user has to re-click Claim, and the API is
  // idempotent against the `taken` reason on the second attempt.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="claim-handle-title"
      data-testid="username-claim-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[440px] rounded-md border border-border-strong bg-surface-page p-5 shadow-lg">
        <div className="flex items-start justify-between mb-4">
          <h2
            id="claim-handle-title"
            className="font-mono text-[10px] tracking-[0.12em] uppercase text-fg-muted"
          >
            Pick your handle
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 -mr-1 inline-flex h-6 w-6 items-center justify-center rounded-sm text-fg-muted hover:bg-surface-sunken hover:text-fg-primary"
          >
            ✕
          </button>
        </div>

        <UsernameClaimGate
          address={address}
          jwt={jwt}
          googleName={googleName}
          googleEmail={googleEmail}
          onClaimed={(label, fullHandle) => {
            clearUsernameSkip(address);
            onClaimed(label, fullHandle);
          }}
        />
      </div>
    </div>
  );
}
