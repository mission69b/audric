'use client';

import { useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B3.5 — HowIEvaluated primitive (audit Gap C)
//
// The trust-card surface that lives inside a thinking block once the
// LLM emits a parseable `<eval_summary>` marker. Renders as a
// disclosure with the v2 demo's badge row:
//
//   ▸ HOW I EVALUATED THIS · 75 TOKENS · AUDRIC v2.0 · 1.4s
//
// Click toggles the body. Defaults to OPEN — the card landing visible
// is a deliberate trust signal, not a hidden footnote. Body content is
// passed in by the caller so this primitive doesn't have to know the
// shape of `EvaluationItem` (the existing `<HowIEvaluatedCard>` ul
// stays inside `<ThinkingBlockView>`).
//
// All three meta fields are optional — if a caller only knows token
// count, the render collapses to "75 TOKENS" without trailing dots.
// ───────────────────────────────────────────────────────────────────────────

interface HowIEvaluatedProps {
  /** Body content (typically the `<HowIEvaluatedCard>`'s ul of items). */
  children: ReactNode;
  /** Optional badges shown to the right of the chevron. */
  tokens?: number | string;
  /** Model identifier — defaults to whatever the caller passes (the
   *  block-view callsite reads from engine usage telemetry). */
  model?: string;
  /** Latency string — pre-formatted so the primitive doesn't need to
   *  know units (`'1.4s'`, `'860ms'`, etc.). */
  latency?: string;
  /** Initial open state. v2 demo opens by default. */
  defaultOpen?: boolean;
}

export function HowIEvaluated({
  children,
  tokens,
  model,
  latency,
  defaultOpen = true,
}: HowIEvaluatedProps) {
  const [open, setOpen] = useState(defaultOpen);

  // Build the meta segment "75 TOKENS · AUDRIC v2.0 · 1.4s" lazily
  // so undefined badges don't introduce dangling separators.
  const metaParts: string[] = [];
  if (tokens !== undefined && tokens !== '') metaParts.push(`${tokens} TOKENS`);
  if (model) metaParts.push(model.toUpperCase());
  if (latency) metaParts.push(latency);
  const meta = metaParts.join(' · ');

  return (
    <div className="pl-1 mb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 py-1 text-fg-muted hover:text-fg-secondary transition-colors"
      >
        <span
          className={cn(
            'inline-flex transition-transform duration-200',
            open && 'rotate-90',
          )}
          aria-hidden="true"
        >
          <Icon name="chevron-right" size={10} />
        </span>
        <span className="font-mono text-[10px] tracking-[0.12em] uppercase">
          How I evaluated this
        </span>
        {meta && (
          <span className="font-mono text-[10px] tracking-[0.05em] uppercase text-fg-muted/80">
            · {meta}
          </span>
        )}
      </button>
      {open && (
        <div className="mt-1 ml-[18px] rounded-md border border-border-subtle bg-surface-card px-3 py-2.5">
          {children}
        </div>
      )}
    </div>
  );
}
