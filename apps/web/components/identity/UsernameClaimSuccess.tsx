'use client';

import { useCallback, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { SuiPayQr } from '@/components/pay/SuiPayQr';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 10 Phase B.3 — UsernameClaimSuccess
//
// [B5 polish] Visual chrome aligned to the Audric Design System
// (see `.cursor/rules/design-system.mdc`). Closest prototype analogues:
//   • `design_handoff_audric/design_files/audric-app-light/primitives.jsx`
//     — `BalanceHeader` is the canonical "hero name in serif" pattern
//     (`font-serif`, large size, tight tracking) reused here for the
//     newly-claimed handle. Action buttons mirror the prototype's
//     mono-uppercase outline-pill language.
//   • `design_handoff_audric/design_files/audric-app-light/settings.jsx`
//     — Sunken-card chrome wrapper (`bg-surface-sunken` + `rounded-md`
//     + mono eyebrow language) replaces the previous full success-bg
//     container. Success-bg moves to a small badge-strip across the
//     top so the moment still reads as celebratory without consuming
//     the whole frame in green.
//
// Celebration + share surface rendered AFTER `<UsernamePicker>` submits and
// `/api/identity/reserve` returns 200. Pure UI primitive — knows nothing
// about JWTs, engine sessions, or how the caller transitions in/out.
// Composition contract mirrors the picker (B.1):
//
//   The caller (signup page, chat-timeline pending_input renderer, settings/
//   contacts CRUD page) is responsible for:
//     • Calling /api/identity/reserve with the picker's submitted label
//     • Switching from <UsernamePicker /> to <UsernameClaimSuccess /> on 200
//     • Wiring the claimed `label` + optional `walletAddress` + `txDigest`
//       from the reserve response into this component's props
//     • Optionally handling `onContinue` (caller-defined "next step" — likely
//       a redirect to /chat for the signup flow, a modal close for settings)
//
// Three share surfaces, all per SPEC 10 v0.2.1 B.3:
//
//   1. Copy — writes the full handle (`alice.audric.sui`) to clipboard.
//      Per D10, NEVER copies just `alice` (independent namespace from
//      `alice.sui`); never copies the bare 0x (different sharing intent —
//      bare 0x is for "send me USDC", the handle is for "this is me").
//
//   2. Show on QR — toggle that expands an inline QR. Uses <SuiPayQr> in
//      open-receive mode (amount=null) for visual + payload consistency
//      with the rest of audric's receive flow (FeedRenderer 'receipt'
//      cards, PayClient's invoice QR — all share the same SuiPayQr
//      wrapper with AudricMark center logo + sui:pay?recipient=…&coinType=…
//      deep-link payload). Phone-camera scans open Slush/Phantom/Suiet
//      directly with the address pre-filled. The full handle is rendered
//      above the QR as the human-readable label so a person scanning still
//      knows whose address it is. If `walletAddress` isn't provided (e.g.
//      caller doesn't have it from the reserve response — currently they
//      DO, but defensive), the QR section is hidden entirely rather than
//      faking a QR with the handle.
//
//   3. Share to X — opens X (Twitter) compose intent in a new tab,
//      pre-filled with the spec-locked tweet template:
//        "I just claimed alice.audric.sui — find me at audric.ai/alice 🪪"
//      The URL is plain text so X auto-link-detects it for previews.
//
// Per the spec acceptance gates (lines 547–552), the success path needs
// to feel like the moment of celebration, not a mechanical receipt — so
// the visual hierarchy is: emoji headline > full handle > tagline > share
// row > optional Continue.
// ───────────────────────────────────────────────────────────────────────────

const PARENT_SUFFIX = '.audric.sui';
// Public URL used in the share tweet text. Hardcoded to prod because the
// tweet body is a sharable artifact — a preview deploy URL or localhost
// link would be useless to anyone who clicks the resulting tweet. Kept
// as a `const` (not env-var) because the canonical sharable surface IS
// audric.ai regardless of where the user typed the share button.
const PUBLIC_PROFILE_BASE = 'https://audric.ai';
const COPIED_FEEDBACK_MS = 1500;

export interface UsernameClaimSuccessProps {
  /**
   * Canonical lowercased handle WITHOUT the `.audric.sui` suffix
   * (e.g. `'alice'`). The component renders the full handle by
   * appending the suffix — keeps the prop shape consistent with the
   * picker's `onSubmit(label)` callback (label IS the bare slug).
   */
  label: string;
  /**
   * Sui address that the leaf record points to (the user's wallet).
   * Used as the QR payload per D8 (cross-wallet compat). When omitted,
   * the "Show on QR" affordance is hidden — degraded but functional.
   */
  walletAddress?: string;
  /**
   * Optional Sui tx digest from the leaf-mint. Reserved for a future
   * "view on explorer" link; not rendered today (would be scope creep
   * beyond the B.3 spec). Accepted in the props now so callers don't
   * have to plumb it through twice.
   */
  txDigest?: string;
  /**
   * Optional CTA handler. When present, renders a "Continue to Audric"
   * button below the share row. Caller decides what "continue" means —
   * for the signup flow it's `router.push('/chat')`; for the settings
   * picker it's `onClose()`.
   */
  onContinue?: () => void;
}

export function UsernameClaimSuccess({
  label,
  walletAddress,
  txDigest: _txDigest,
  onContinue,
}: UsernameClaimSuccessProps) {
  const fullHandle = `${label}${PARENT_SUFFIX}`;
  const profileUrl = `${PUBLIC_PROFILE_BASE}/${label}`;

  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(fullHandle);
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
  }, [fullHandle]);

  const handleToggleQr = useCallback(() => {
    setShowQr((prev) => !prev);
  }, []);

  const tweetText = `I just claimed ${fullHandle} — find me at ${profileUrl} 🪪`;
  const shareUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;

  return (
    <div
      data-testid="username-claim-success"
      className="space-y-5 rounded-md border border-border-subtle bg-surface-sunken p-5"
    >
      {/*
        Celebration strip — small horizontal badge that reads as a "yes,
        this happened" cue without consuming the whole card in green.
        Uses success-bg for the cue + mono uppercase for the language;
        same posture as the green Tag pattern in primitives.jsx.
      */}
      <div className="flex justify-center">
        <span className="inline-flex items-center gap-1.5 rounded-xs border border-success-border bg-success-bg px-2 py-1 font-mono text-[10px] tracking-[0.1em] uppercase text-success-fg">
          <Icon name="check" size={10} aria-hidden />
          Claimed
        </span>
      </div>

      <div className="space-y-2 text-center">
        <div className="text-2xl" aria-hidden="true">
          🪪
        </div>
        <div
          data-testid="username-claim-success-handle"
          className="break-all font-serif text-[28px] leading-[1.15] tracking-[-0.01em] text-fg-primary"
        >
          {fullHandle}
        </div>
        <p className="text-[12px] leading-[1.5] text-fg-secondary">
          yours on Sui — recognized everywhere
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={handleCopy}
          data-testid="username-claim-success-copy"
          aria-label={copied ? 'Copied to clipboard' : `Copy ${fullHandle}`}
          aria-live="polite"
          className="inline-flex items-center gap-1.5 rounded-xs border border-border-subtle bg-surface-card px-3 py-1.5 font-mono text-[10px] tracking-[0.1em] uppercase text-fg-primary transition hover:border-border-strong focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
        >
          {copied ? (
            <>
              <Icon name="check" size={10} aria-hidden className="text-success-solid" />
              <span className="text-success-solid">Copied</span>
            </>
          ) : (
            <>
              <Icon name="copy" size={10} aria-hidden />
              <span>Copy</span>
            </>
          )}
        </button>

        {walletAddress && (
          <button
            type="button"
            onClick={handleToggleQr}
            data-testid="username-claim-success-qr-toggle"
            aria-expanded={showQr}
            aria-controls="username-claim-success-qr-panel"
            className="inline-flex items-center gap-1.5 rounded-xs border border-border-subtle bg-surface-card px-3 py-1.5 font-mono text-[10px] tracking-[0.1em] uppercase text-fg-primary transition hover:border-border-strong focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
          >
            <Icon name={showQr ? 'chevron-up' : 'chevron-down'} size={10} aria-hidden />
            <span>{showQr ? 'Hide QR' : 'Show QR'}</span>
          </button>
        )}

        <a
          href={shareUrl}
          target="_blank"
          rel="noreferrer noopener"
          data-testid="username-claim-success-share-x"
          aria-label={`Share ${fullHandle} on X`}
          className="inline-flex items-center gap-1.5 rounded-xs border border-border-subtle bg-surface-card px-3 py-1.5 font-mono text-[10px] tracking-[0.1em] uppercase text-fg-primary transition hover:border-border-strong focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
        >
          <Icon name="external-link" size={10} aria-hidden />
          <span>Share to X</span>
        </a>
      </div>

      {showQr && walletAddress && (
        <div
          id="username-claim-success-qr-panel"
          data-testid="username-claim-success-qr-panel"
          className="flex flex-col items-center gap-2 rounded-sm border border-border-subtle bg-surface-card p-3"
        >
          <SuiPayQr recipientAddress={walletAddress} amount={null} size={180} />
          <div className="text-center">
            <div className="font-mono text-[12px] text-fg-primary">{fullHandle}</div>
            <div className="font-mono text-[10px] text-fg-secondary">
              {truncateAddress(walletAddress)}
            </div>
          </div>
          <p className="max-w-[220px] text-center text-[11px] leading-[1.5] text-fg-secondary">
            Scan with any Sui wallet to send {fullHandle} USDC, SUI, or any token
          </p>
        </div>
      )}

      {onContinue && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={onContinue}
            data-testid="username-claim-success-continue"
            className="inline-flex items-center justify-center rounded-sm border border-fg-primary bg-fg-primary px-3 py-2 font-mono text-[10px] tracking-[0.1em] uppercase text-fg-inverse transition hover:opacity-90 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
          >
            Continue to Audric
          </button>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
