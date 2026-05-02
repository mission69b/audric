'use client';

import type { ContactResolvedTimelineBlock } from '@/lib/engine-types';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 7 P2.5b Layer 5 — ContactResolvedBlockView
//
// Renders a single "CONTACT · "<name>"" planning row that surfaces the
// resolution from a chat-mentioned contact name to its on-chain
// address. Pushed by `applyEventToTimeline` immediately before the
// related tool / permission-card block whenever a recipient-style
// input field matches a known contact. Engine-agnostic — purely
// host-side UX polish ("the agent is thinking out loud").
//
// Visual: matches the existing Cursor-style mono label rows used by
// `RegeneratedBlockView` (small-caps mono uppercase, neutral subtle
// tone). The truncated address sits inline as the resolution target,
// not as a card — the goal is "the agent acknowledges who Mom is and
// proceeds", not a full contact card.
// ───────────────────────────────────────────────────────────────────────────

interface ContactResolvedBlockViewProps {
  block: ContactResolvedTimelineBlock;
}

function truncateAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function ContactResolvedBlockView({ block }: ContactResolvedBlockViewProps) {
  return (
    <div
      className="flex items-baseline gap-2 text-[10px] font-mono uppercase tracking-wide text-fg-secondary"
      role="status"
      aria-label={`Contact resolved: ${block.contactName} (${block.contactAddress})`}
    >
      <span className="text-fg-tertiary">CONTACT</span>
      <span aria-hidden="true">·</span>
      <span className="text-fg-secondary">&ldquo;{block.contactName}&rdquo;</span>
      <span aria-hidden="true">→</span>
      <span className="text-fg-tertiary">{truncateAddress(block.contactAddress)}</span>
    </div>
  );
}
