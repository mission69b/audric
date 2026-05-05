'use client';

import { useCallback, useState } from 'react';

/**
 * Tiny client subcomponent for the SPEC 10 D.1 stub. The parent
 * (`app/[username]/page.tsx`) is a server component for SSR (so SuiNS
 * lookup happens server-side, OG meta lands in HTML for share previews),
 * but the copy interaction needs `useState` + `navigator.clipboard`. Lifting
 * just this one button into a client component keeps the rest of the page
 * SSR-rendered.
 *
 * Render contract: shows "Copy address" → "Copied" feedback for 1.5s →
 * reverts. Mirrors the copy-button pattern from `<UsernameClaimSuccess>`.
 */
export function AddressCopyButton({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [address]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Copied to clipboard' : `Copy address ${address}`}
      aria-live="polite"
      className="block w-full rounded-md border border-border-subtle bg-surface-page px-3 py-2 text-center text-[12px] text-fg-primary transition-colors hover:border-border-strong"
    >
      {copied ? '✓ Copied address' : '📋 Copy address'}
    </button>
  );
}
