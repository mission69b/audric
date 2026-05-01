'use client';

import { cn } from '@/lib/cn';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B3.5 — ParallelToolsRow primitive (audit Gap C)
//
// One row inside the v2 "RUNNING TASKS IN PARALLEL" card. Displays the
// per-tool icon, label, sub-text (status / result preview) and a
// status dot + "DONE/…" badge. Used by `<ParallelToolsGroup>` to
// replace the AgentStep child rows so the parallel surface picks up
// the v2 demo's "lit-up" feel where each row's background warms when
// the tool lands.
//
// Status mapping (from `ToolTimelineBlock.status`):
//   running    → blue dot, blue pulse, "…" badge
//   done       → green dot, faint-green row tint, "✓ DONE" badge
//   error      → red dot, faint-red row tint, "FAIL" badge
//   interrupted→ amber dot, faint-amber row tint, "ABORT" badge
//
// `last` (the last row in a group) skips the trailing border so the
// outer card border carries the visual close.
// ───────────────────────────────────────────────────────────────────────────

export type ParallelRowStatus = 'running' | 'done' | 'error' | 'interrupted';

interface ParallelToolsRowProps {
  glyph: string;
  label: string;
  sub: string;
  status: ParallelRowStatus;
  /** Hide the bottom border (last row in the group). */
  last?: boolean;
}

const STATUS_DOT_BG: Record<ParallelRowStatus, string> = {
  running: 'bg-info-solid',
  done: 'bg-success-solid',
  error: 'bg-error-solid',
  interrupted: 'bg-warning-solid',
};

const STATUS_BADGE_TEXT: Record<ParallelRowStatus, string> = {
  running: '…',
  done: '✓ DONE',
  error: 'FAIL',
  interrupted: 'ABORT',
};

const STATUS_BADGE_COLOR: Record<ParallelRowStatus, string> = {
  running: 'text-fg-muted',
  done: 'text-success-fg',
  error: 'text-error-fg',
  interrupted: 'text-warning-fg',
};

const STATUS_ROW_TINT: Record<ParallelRowStatus, string> = {
  running: '',
  done: 'bg-success-bg/40',
  error: 'bg-error-bg/40',
  interrupted: 'bg-warning-bg/40',
};

export function ParallelToolsRow({
  glyph,
  label,
  sub,
  status,
  last,
}: ParallelToolsRowProps) {
  const isRunning = status === 'running';
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3.5 py-2.5 transition-colors',
        !last && 'border-b border-border-subtle',
        STATUS_ROW_TINT[status],
      )}
    >
      <span
        className="text-sm w-[18px] text-center shrink-0"
        aria-hidden="true"
      >
        {glyph}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-fg-secondary">
          {label}
        </div>
        <div
          className={cn(
            'text-[12px] mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis transition-colors',
            isRunning ? 'text-fg-muted' : 'text-fg-primary',
          )}
        >
          {sub}
        </div>
      </div>
      <span
        className={cn(
          'w-2 h-2 rounded-full shrink-0 transition-colors',
          STATUS_DOT_BG[status],
          isRunning && 'animate-pulse',
        )}
        aria-hidden="true"
      />
      <span
        className={cn(
          'font-mono text-[9px] tracking-[0.12em] uppercase w-[52px] text-right shrink-0',
          STATUS_BADGE_COLOR[status],
        )}
      >
        {STATUS_BADGE_TEXT[status]}
      </span>
    </div>
  );
}
