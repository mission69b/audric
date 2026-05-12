'use client';

/**
 * SPEC 23B-MPP5 — MppReceiptGrid (2026-05-12).
 *
 * Visual wrapper that renders 2-N pay_api receipts side-by-side as a CSS
 * grid instead of the default vertical stack. Used by `<ParallelToolsGroup>`
 * when all settled tools in a parallel cluster are `pay_api` (e.g. the LLM
 * dispatched DALL-E + ElevenLabs in parallel under sub-threshold auto-tier).
 *
 * Why a grid and not a stack?
 *   - MPP receipts are full-bleed media surfaces (image previews, audio
 *     players, PDF covers). Stacking 2-4 of them vertically puts the user
 *     into a 600-1200px scroll wall just to see the cluster.
 *   - Side-by-side reads as "one parallel batch landed" matching the
 *     header copy ("DISPATCHING N MPP CALLS"). The vertical stack reads
 *     as "N independent things happened in sequence" which is wrong for
 *     this composition.
 *   - Audric demos 03/04/05 (the locked design references) show MPP cards
 *     in 2-col grids when the same turn produced multiple receipts.
 *
 * Responsive layout:
 *   - `auto-fit, minmax(280px, 1fr)` collapses to 1 col on narrow viewports
 *     (< 580px ≈ mobile, since 280px + 16px gap × 2 = 576px), 2 cols on
 *     standard chat width, 3 cols on wide chats. The minmax floor of
 *     280px is chosen to keep image/audio previews legible — narrower
 *     than that and DALL-E's 4:5 thumb starts looking like a stamp.
 *
 * SPEC 16 future-proofing — `subtitle`:
 *   When SPEC 16 ATOMIC PAYMENT INTENT lands, multi-pay_api turns will
 *   carry an "intent" label (e.g. "ATOMIC PAYMENT INTENT · 4 services ·
 *   $0.20 total") communicating that the cluster is one logical
 *   transaction rather than N independent payments. The grid surfaces a
 *   subtitle slot above the cards so SPEC 16 can drop the label in
 *   without re-engineering this surface. When undefined (today), no
 *   subtitle row renders — the grid sits cleanly under
 *   ParallelToolsGroup's existing header.
 */

import type { ToolTimelineBlock } from '@/lib/engine-types';
import { ToolBlockView } from './ToolBlockView';

interface MppReceiptGridProps {
  /** The pay_api tools to render side-by-side. Should all be settled
   *  (status === 'done' or 'error') by the time this renders — the
   *  caller (ParallelToolsGroup) gates on that. */
  tools: ToolTimelineBlock[];
  /** Same isStreaming gate as the standard chronological card stack —
   *  hide cards while the message is still streaming so we don't pop in
   *  half-results. */
  isStreaming?: boolean;
  /**
   * SPEC 16 ATOMIC PAYMENT INTENT future-proofing slot. When set,
   * renders a single uppercase mono label row above the grid (e.g.
   * "ATOMIC PAYMENT INTENT · 4 SERVICES · $0.20 TOTAL"). When
   * undefined (today), no row renders.
   */
  subtitle?: string;
}

export function MppReceiptGrid({
  tools,
  isStreaming,
  subtitle,
}: MppReceiptGridProps) {
  if (tools.length === 0) return null;

  // Filter to only render settled cards (matches ParallelToolsGroup's
  // `tool.status === 'done' || tool.status === 'error'` gate). Tools
  // still running don't get a grid cell — they show in the header rows
  // above with their loading/spinner state.
  const settled = tools.filter(
    (t) => t.status === 'done' || t.status === 'error',
  );

  if (settled.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {subtitle && (
        <div
          className="font-mono text-[9px] tracking-[0.12em] uppercase text-fg-muted px-1"
          aria-label="MPP cluster subtitle"
        >
          {subtitle}
        </div>
      )}

      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        }}
        role="group"
        aria-label="MPP receipt cluster"
      >
        {!isStreaming &&
          settled.map((tool) => (
            <div key={`mpp-grid-${tool.toolUseId}`} className="min-w-0">
              <ToolBlockView block={tool} isStreaming={false} headerless />
            </div>
          ))}
      </div>
    </div>
  );
}
