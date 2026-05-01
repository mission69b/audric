'use client';

import type { TodoTimelineBlock } from '@/lib/engine-types';
import { cn } from '@/lib/cn';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 — TodoBlockView (B2.2)
//
// Renders the live todo list from update_todo. The block is a sticky
// singleton — multiple update_todo calls within the same turn upsert
// into the same block (idempotent tool, latest items always win). The
// renderer reads only the current items array.
//
// Per-item status visuals:
//   pending     · grey bullet, faint label
//   in_progress → green arrow, bold label, soft pulse animation
//   completed   ✓ green check, label with strikethrough
//
// Per spec, the LLM is REQUIRED to keep exactly one item in_progress at
// a time. Preflight enforces this on the engine side, so we trust the
// invariant here and don't validate it again. If the invariant ever
// breaks, the renderer still works — it just shows whatever the LLM
// emitted, which is the right failure mode (visible, not hidden).
//
// "✓ N-step plan completed" inline-collapse-on-completion (SPEC 8 v0.2
// resolved decision 4) lands in B3 — it requires plumbing message-level
// `isStreaming === false` through to here so we know the turn ended.
// ───────────────────────────────────────────────────────────────────────────

interface TodoBlockViewProps {
  block: TodoTimelineBlock;
}

export function TodoBlockView({ block }: TodoBlockViewProps) {
  if (!block.items || block.items.length === 0) return null;

  return (
    <div className="pl-1 mb-2">
      <div className="rounded-md border border-border-subtle bg-surface-card px-3 py-2">
        <ul className="space-y-1">
          {block.items.map((item) => (
            <li
              key={item.id}
              className={cn(
                'flex items-start gap-2 text-[12.5px] leading-snug',
                item.status === 'pending' && 'text-fg-muted',
                item.status === 'in_progress' && 'text-fg-primary font-medium',
                item.status === 'completed' && 'text-fg-secondary line-through decoration-fg-muted/40',
              )}
            >
              <span
                className={cn(
                  'font-mono w-3 shrink-0 text-center mt-[2px]',
                  item.status === 'pending' && 'text-fg-muted',
                  item.status === 'in_progress' && 'text-success-solid',
                  item.status === 'completed' && 'text-success-solid',
                )}
                aria-label={item.status}
              >
                {item.status === 'pending' && '·'}
                {item.status === 'in_progress' && '→'}
                {item.status === 'completed' && '✓'}
              </span>
              <span className="flex-1 min-w-0">{item.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
