'use client';

import type { ToolTimelineBlock } from '@/lib/engine-types';
import { getStepIcon, getStepLabel } from '../AgentStep';
import { ToolBlockView } from './ToolBlockView';
import { MppReceiptGrid } from './MppReceiptGrid';
import {
  ParallelToolsRow,
  type ParallelRowStatus,
} from './primitives/ParallelToolsRow';
import { getResultPreview } from './result-preview';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 23A-A2 — anticipatory header copy registry (2026-05-11).
//
// Demos pick a header per tool composition (sourced from
// `audric_demos_v2/demos/*.html`):
//
//   01 (5 reads)              → "DISPATCHING 5 READS · PARALLEL"
//   03/04 (4 mpp pay_api)     → "DISPATCHING 4 MPP CALLS"
//   05 (5 mpp_services + pay) → "DISPATCHING 5 MPP CALLS · DISCOVERY + QUOTES"
//   06 (4 mpp_services)       → "QUERYING 4 VENDORS IN PARALLEL · MPP DISCOVERY"
//   07 (5 web_search)         → custom-domain header (out-of-scope for
//                               registry — falls through to READS · PARALLEL)
//
// Registry chooses the closest demo bucket from the actual tool name
// composition. Pre-A2 the header was hardcoded "Running tasks in parallel"
// for every group regardless of what fired.
// ───────────────────────────────────────────────────────────────────────────

/** Tool-name buckets the header registry routes by. */
type HeaderBucket = 'mpp_pay' | 'mpp_discovery' | 'mpp_mixed' | 'reads';

function bucketForTool(toolName: string): HeaderBucket {
  if (toolName === 'pay_api') return 'mpp_pay';
  if (toolName === 'mpp_services') return 'mpp_discovery';
  return 'reads';
}

/**
 * Pick the demo-style header label for a parallel group.
 * Exported for direct unit-testing — see ParallelToolsGroup.test.ts.
 */
export function getParallelHeaderLabel(tools: ReadonlyArray<{ toolName: string }>): string {
  if (tools.length === 0) return 'RUNNING TASKS IN PARALLEL';

  const buckets = new Set(tools.map((t) => bucketForTool(t.toolName)));
  const n = tools.length;

  // All pay_api → "DISPATCHING N MPP CALLS" (demos 03, 04)
  if (buckets.size === 1 && buckets.has('mpp_pay')) {
    return `DISPATCHING ${n} MPP CALLS`;
  }
  // All mpp_services → "QUERYING N VENDORS IN PARALLEL · MPP DISCOVERY" (demo 06)
  if (buckets.size === 1 && buckets.has('mpp_discovery')) {
    return `QUERYING ${n} VENDORS IN PARALLEL · MPP DISCOVERY`;
  }
  // Mix of pay_api + mpp_services → "DISPATCHING N MPP CALLS · DISCOVERY + QUOTES" (demo 05)
  if (
    buckets.has('mpp_pay') &&
    buckets.has('mpp_discovery') &&
    !buckets.has('reads')
  ) {
    return `DISPATCHING ${n} MPP CALLS · DISCOVERY + QUOTES`;
  }
  // Default: read tools (demo 01) or any mixed bucket including reads.
  return `DISPATCHING ${n} READS · PARALLEL`;
}

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 — ParallelToolsGroup (B2.2 + B3.5)
//
// Renders 2+ adjacent tool blocks that the timeline-grouping heuristic
// flagged as "fired in parallel" (startedAt within 50ms of each other).
//
// B3.5 (audit Gap C) ports this surface from the AgentStep nesting to
// the v2 demo's "lit-up rows" card primitive (`<ParallelToolsRow>`):
//
//   ⊞ RUNNING TASKS IN PARALLEL                   2/3
//   ┌──────────────────────────────────────────────────┐
//   │ 📊  PORTFOLIO ANALYSIS    fetched 4 wallets    ●  DONE │
//   │ 💰  BALANCE CHECK         fetching…           ◌  …   │
//   │ 📈  RATES INFO            6.4% USDC · NAVI    ●  DONE │
//   └──────────────────────────────────────────────────┘
//
// Each row's background warms (faint green / red / amber tint) once the
// tool settles — gives the user the "things are landing" beat the v0.3
// AgentStep tree was missing. Cards still render chronologically below
// the group once streaming ends (unchanged behavior).
// ───────────────────────────────────────────────────────────────────────────

interface ParallelToolsGroupProps {
  tools: ToolTimelineBlock[];
  /** Same isStreaming gate as ToolBlockView — hide cards while the
   *  message is still streaming so we don't pop in half-results. */
  isStreaming?: boolean;
  /**
   * [B-MPP5 fix1 / 2026-05-12] Forwarded to each per-tool `<ToolBlockView>`
   * (and to `<MppReceiptGrid>` on the all-pay_api branch) so the per-cell
   * MPP card can render `<ReviewCard>` Regenerate / Cancel buttons.
   *
   * Pre-fix this prop didn't exist — `<ParallelToolsGroup>` constructed
   * `<ToolBlockView>` without `onSendMessage`, so any `<ReviewCard>` inside
   * a parallel cluster (DALL-E + DALL-E, DALL-E + ElevenLabs, etc.) had
   * non-functional Regenerate buttons. Single-block `<BlockRouter>` was
   * unaffected because it forwards `onSendMessage` directly. The grid render
   * path (B-MPP5) made the bug more visible by surfacing 2-N receipts in
   * one cluster, so the fix is in-scope for the same batch.
   */
  onSendMessage?: (text: string) => void;
  /**
   * [SPEC 23B-MPP6-fastpath / 2026-05-12] Forwarded to each per-tool
   * `<ToolBlockView>` (and to `<MppReceiptGrid>` on the all-pay_api
   * branch) so `<ReviewCard>`'s Regenerate button can dispatch the
   * fastpath re-fire of the original `pay_api` call (bypasses LLM).
   * Threaded the same way as `onSendMessage` above. Wired from
   * `dashboard-content.tsx:handleRegenerateToolCall`.
   */
  onRegenerateToolCall?: (toolUseId: string) => Promise<void>;
}

function toRowStatus(s: ToolTimelineBlock['status']): ParallelRowStatus {
  switch (s) {
    case 'streaming':
    case 'running':
      return 'running';
    case 'done':
      return 'done';
    case 'error':
      return 'error';
    case 'interrupted':
      return 'interrupted';
  }
}

/** Build the "fetched X" / "fetching…" sub-line for a row.
 *
 *  - running  → `tool.progress.message ?? "querying…"`
 *  - error    → `"failed"`
 *  - interrupted → `"interrupted"`
 *  - done     → SPEC 23A-A1 per-tool preview from `getResultPreview` (e.g.
 *               `"$200 → 212.77 SUI · 0.03%"`); falls back to `"ran in Ns"`
 *               when no fitter exists for the tool OR the payload didn't
 *               match the expected shape. The cards below still carry the
 *               full payload — this is the at-a-glance sub-line. */
function rowSub(tool: ToolTimelineBlock): string {
  if (tool.status === 'streaming' || tool.status === 'running') {
    return tool.progress?.message ?? 'querying…';
  }
  if (tool.status === 'interrupted') return 'interrupted';
  if (tool.status === 'error') return 'failed';
  const preview = getResultPreview(tool.toolName, tool.result);
  if (preview) return preview;
  if (tool.startedAt !== undefined && tool.endedAt !== undefined) {
    const seconds = Math.max(0, (tool.endedAt - tool.startedAt) / 1000);
    return `ran in ${seconds.toFixed(1)}s`;
  }
  return 'done';
}

export function ParallelToolsGroup({
  tools,
  isStreaming,
  onSendMessage,
  onRegenerateToolCall,
}: ParallelToolsGroupProps) {
  if (tools.length === 0) return null;

  const doneCount = tools.filter(
    (t) => t.status === 'done' || t.status === 'error' || t.status === 'interrupted',
  ).length;
  const total = tools.length;
  const allDone = doneCount === total;
  const headerLabel = getParallelHeaderLabel(tools);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mt-1.5 mb-1">
        <span className="text-[12px] text-fg-muted" aria-hidden="true">
          ⊞
        </span>
        {/* SPEC 23A-A7 — 0.12em letter-spacing matches the demo
            PermissionCard label (`letterSpacing: '.12em'` on 10px mono),
            tighter than audric's prior 0.14em default. */}
        <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-fg-secondary">
          {headerLabel}
        </span>
        <span
          className="ml-auto font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted tabular-nums"
          aria-label={`${doneCount} of ${total} tools complete`}
        >
          {allDone ? `${total}/${total} done` : `${doneCount}/${total}`}
        </span>
      </div>
      <div
        className="rounded-lg border border-border-subtle bg-surface-card overflow-hidden"
        role="group"
        aria-label="Parallel tool execution"
      >
        {tools.map((tool, i) => (
          <ParallelToolsRow
            key={tool.toolUseId}
            glyph={getStepIcon(tool.toolName, tool.input)}
            label={getStepLabel(tool.toolName)}
            sub={rowSub(tool)}
            status={toRowStatus(tool.status)}
            last={i === tools.length - 1}
          />
        ))}
      </div>

      {/* Cards rendered below the group, only after the message has
          finished streaming. ToolBlockView's `headerless` mode skips the
          AgentStep header (already shown in the group row above) and
          emits only the result card.

          [SPEC 23B-MPP5 / 2026-05-12] When the cluster is all pay_api
          AND has 2+ tools, route the cards through `<MppReceiptGrid>`
          (CSS grid, side-by-side, responsive auto-fit) instead of the
          chronological vertical stack.

          ⚠️ DORMANT TODAY: pay_api is a write tool and write tools
          serialize under TxMutex (see orchestration.ts Phase 2). The
          `shouldUseMppGrid` branch below cannot fire in production
          today — the grid is shipped pre-built for SPEC 16 ATOMIC
          PAYMENT INTENT bundles. Until SPEC 16 ships, every parallel
          cluster routes through the chronological card stack
          (`tools.map → ToolBlockView`) below. See `MppReceiptGrid.tsx`
          file header for the full rationale. */}
      {!isStreaming && shouldUseMppGrid(tools) ? (
        <MppReceiptGrid
          tools={tools}
          isStreaming={isStreaming}
          onSendMessage={onSendMessage}
          onRegenerateToolCall={onRegenerateToolCall}
        />
      ) : (
        !isStreaming &&
        tools.map((tool) =>
          tool.status === 'done' || tool.status === 'error' ? (
            <ToolBlockView
              key={`card-${tool.toolUseId}`}
              block={tool}
              isStreaming={false}
              headerless
              onSendMessage={onSendMessage}
              onRegenerateToolCall={onRegenerateToolCall}
            />
          ) : null,
        )
      )}
    </div>
  );
}

/**
 * [SPEC 23B-MPP5] Detection rule for the MppReceiptGrid render path.
 *
 *   - At least 2 settled tools (single pay_api still renders inline).
 *   - ALL settled tools are pay_api (mixed-tool clusters keep the
 *     vertical stack — e.g. pay_api + balance_check shouldn't crowd
 *     into a grid; the balance_check card is wider + has different
 *     visual weight than an MPP receipt).
 *
 * Exported for unit testing — see ParallelToolsGroup.test.ts.
 */
export function shouldUseMppGrid(tools: ToolTimelineBlock[]): boolean {
  const settled = tools.filter(
    (t) => t.status === 'done' || t.status === 'error',
  );
  if (settled.length < 2) return false;
  return settled.every((t) => t.toolName === 'pay_api');
}
