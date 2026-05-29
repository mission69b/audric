"use client";

import { useCallback, useState } from "react";

/**
 * Tiny client subcomponent for the public profile page (Phase 6 Session 3).
 * The parent route is a server component for SSR (so SuiNS lookup happens
 * server-side and OG metadata lands in HTML for share previews); only the
 * copy interaction needs `useState` + `navigator.clipboard`.
 *
 * Render contract: "Copy address" → "Copied" feedback for 1.5s → reverts.
 * Mirrors the copy-button pattern from `<UsernameClaimSuccess>`.
 */

const COPY_FEEDBACK_MS = 1500;

export function AddressCopyButton({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(address).catch(() => {
      // clipboard can fail in insecure contexts; UX is best-effort
    });
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  }, [address]);

  return (
    <button
      aria-label={copied ? "Copied to clipboard" : `Copy address ${address}`}
      aria-live="polite"
      className="block w-full rounded-md border border-border bg-background px-3 py-2 text-center text-[12px] text-foreground transition-colors hover:border-foreground/30"
      onClick={handleCopy}
      type="button"
    >
      {copied ? "✓ Copied address" : "📋 Copy address"}
    </button>
  );
}
