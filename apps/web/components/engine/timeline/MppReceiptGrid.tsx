'use client';

/**
 * SPEC 23B-MPP5 — MppReceiptGrid (2026-05-12).
 *
 * ⚠️ DORMANT TODAY — TRIGGERS ONLY WHEN SPEC 16 BUNDLES SHIP.
 *
 * Visual wrapper that renders 2-N pay_api receipts side-by-side as a CSS
 * grid instead of the default vertical stack. Used by `<ParallelToolsGroup>`
 * when all settled tools in a parallel cluster are `pay_api`.
 *
 * Why dormant: `pay_api` is a write tool. The engine orchestrator
 * (`packages/engine/src/orchestration.ts` Phase 2) executes write tools
 * **serially under TxMutex** — only `isReadOnly && isConcurrencySafe`
 * tools fire in Phase 1 via `Promise.allSettled`. Two `pay_api` calls
 * in the same turn therefore land sequentially, ~hundreds of ms apart,
 * and the timeline-grouping heuristic (`startedAt` within 50ms) never
 * clusters them. `shouldUseMppGrid` cannot fire today.
 *
 * The intended trigger is SPEC 16 ATOMIC PAYMENT INTENT: one user prompt
 * → one PTB bundling N pay_api legs → all legs settle in the same on-chain
 * tx → the timeline emits them as one parallel cluster → grid renders.
 * Until SPEC 16 ships, this surface is dead code.
 *
 * Why ship it dormant: the grid + the header bucket
 * ("DISPATCHING N MPP CALLS") + the subtitle slot are the demo-locked
 * design surface for the SPEC 16 receipt cluster. Building it now means
 * SPEC 16 only needs to wire the bundle dispatch path — the receipt
 * surface is already test-covered (15 visual + 10 detection-rule + 2
 * fix1 regression tests) and demo-quality. Removing it now would just
 * cost a re-implementation when SPEC 16 lands.
 *
 * Why a grid and not a stack (when SPEC 16 lands):
 *   - MPP receipts are full-bleed media surfaces (image previews, audio
 *     players, PDF covers). Stacking 2-4 of them vertically puts the user
 *     into a 600-1200px scroll wall just to see the cluster.
 *   - Side-by-side reads as "one parallel batch landed" matching the
 *     header copy ("DISPATCHING N MPP CALLS"). The vertical stack reads
 *     as "N independent things happened in sequence" which is wrong for
 *     a single atomic-intent bundle.
 *   - Audric demos 03/04/05 (the locked design references) show MPP cards
 *     in 2-col grids when one prompt produced multiple receipts.
 *
 * Responsive layout:
 *   - `auto-fit, minmax(280px, 1fr)` collapses to 1 col on narrow viewports
 *     (< 580px ≈ mobile, since 280px + 16px gap × 2 = 576px), 2 cols on
 *     standard chat width, 3 cols on wide chats. The minmax floor of
 *     280px is chosen to keep image/audio previews legible — narrower
 *     than that and DALL-E's 4:5 thumb starts looking like a stamp.
 *
 * SPEC 16 wiring slot — `subtitle`:
 *   When SPEC 16 ATOMIC PAYMENT INTENT lands, the bundle layer will pass
 *   a label (e.g. "ATOMIC PAYMENT INTENT · 4 SERVICES · $0.20 TOTAL")
 *   communicating that the cluster is one logical transaction. The grid
 *   surfaces a subtitle slot above the cards so SPEC 16 only has to set
 *   this prop — no re-engineering. Undefined today (and on every render
 *   path until SPEC 16) means no subtitle row renders.
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
  /**
   * [B-MPP5 fix1 / 2026-05-12] Forwarded to each `<ToolBlockView>` so
   * the per-cell MPP card (DALL-E preview, ElevenLabs player, …) can
   * render `<ReviewCard>` Regenerate / Cancel buttons that fire a
   * synthesized user message via the engine. Without this, parallel
   * pay_api clusters had non-functional Regenerate buttons (the same
   * latent bug that the chronological-stack path also exhibited; the
   * grid just made it more visible by surfacing 2-N receipts at once).
   *
   * Threaded through identically to the single-block path:
   * `<ReasoningTimeline>` → `<ParallelToolsGroup>` → here →
   * `<ToolBlockView>` → `<ToolResultCard>` → MPP renderer →
   * `<ReviewCard>`.
   */
  onSendMessage?: (text: string) => void;
}

export function MppReceiptGrid({
  tools,
  isStreaming,
  subtitle,
  onSendMessage,
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
              <ToolBlockView
                block={tool}
                isStreaming={false}
                headerless
                onSendMessage={onSendMessage}
              />
            </div>
          ))}
      </div>
    </div>
  );
}
