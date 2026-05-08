'use client';

import type { BundleReceiptTimelineBlock } from '@/lib/engine-types';
import { CardShell, SuiscanLink } from '../cards/primitives';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 7 P2.7 prep / Finding F6 — BundleReceiptBlockView
//
// Single receipt for an atomic Payment Intent. Replaces the pre-fix UX
// where each leg of an N-step compiled intent rendered as its own
// `TransactionReceiptCard` with a duplicate "View on Suiscan" link
// pointing to the SAME on-chain digest. That violated the user's mental
// model — they signed ONE thing, but saw N receipts and N links — and
// made it ambiguous whether they were charged once or N times.
//
// Design choices:
//   - One CardShell wrapper with N inline rows (one per leg). Keeps the
//     "this is a receipt" framing consistent with the single-write
//     `TransactionReceiptCard` while squashing the digest duplication.
//   - Atomicity language ("ALL SUCCEEDED / ALL FAILED") mirrors the
//     pre-execution PermissionCard footer so the receipt feels like the
//     "after" of the same thing the user approved.
//   - Per-leg description comes from `BundleReceiptLeg.description` —
//     identical to what the user saw on the PermissionCard's step row.
//     No re-derivation, no risk of drift.
//   - Reverted intent (`block.isError === true`) flips the title to
//     "PAYMENT INTENT REVERTED", drops the Suiscan link (no on-chain
//     state to view), and marks every leg with ✗.
//   - [S.122] Session-expired (`block.sessionExpired === true`) flips the
//     title to "SESSION EXPIRED · NOT SUBMITTED" — distinct from
//     "PAYMENT INTENT REVERTED" because Enoki refused to sponsor before
//     anything reached chain. Calling that path "Payment Intent
//     reverted atomically" misleads the user into thinking we sent a
//     tx that failed; the truthful framing is "your sign-in expired,
//     nothing was submitted, please sign back in."
// ───────────────────────────────────────────────────────────────────────────

interface BundleReceiptBlockViewProps {
  block: BundleReceiptTimelineBlock;
  /**
   * [S.123 v0.55.x] Wired to `useZkLogin.refresh` (logout + login) when the
   * block is in the `sessionExpired === true` state. Renders an inline
   * "Sign back in" button so the user can recover with one tap instead of
   * being told to "logout and sign back in via the avatar menu" (which
   * doesn't actually work today — see Teo's report in S.123).
   *
   * Optional: when omitted (e.g. testing, demo paths), the button is
   * hidden but the rest of the session-expired UI still renders.
   */
  onSignBackIn?: () => void;
}

export function BundleReceiptBlockView({ block, onSignBackIn }: BundleReceiptBlockViewProps) {
  const opsLabel = `${block.legs.length} ${block.legs.length === 1 ? 'op' : 'ops'}`;
  const isSessionExpired = block.sessionExpired === true;
  const titleVerb = isSessionExpired
    ? 'SESSION EXPIRED'
    : block.isError
      ? 'PAYMENT INTENT REVERTED'
      : 'PAYMENT INTENT';
  const titleStatus = isSessionExpired
    ? `${opsLabel} · NOT SUBMITTED`
    : block.isError
      ? `${opsLabel} · ATOMICALLY FAILED`
      : `1 ATOMIC TX · ${opsLabel}`;
  const footerStatus = isSessionExpired
    ? 'NOT SUBMITTED'
    : block.isError
      ? 'ALL FAILED'
      : 'ALL SUCCEEDED';
  const footnoteText = isSessionExpired
    ? 'NEVER REACHED CHAIN — SIGN BACK IN TO RESEND'
    : 'NO ON-CHAIN STATE — INTENT REVERTED ATOMICALLY';

  return (
    <CardShell
      title={titleVerb}
      badge={
        <span
          className={`text-[10px] font-mono uppercase tracking-[0.08em] ${
            block.isError ? 'text-error-solid' : 'text-success-solid'
          }`}
          aria-label={
            isSessionExpired
              ? 'Sign-in session expired before submission'
              : block.isError
                ? 'All legs reverted atomically'
                : 'All legs settled in one atomic transaction'
          }
        >
          {block.isError ? '✗' : '✓'} {titleStatus}
        </span>
      }
    >
      <ol className="space-y-1.5" aria-label={`${block.legs.length} bundled operations`}>
        {block.legs.map((leg, i) => (
          <li
            key={leg.toolUseId}
            className="flex items-baseline gap-2 text-xs leading-tight"
          >
            <span
              className="font-mono text-[10px] tabular-nums text-fg-tertiary"
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <span
              className={`font-mono text-[10px] ${
                leg.isError ? 'text-error-solid' : 'text-success-solid'
              }`}
              aria-label={leg.isError ? 'failed' : 'succeeded'}
            >
              {leg.isError ? '✗' : '✓'}
            </span>
            <span className="flex-1 text-fg-primary">{leg.description}</span>
          </li>
        ))}
      </ol>

      {block.txDigest ? (
        <SuiscanLink digest={block.txDigest} />
      ) : (
        <div className="pt-1.5 mt-1.5 border-t border-border-subtle font-mono text-[10px] text-fg-muted text-center">
          {footnoteText}
        </div>
      )}

      {/* [S.123 v0.55.x] Inline "Sign back in" recovery button.
          Pre-S.123, the only recovery path on a session-expired bundle was
          for the LLM to tell the user to "logout and sign back in via the
          avatar menu" — which didn't work because the chat-side "logout"
          command was hallucinated and didn't clear the zkLogin session
          (Teo / Mysten Labs bug, S.123). The button below short-circuits
          that whole loop: one tap → useZkLogin.refresh() → fresh JWT →
          user can resend the bundle. */}
      {isSessionExpired && onSignBackIn ? (
        <button
          type="button"
          onClick={onSignBackIn}
          className="mt-2 w-full rounded-md border border-border-strong bg-bg-secondary px-3 py-2 font-mono text-xs uppercase tracking-wide text-fg-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus:ring-2 focus:ring-accent-solid"
          aria-label="Sign back in to refresh your session and resend"
        >
          ↻ Sign back in
        </button>
      ) : null}

      <div className="pt-1.5 mt-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-wide text-fg-muted">
        <span>GAS · SPONSORED</span>
        <span>{footerStatus}</span>
      </div>
    </CardShell>
  );
}
