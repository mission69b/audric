"use client";

/**
 * Username claim success card — port from `apps/web/components/identity/
 * UsernameClaimSuccess.tsx`.
 *
 * Diffs from legacy:
 *   - Icon swaps: check → CheckIcon, copy → CopyIcon, external-link →
 *     ExternalLinkIcon. The chevron-up/down toggle and the entire QR
 *     panel are REMOVED — `SuiPayQr` (and its deps `QrCode`, `AudricMark`,
 *     `sui-pay-uri`) would require porting another ~500 LoC of UI just
 *     for the settings safety-valve flow. The QR is reachable from the
 *     user's public profile page (`audric.ai/${label}`) which the Share
 *     to X link references. Settings claim keeps Copy + Share, which
 *     covers the "tell my friends" intent without the QR weight.
 *
 * UX parity: hero band with success tint + serif handle, action row,
 * "Continue to Audric →" CTA below.
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
      className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-flat)]"
      data-testid="username-claim-success"
    >
      <div className="flex items-center justify-between border-b border-success/30 bg-success/10 px-[18px] py-3">
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-success">
          <CheckIcon aria-hidden="true" size={11} />
          HANDLE CLAIMED
        </span>
      </div>

      <div className="border-b border-success/30 bg-success/10 px-8 pt-10 pb-7 text-center">
        <div className="mb-[18px] font-mono text-[11px] uppercase tracking-[0.12em] text-success">
          ▓▒░&nbsp;&nbsp;YOUR PASSPORT&nbsp;&nbsp;░▒▓
        </div>
        <div
          className="break-all font-serif text-[30px] leading-[1.15] tracking-[-0.005em] text-foreground"
          data-testid="username-claim-success-handle"
        >
          {fullHandle}
        </div>
        <p className="mt-3 text-[14px] leading-[20px] text-muted-foreground">
          yours on Sui — recognized everywhere
        </p>
      </div>

      <div className="flex gap-2 px-6 pt-[18px]">
        <button
          aria-label={copied ? "Copied to clipboard" : `Copy ${fullHandle}`}
          aria-live="polite"
          className="flex flex-1 items-center justify-center gap-2 rounded-sm border border-border bg-card px-3 py-2.5 text-[13px] font-medium text-foreground transition hover:border-foreground/30 focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none"
          data-testid="username-claim-success-copy"
          onClick={handleCopy}
          type="button"
        >
          {copied ? (
            <>
              <CheckIcon
                aria-hidden="true"
                className="text-success"
                size={13}
              />
              <span className="text-success">Copied</span>
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
          className="flex flex-1 items-center justify-center gap-2 rounded-sm border border-border bg-card px-3 py-2.5 text-[13px] font-medium text-foreground transition hover:border-foreground/30 focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none"
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
        <div className="px-6 py-6">
          <button
            className="w-full rounded-sm border border-foreground bg-foreground px-[18px] py-3 text-[14px] font-medium text-background transition hover:opacity-90 focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none"
            data-testid="username-claim-success-continue"
            onClick={onContinue}
            type="button"
          >
            Continue to Audric →
          </button>
        </div>
      )}
    </div>
  );
}
