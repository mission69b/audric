"use client";

/**
 * Username claim success card — Geist rebuild to `phase2-username-states.html`
 * (AU11). The calm confirmation: a signal-tinted check-circle, the claimed
 * handle in mono, and a "Registered on-chain…" reassurance, then a primary
 * "Continue to Audric" CTA.
 *
 * The legacy serif/dither "YOUR PASSPORT" bands are gone. The real, wired
 * Copy + Share-to-X actions stay (the prototype omits them, but they cover
 * the "tell my friends" intent without the QR weight — the QR remains
 * reachable from the public profile at `audric.ai/${label}`).
 */

import { CheckIcon, CopyIcon, ExternalLinkIcon } from "lucide-react";
import { useCallback, useState } from "react";

const PARENT_SUFFIX = "@audric";
const PUBLIC_PROFILE_BASE = "https://audric.ai";
const COPIED_FEEDBACK_MS = 1500;

export interface UsernameClaimSuccessProps {
  label: string;
  onContinue?: () => void;
  txDigest?: string;
  walletAddress?: string;
}

export function UsernameClaimSuccess({
  label,
  onContinue,
}: UsernameClaimSuccessProps) {
  const fullHandle = `${label}${PARENT_SUFFIX}`;
  const profileUrl = `${PUBLIC_PROFILE_BASE}/${label}`;

  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(fullHandle).catch(() => {
      // clipboard write can fail in insecure contexts; UX is best-effort
    });
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
  }, [fullHandle]);

  const tweetText = `I just claimed my Audric Passport — ${fullHandle} 🪪\n\nPay me on Sui: ${profileUrl}`;
  const shareUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;

  return (
    <div
      className="flex flex-col items-center gap-[18px] rounded-xl border border-border bg-card p-6 text-center"
      data-testid="username-claim-success"
    >
      <span className="inline-flex size-11 items-center justify-center rounded-full bg-signal text-background">
        <CheckIcon aria-hidden="true" size={20} strokeWidth={1.8} />
      </span>

      <div className="flex flex-col gap-2">
        <div
          className="break-all font-medium font-mono text-[22px] text-foreground tracking-[-0.018em]"
          data-testid="username-claim-success-handle"
        >
          {fullHandle}
        </div>
        <p className="m-0 text-[13px] text-muted-foreground leading-[1.5]">
          Registered on-chain. People can now send to your handle.
        </p>
      </div>

      <div className="flex w-full gap-2">
        <button
          aria-label={copied ? "Copied to clipboard" : `Copy ${fullHandle}`}
          aria-live="polite"
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 font-medium text-[13px] text-foreground transition hover:bg-accent focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none"
          data-testid="username-claim-success-copy"
          onClick={handleCopy}
          type="button"
        >
          {copied ? (
            <>
              <CheckIcon aria-hidden="true" className="text-signal" size={13} />
              <span className="text-signal">Copied</span>
            </>
          ) : (
            <>
              <CopyIcon aria-hidden="true" size={13} />
              <span>Copy</span>
            </>
          )}
        </button>

        <a
          aria-label={`Share ${fullHandle} on X`}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 font-medium text-[13px] text-foreground transition hover:bg-accent focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none"
          data-testid="username-claim-success-share-x"
          href={shareUrl}
          rel="noreferrer noopener"
          target="_blank"
        >
          <ExternalLinkIcon aria-hidden="true" size={13} />
          <span>Share to X</span>
        </a>
      </div>

      {onContinue && (
        <button
          className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary px-4 font-medium font-sans text-[14px] text-primary-foreground tracking-[-0.011em] transition hover:opacity-90 focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none"
          data-testid="username-claim-success-continue"
          onClick={onContinue}
          type="button"
        >
          Continue to Audric
        </button>
      )}
    </div>
  );
}
