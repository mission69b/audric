'use client';

import { useCallback, useState } from 'react';
import { UsernamePicker } from './UsernamePicker';
import { UsernameClaimSuccess } from './UsernameClaimSuccess';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 10 Phase B-wiring — UsernameClaimGate
//
// [B5 polish] Visual chrome aligned to the Audric Design System
// (`.cursor/rules/design-system.mdc`). The gate's only direct UI is
// the inline error surface above the picker; styling mirrors the
// canonical error treatment used elsewhere in the chrome — sunken
// error-bg + error-border + body-xs copy on the same vertical
// rhythm as the picker body. Closest prototype for that pattern is
// the inline alert language inside
// `design_handoff_audric/design_files/audric-app-light/settings.jsx`.
//
// The composition glue between B.1 (`<UsernamePicker>`), B.2 (the
// `/api/identity/reserve` route), and B.3 (`<UsernameClaimSuccess>`).
// Hosts a 3-state machine:
//
//      picking  ──submit──▶  claiming  ──200──▶  success
//          ▲                     │
//          │                     ▼
//          └────────  4xx/5xx ───┘   (re-renders picker with inline error)
//
// Composition contract:
//
//   The gate is a pure UI primitive — it doesn't decide WHEN to render
//   itself (the dashboard does that based on `userStatus.username` +
//   the localStorage skip flag) or WHAT TO DO AFTER (the parent's
//   `onClaimed` / `onSkipped` callbacks own the next-step transition).
//
//   The parent (signup-page wiring in `dashboard-content.tsx`) is
//   responsible for:
//     • Gating render on `!userStatus.username && !skipFlag`
//     • Wiring `address` + `jwt` from the auth source
//     • Wiring `googleName` + `googleEmail` from the JWT for picker
//       pre-fill (per SPEC 10 D2 — smart pre-fill is required for the
//       <5s happy-path acceptance gate, line 547 of SPEC_10)
//     • Handling `onClaimed(label, fullHandle)` → refetch userStatus
//       so the gate hides on next render (and any future surfaces that
//       depend on the username, e.g. Settings / engine context)
//     • Handling `onSkipped()` → set the localStorage flag + force a
//       local-state re-render so the gate hides
//
// Why a separate gate vs. inlining the state machine in the dashboard:
//
//   `dashboard-content.tsx` is already 1700+ LOC. The 3-state machine
//   here (picking / claiming / success) plus the reserve-route fetch
//   semantics (typed errors, race-409 handling, 503 verifier-down
//   surfacing) is ~80 LOC of state logic that has no business living
//   in the chat-dashboard mega-component. Lifting it into a gate also
//   makes the same machine reusable from the future settings page (D9)
//   without copy-paste.
//
// Error semantics (the LLM-narrated typed errors):
//
//   The reserve route returns typed reasons in 400/409 bodies
//   (`'invalid' | 'too-short' | 'too-long' | 'reserved' | 'taken'`).
//   The gate surfaces these inline below the picker on transition
//   back to `picking`. The user can retry without a page refresh.
//
//   503 means the SuiNS verifier is degraded (RPC down or custody key
//   missing). We render a retry hint instead of a hard failure — the
//   user's claim attempt is preserved in the picker input.
//
//   Network failures (no response at all) surface generically — same
//   retry-by-pressing-claim affordance, no confusing typed reason.
// ───────────────────────────────────────────────────────────────────────────

// [S.118 follow-up 2026-05-08] Display switched to the `@audric` short-form
// alias for inline error narration ("alice@audric is reserved"). The
// on-chain NFT name (returned in `body.fullHandle` by the API mint route
// and forwarded via `onClaimed`) is still `<label>.audric.sui` — both
// forms resolve to the same address via SuiNS RPC. Only the user-facing
// inline-error copy flips here.
const PARENT_SUFFIX = '@audric';

type Phase = 'picking' | 'claiming' | 'success';

type ReserveReason = 'invalid' | 'too-short' | 'too-long' | 'reserved' | 'taken';

interface ReserveSuccessBody {
  success: true;
  label: string;
  fullHandle: string;
  txDigest: string;
  walletAddress: string;
}

interface ReserveErrorBody {
  error: string;
  reason?: ReserveReason;
}

export interface UsernameClaimGateProps {
  /** Caller's Sui address — resolved from useZkLogin. */
  address: string;
  /** zkLogin JWT — passed as `x-zklogin-jwt` header to /api/identity/reserve. */
  jwt: string;
  /** Google `name` claim — used for picker smart pre-fill. */
  googleName?: string | null;
  /** Google `email` claim — used for picker smart pre-fill. */
  googleEmail?: string | null;
  /**
   * Called after the user dismisses the success state (Continue button).
   * Parent should refetch user status so the gate hides on next render.
   * `label` is bare (`'alice'`); `fullHandle` is the brand-suffixed form.
   */
  onClaimed: (label: string, fullHandle: string) => void;
  /**
   * Called when the user clicks "Skip for now" in the picker. Parent
   * should set the localStorage skip flag + force a re-render so the
   * gate hides. Settings page (D9) is the safety valve for re-claim.
   *
   * Optional. When omitted, the picker renders without a Skip button —
   * intended for re-claim surfaces (e.g. Settings → Passport's safety-
   * valve modal in S.84 polish v4) where "skip" makes no sense (the
   * user has already navigated past the original skip moment to get
   * here, and they can dismiss with the modal's Cancel/✕ instead).
   */
  onSkipped?: () => void;
  /**
   * Optional fetcher injection — for tests. Defaults to the global
   * `fetch` against /api/identity/reserve.
   */
  reserveFetcher?: (label: string) => Promise<ReserveSuccessBody>;
}

/**
 * Thrown by the default reserve fetcher on non-2xx responses. The gate
 * catches it and renders the typed reason inline below the picker.
 */
export class ReserveError extends Error {
  constructor(
    public readonly status: number,
    public readonly reason: ReserveReason | 'verifier-down' | 'rate-limit' | 'unknown',
    message: string,
  ) {
    super(message);
    this.name = 'ReserveError';
  }
}

export function UsernameClaimGate({
  address,
  jwt,
  googleName,
  googleEmail,
  onClaimed,
  onSkipped,
  reserveFetcher,
}: UsernameClaimGateProps) {
  const [phase, setPhase] = useState<Phase>('picking');
  const [claimedLabel, setClaimedLabel] = useState<string | null>(null);
  const [claimedFullHandle, setClaimedFullHandle] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Default fetcher closes over `address` + `jwt` so the picker doesn't
  // need to know about either. Test injection via `reserveFetcher` prop
  // skips the closure entirely — see the test file for the seam.
  const defaultFetcher = useCallback(
    async (label: string): Promise<ReserveSuccessBody> => {
      const res = await fetch('/api/identity/reserve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-zklogin-jwt': jwt,
        },
        body: JSON.stringify({ label, address }),
      });
      if (!res.ok) {
        const body: ReserveErrorBody = await res
          .json()
          .catch(() => ({ error: 'Unknown error' }));
        const reason: ReserveError['reason'] =
          res.status === 503
            ? 'verifier-down'
            : res.status === 429
              ? 'rate-limit'
              : (body.reason ?? 'unknown');
        throw new ReserveError(res.status, reason, body.error);
      }
      return (await res.json()) as ReserveSuccessBody;
    },
    [address, jwt],
  );

  const fetcher = reserveFetcher ?? defaultFetcher;

  const handleSubmit = useCallback(
    async (label: string) => {
      setPhase('claiming');
      setErrorMessage(null);
      try {
        const body = await fetcher(label);
        setClaimedLabel(body.label);
        setClaimedFullHandle(body.fullHandle);
        setPhase('success');
      } catch (err) {
        // Map typed reasons to user-visible copy. The picker's free-text
        // input still has the attempted label, so the user can edit-and-
        // retry without re-typing — but we render an explicit error line
        // above the picker so the failure mode is clear.
        const message =
          err instanceof ReserveError
            ? reasonToCopy(err.reason, label)
            : 'Network error — please try again.';
        setErrorMessage(message);
        setPhase('picking');
      }
    },
    [fetcher],
  );

  const handleContinue = useCallback(() => {
    if (claimedLabel && claimedFullHandle) {
      onClaimed(claimedLabel, claimedFullHandle);
    }
  }, [claimedLabel, claimedFullHandle, onClaimed]);

  if (phase === 'success' && claimedLabel) {
    return (
      <div data-testid="username-claim-gate" data-phase="success">
        <UsernameClaimSuccess
          label={claimedLabel}
          walletAddress={address}
          onContinue={handleContinue}
        />
      </div>
    );
  }

  return (
    <div
      data-testid="username-claim-gate"
      data-phase={phase}
      className="space-y-3"
    >
      {errorMessage && (
        <div
          data-testid="username-claim-gate-error"
          role="alert"
          className="rounded-sm border border-error-border bg-error-bg px-3 py-2 text-[12px] leading-[1.5] text-error-fg"
        >
          {errorMessage}
        </div>
      )}
      <UsernamePicker
        googleName={googleName}
        googleEmail={googleEmail}
        onSubmit={handleSubmit}
        onSkip={onSkipped}
        disabled={phase === 'claiming'}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

/**
 * Maps a reserve-route typed reason to user-visible error copy. Mirrors
 * the picker's status-line copy where overlapping (taken / reserved /
 * too-short / too-long) so the user gets consistent language.
 *
 * Note: `verifier-down` (503) and `rate-limit` (429) are the post-mint
 * failure modes that the picker's pre-check can't catch — those need
 * gate-level copy because the picker doesn't render an error for them
 * outside the per-keystroke debounced check.
 */
function reasonToCopy(
  reason: ReserveError['reason'],
  label: string,
): string {
  const fullHandle = `${label}${PARENT_SUFFIX}`;
  switch (reason) {
    case 'taken':
      return `Someone else just claimed ${fullHandle} — try a different name.`;
    case 'reserved':
      return `${fullHandle} is reserved — try a different name.`;
    case 'invalid':
      return `${fullHandle} contains invalid characters — letters, numbers, and hyphens only.`;
    case 'too-short':
      return 'Handles need at least 3 characters.';
    case 'too-long':
      return 'Handles can be at most 20 characters.';
    case 'verifier-down':
      return "Couldn't verify the name on Sui right now — please try again in a moment.";
    case 'rate-limit':
      return 'Too many attempts — please wait a moment before trying again.';
    case 'unknown':
    default:
      return 'Could not claim the handle — please try again.';
  }
}
