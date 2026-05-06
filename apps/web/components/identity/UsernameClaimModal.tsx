'use client';

import { useEffect } from 'react';
import { Icon } from '@/components/ui/Icon';
import { UsernameClaimGate } from './UsernameClaimGate';
import { clearUsernameSkip } from '@/lib/identity/username-skip';

// ───────────────────────────────────────────────────────────────────────────
// S.84 polish v4 — UsernameClaimModal
//
// [B6 design pass] Visual chrome simplified to match the username-flow
// handoff. The V2 picker now ships with its own mono `// PASSPORT /
// HANDLE` header strip and serif "Pick your handle" hero, so the modal
// no longer needs its own title eyebrow — that would just stack two
// headers and dilute the picker's chrome. Instead, the modal:
//   • Renders the gate (which renders the picker) at full width inside
//     a 540px frame matching the picker's design width.
//   • Overlays a close button absolutely in the top-right corner of the
//     frame so it visually sits in the picker's empty header-strip space.
//   • Uses a tighter scrim per the handoff design — `rgba(0,0,0,0.42)`
//     instead of black/50 — to match `<ChangeHandleModal>`.
//
// Composition contract is unchanged from the prior S.84 ship.
//
// Why no Skip button in this surface:
//   The dashboard gate has a Skip button because the first-claim moment
//   is OPTIONAL — the user can skip and use Audric without a handle.
//   This surface only exists AFTER the user has already navigated to
//   Settings to claim — they're past the skip threshold. Cancel/✕ is
//   the right dismissal (closes the modal, leaves the existing skip
//   flag intact). Hence we pass `onSkipped={undefined}` to the gate,
//   which makes the picker omit the Skip button entirely.
//
// Skip-flag side-effect on success:
//   When the claim succeeds we clear the per-address skip flag. Strictly
//   speaking the dashboard gate would already hide once `userStatus.username`
//   is set, but leaving the flag in localStorage is residual state that
//   becomes confusing if the user later releases the handle (via
//   change-flow's revoke half) — they'd land on the dashboard with
//   `!username && skipFlag === '1'` and silently never see the gate
//   again. Clearing on every successful re-claim from Settings keeps
//   the storage in sync with the actual claim state.
// ───────────────────────────────────────────────────────────────────────────

export interface UsernameClaimModalProps {
  open: boolean;
  address: string;
  jwt: string;
  googleName?: string | null;
  googleEmail?: string | null;
  onClaimed: (label: string, fullHandle: string) => void;
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.42)] px-4 py-8 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-[540px]">
        {/* Hidden accessible title — the picker's serif "Pick your handle"
            heading carries the visual title role, but a programmatic
            label keeps screen readers oriented when the modal opens. */}
        <h2 id="claim-handle-title" className="sr-only">
          Pick your handle
        </h2>

        {/* Close button — absolutely positioned in the top-right of the
            picker's header strip area (`// PASSPORT / HANDLE` left,
            this button right). top/right offsets match the picker's
            inner padding (pt-6 + px-7) so the X visually sits at the
            same vertical center as the mono header text. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-5 top-5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-sm text-fg-muted transition hover:bg-surface-sunken hover:text-fg-primary focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
        >
          <Icon name="close" size={14} />
        </button>

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
