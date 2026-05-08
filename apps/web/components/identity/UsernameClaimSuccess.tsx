'use client';

import { useCallback, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { SuiPayQr } from '@/components/pay/SuiPayQr';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 10 Phase B.3 — UsernameClaimSuccess
//
// [B6 design pass] Visual rewrite to the `<ClaimedSuccess/>` layout from
// the username-flow handoff bundle (`design_handoff_username_flow/
// claimed-success.jsx`). Layout reference: same handoff README §A2.
//
// Top-down structure:
//   1. Top status strip — `✓ HANDLE CLAIMED` (left, success-fg on
//      success-bg) + (the handoff also shows `STEP 04 / 04` right; we
//      drop the step counter — see S.87).
//   2. Hero band — `success-bg` background, hairline `success-border`
//      bottom rule, dither bar `▓▒░  YOUR PASSPORT  ░▒▓` in mono +
//      success-fg, big serif handle (was mono in the prototype, but we
//      use the serif since it's our "hero name" pattern), and the
//      tagline "Yours on Sui — recognized everywhere."
//   3. Action row — three equal-flex outline buttons: Copy / Show QR /
//      Share to X. All sans 13px, hairline, hover darkens border.
//   4. Optional QR panel — collapsible, real `<SuiPayQr>` with the
//      AudricMark watermark + sui:pay?recipient=… deep-link.
//   5. Full-width primary CTA — "Continue to Audric →" — only when the
//      caller passed `onContinue`.
//
// Composition contract is unchanged from the original B.3 ship.
// ───────────────────────────────────────────────────────────────────────────

// [S.118 follow-up 2026-05-08] Display + clipboard + share-card hero now use
// the SuiNS V2 short-form alias `<label>@audric` (was `<label>.audric.sui`).
// Both forms resolve to the same on-chain leaf record via SuiNS RPC; only
// the user-facing render flips. The on-chain NFT name remains
// `<label>.audric.sui` (unchanged in the API routes / SDK `fullHandle()`).
const PARENT_SUFFIX = '@audric';
const PUBLIC_PROFILE_BASE = 'https://audric.ai';
const COPIED_FEEDBACK_MS = 1500;

export interface UsernameClaimSuccessProps {
  /**
   * Canonical lowercased handle WITHOUT the `@audric` suffix.
   * Component appends the suffix for display + share targets.
   */
  label: string;
  /**
   * Sui address the leaf record points to. When omitted, the QR
   * affordance is hidden — degraded but functional.
   */
  walletAddress?: string;
  /**
   * Optional Sui tx digest from the leaf-mint. Reserved for a future
   * "view on explorer" link; not rendered today.
   */
  txDigest?: string;
  /**
   * Optional CTA handler. When present, renders the full-width
   * "Continue to Audric →" primary at the bottom.
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

  // [S.89] Tweet copy. The URL is load-bearing — X reads OG meta from
  // `audric.ai/<label>` and renders the per-username 1200x630 hero card
  // (see `app/[username]/opengraph-image.tsx`). Keep the URL on its own
  // line so the inline card sits cleanly underneath the body copy.
  const tweetText = `I just claimed my Audric Passport — ${fullHandle} 🪪\n\nPay me on Sui: ${profileUrl}`;
  const shareUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;

  return (
    <div
      data-testid="username-claim-success"
      className="overflow-hidden rounded-lg border border-border-subtle bg-surface-card shadow-[var(--shadow-flat)]"
    >
      {/* Top status strip — `✓ HANDLE CLAIMED` (left), no step counter
          (S.87 — audric signup is single-step). */}
      <div className="flex items-center justify-between border-b border-success-border bg-success-bg px-[18px] py-3">
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.12em] uppercase text-success-fg">
          <Icon name="check" size={11} aria-hidden />
          HANDLE CLAIMED
        </span>
      </div>

      {/* Hero band */}
      <div className="border-b border-success-border bg-success-bg px-8 pt-10 pb-7 text-center">
        <div className="mb-[18px] font-mono text-[11px] tracking-[0.12em] uppercase text-success-fg">
          ▓▒░&nbsp;&nbsp;YOUR PASSPORT&nbsp;&nbsp;░▒▓
        </div>
        <div
          data-testid="username-claim-success-handle"
          className="break-all font-serif text-[30px] leading-[1.15] tracking-[-0.005em] text-fg-primary"
        >
          {fullHandle}
        </div>
        <p className="mt-3 text-[14px] leading-[20px] text-fg-secondary">
          yours on Sui — recognized everywhere
        </p>
      </div>

      {/* Action row */}
      <div className="flex gap-2 px-6 pt-[18px]">
        <ActionButton
          onClick={handleCopy}
          testId="username-claim-success-copy"
          ariaLabel={copied ? 'Copied to clipboard' : `Copy ${fullHandle}`}
          ariaLive="polite"
        >
          {copied ? (
            <>
              <Icon name="check" size={13} aria-hidden className="text-success-solid" />
              <span className="text-success-solid">Copied</span>
            </>
          ) : (
            <>
              <Icon name="copy" size={13} aria-hidden />
              <span>Copy</span>
            </>
          )}
        </ActionButton>

        {walletAddress && (
          <ActionButton
            onClick={handleToggleQr}
            testId="username-claim-success-qr-toggle"
            ariaLabel={showQr ? 'Hide QR code' : 'Show QR code'}
            ariaExpanded={showQr}
            ariaControls="username-claim-success-qr-panel"
            active={showQr}
          >
            <Icon name={showQr ? 'chevron-up' : 'chevron-down'} size={13} aria-hidden />
            <span>{showQr ? 'Hide QR' : 'Show QR'}</span>
          </ActionButton>
        )}

        <a
          href={shareUrl}
          target="_blank"
          rel="noreferrer noopener"
          data-testid="username-claim-success-share-x"
          aria-label={`Share ${fullHandle} on X`}
          className="flex flex-1 items-center justify-center gap-2 rounded-sm border border-border-subtle bg-surface-card px-3 py-2.5 text-[13px] font-medium text-fg-primary transition hover:border-border-strong focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
        >
          <Icon name="external-link" size={13} aria-hidden />
          <span>Share to X</span>
        </a>
      </div>

      {/* QR panel */}
      {showQr && walletAddress && (
        <div className="px-6 pt-5">
          <div
            id="username-claim-success-qr-panel"
            data-testid="username-claim-success-qr-panel"
            className="mx-auto flex w-full max-w-[320px] flex-col items-center gap-3.5 rounded-lg border border-border-subtle bg-surface-card p-5"
          >
            <SuiPayQr recipientAddress={walletAddress} amount={null} size={200} />
            <div className="text-center">
              <div className="font-mono text-[13px] text-fg-primary">{fullHandle}</div>
              <div className="mt-0.5 font-mono text-[11px] text-fg-muted">
                {truncateAddress(walletAddress)}
              </div>
            </div>
            <p className="max-w-[240px] text-center text-[12px] leading-[1.5] text-fg-secondary">
              Scan with any Sui wallet to send {fullHandle} USDC, SUI, or any token.
            </p>
          </div>
        </div>
      )}

      {/* Continue CTA */}
      {onContinue && (
        <div className="px-6 py-6">
          <button
            type="button"
            onClick={onContinue}
            data-testid="username-claim-success-continue"
            className="w-full rounded-sm border border-fg-primary bg-fg-primary px-[18px] py-3 text-[14px] font-medium text-fg-inverse transition hover:opacity-90 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
          >
            Continue to Audric →
          </button>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Subcomponents
// ───────────────────────────────────────────────────────────────────────────

interface ActionButtonProps {
  onClick: () => void;
  testId: string;
  ariaLabel: string;
  ariaLive?: 'polite' | 'off';
  ariaExpanded?: boolean;
  ariaControls?: string;
  active?: boolean;
  children: React.ReactNode;
}

function ActionButton({
  onClick,
  testId,
  ariaLabel,
  ariaLive,
  ariaExpanded,
  ariaControls,
  active,
  children,
}: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      aria-label={ariaLabel}
      aria-live={ariaLive}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      className={`flex flex-1 items-center justify-center gap-2 rounded-sm border px-3 py-2.5 text-[13px] font-medium text-fg-primary transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] ${
        active
          ? 'border-border-strong bg-surface-sunken'
          : 'border-border-subtle bg-surface-card hover:border-border-strong'
      }`}
    >
      {children}
    </button>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
