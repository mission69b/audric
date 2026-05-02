'use client';

import type { BundleReceiptTimelineBlock } from '@/lib/engine-types';
import { CardShell, SuiscanLink } from '../cards/primitives';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 7 P2.7 prep / Finding F6 — BundleReceiptBlockView
//
// Single receipt for an atomic Payment Stream PTB. Replaces the pre-fix
// UX where each leg of an N-step bundle rendered as its own
// `TransactionReceiptCard` with a duplicate "View on Suiscan" link
// pointing to the SAME on-chain digest. That violated the user's mental
// model — they signed ONE thing, but saw N receipts and N links — and
// made it ambiguous whether they were charged once or N times.
//
// Design choices:
//   - One CardShell wrapper with N inline rows (one per leg). Keeps the
//     "this is a receipt" framing consistent with the single-write
//     `TransactionReceiptCard` while squashing the digest duplication.
//   - Atomicity language ("ALL SUCCEED OR ALL REVERT") mirrors the
//     pre-execution PermissionCard footer so the receipt feels like the
//     "after" of the same thing the user approved.
//   - Per-leg description comes from `BundleReceiptLeg.description` —
//     identical to what the user saw on the PermissionCard's step row.
//     No re-derivation, no risk of drift.
//   - Reverted bundle (`block.isError === true`) flips the title to
//     "PAYMENT STREAM REVERTED", drops the Suiscan link (no on-chain
//     state to view), and marks every leg with ✗.
// ───────────────────────────────────────────────────────────────────────────

interface BundleReceiptBlockViewProps {
  block: BundleReceiptTimelineBlock;
}

export function BundleReceiptBlockView({ block }: BundleReceiptBlockViewProps) {
  const opsLabel = `${block.legs.length} ${block.legs.length === 1 ? 'op' : 'ops'}`;
  const titleVerb = block.isError ? 'PAYMENT STREAM REVERTED' : 'PAYMENT STREAM';
  const titleStatus = block.isError
    ? `${opsLabel} · ATOMICALLY FAILED`
    : `1 ATOMIC TX · ${opsLabel}`;

  return (
    <CardShell
      title={titleVerb}
      badge={
        <span
          className={`text-[10px] font-mono uppercase tracking-[0.08em] ${
            block.isError ? 'text-error-solid' : 'text-success-solid'
          }`}
          aria-label={
            block.isError
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
          NO ON-CHAIN STATE — BUNDLE REVERTED ATOMICALLY
        </div>
      )}

      <div className="pt-1.5 mt-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-wide text-fg-muted">
        <span>GAS · SPONSORED</span>
        <span>{block.isError ? 'ALL FAILED' : 'ALL SUCCEEDED'}</span>
      </div>
    </CardShell>
  );
}
