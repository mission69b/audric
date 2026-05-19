'use client';

import { useState } from 'react';
import { chunkAddress } from '@/lib/sui-address';

// ChunkedAddress — visual 4-char chunked-hex Sui address with copy
// button. Ported from `apps/web/components/engine/ChunkedAddress.tsx`
// by Phase 5a.4 (renderer migration sweep, 2026-05-19). Lives under
// `cards/shared/` because TransactionReceiptCard is the only ported
// consumer today; the legacy file at the engine root will follow when
// Phase 5d's shell (ReasoningTimeline, etc.) lands.

interface ChunkedAddressProps {
  address: string;
  className?: string;
  showCopyButton?: boolean;
}

export function ChunkedAddress({
  address,
  className,
  showCopyButton = true,
}: ChunkedAddressProps) {
  const groups = chunkAddress(address);
  const [copied, setCopied] = useState(false);

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
      // Clipboard API can fail on insecure contexts or denied permission.
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
