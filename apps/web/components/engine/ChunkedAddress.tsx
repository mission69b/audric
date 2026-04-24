'use client';

import { useState } from 'react';
import { chunkAddress } from '@/lib/sui-address';

/**
 * Renders a Sui address as visually-grouped 4-char chunks, with a
 * one-tap copy button that yields the canonical 0x...64-hex string
 * (NO spaces — copying the rendered text would otherwise leak the
 * visual gaps into the clipboard, and the user reported this as a
 * confusing bug after the audric-send-safety v1 ship).
 *
 * Chunks are rendered as adjacent <span>s with margin gaps. Browsers
 * concatenate adjacent span text on copy without inserting separators,
 * so a user-initiated copy of the rendered region yields raw hex —
 * but the explicit copy button is the only path we recommend.
 */
interface ChunkedAddressProps {
  address: string;
  /**
   * Optional className applied to the outer monospace container so the
   * caller controls font size, padding, and border. The chunked spans
   * inherit text styles from this container.
   */
  className?: string;
  /**
   * When `false`, suppresses the copy button. Useful for inline
   * receipt rows where the chunked-hex is purely decorative and the
   * full address is already shown elsewhere.
   */
  showCopyButton?: boolean;
}

export function ChunkedAddress({
  address,
  className,
  showCopyButton = true,
}: ChunkedAddressProps) {
  const groups = chunkAddress(address);
  const [copied, setCopied] = useState(false);

  // Fall back to the raw input when the address isn't a valid 0x...64-
  // hex string (e.g. a contact name or a malformed address). Render in
  // monospace so the user can still scan it but skip chunking.
  if (!groups) {
    return (
      <div className={className}>
        <span className="font-mono break-all">{address}</span>
      </div>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail on insecure contexts or if the user has
      // denied permission. Surfacing an error here would be noisier
      // than helpful — the chunks are still selectable manually.
    }
  };

  return (
    <div className={className}>
      <div className="flex items-start justify-between gap-2">
        <div className="font-mono leading-[1.55] flex flex-wrap gap-x-2 gap-y-0.5 select-all">
          <span aria-hidden="true">0x</span>
          {groups.map((g, i) => (
            <span key={i}>{g}</span>
          ))}
          {/* Hidden raw address so screen readers / "select all + copy"
              users still get the canonical form rather than the visual
              chunks. */}
          <span className="sr-only">{address}</span>
        </div>
        {showCopyButton && (
          <button
            type="button"
            onClick={copy}
            className="shrink-0 rounded-md border border-border-subtle bg-surface-card px-2 py-0.5 text-[10px] font-medium text-fg-secondary hover:text-fg-primary hover:border-border-strong transition"
            aria-label="Copy address to clipboard"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
    </div>
  );
}
