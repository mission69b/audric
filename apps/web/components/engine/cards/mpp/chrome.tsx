'use client';

/**
 * SPEC 23B-MPP1 — Shared chrome for MPP service surfaces.
 *
 * Every per-vendor primitive (CardPreview, TrackPlayer, BookCover,
 * VendorReceipt) sits inside the same outer container so the harness
 * reads as a coherent family. The chrome is intentionally lighter than
 * `<CardShell>` (the standard read-card chrome) — MPP cards are full-bleed
 * media surfaces; a heavy header bar would compete with the content.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────┐
 *   │ ✦ DALL-E PREVIEW · GENERATED            $0.04│  ← MppHeader
 *   ├──────────────────────────────────────────────┤
 *   │                                              │
 *   │              [content slot]                  │  ← children
 *   │                                              │
 *   ├──────────────────────────────────────────────┤
 *   │ 1024×1024 · USPS FIRST-CLASS    AI-DESIGNED │  ← MppFooter
 *   └──────────────────────────────────────────────┘
 *
 * Header / footer are optional; consumers compose what they need. The
 * shell itself is just the rounded border + background + overflow guard.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface MppCardShellProps {
  /** Optional header slot (typically `<MppHeader>`). */
  header?: ReactNode;
  /** Optional footer slot (typically `<MppFooter>`). */
  footer?: ReactNode;
  /** Content (the per-vendor body). */
  children: ReactNode;
  /**
   * Extra className for the outer shell. Used by primitives that need a
   * custom background (e.g. TrackPlayer's dark gradient, BookCover's
   * cream gradient) — they pass `bg-...` here and the inner padding
   * sections inherit transparency so the gradient bleeds through.
   */
  className?: string;
  /**
   * When true, the body uses no internal padding (image/video surfaces
   * that should fill the shell edge-to-edge between header and footer).
   * Default false → standard 16px body padding.
   */
  bodyNoPadding?: boolean;
}

export function MppCardShell({ header, footer, children, className, bodyNoPadding }: MppCardShellProps) {
  return (
    <div
      className={cn(
        'my-1.5 rounded-lg overflow-hidden border border-border-subtle bg-surface-card',
        className,
      )}
    >
      {header}
      <div className={bodyNoPadding ? '' : 'px-4 py-3'}>{children}</div>
      {footer}
    </div>
  );
}

interface MppHeaderProps {
  /** Left-side caption (e.g. "DALL-E PREVIEW · GENERATED"). */
  caption: ReactNode;
  /** Right-side meta (e.g. cost "$0.04" or take number "TAKE 2"). */
  right?: ReactNode;
  /**
   * Whether to lead with the green ✦ sparkle. Defaults to true — set
   * false for VendorReceipt where the vendor tag IS the lead glyph.
   */
  showSparkle?: boolean;
}

export function MppHeader({ caption, right, showSparkle = true }: MppHeaderProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border-subtle bg-surface-sunken">
      {showSparkle && (
        <span className="text-success-solid text-[11px] shrink-0" aria-hidden="true">
          ✦
        </span>
      )}
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-muted truncate">
        {caption}
      </span>
      {right != null && <span className="ml-auto font-mono text-[10px] text-fg-secondary shrink-0">{right}</span>}
    </div>
  );
}

interface MppFooterProps {
  /** Left-side meta (e.g. "1024×1024 · USPS FIRST-CLASS"). */
  meta: ReactNode;
  /** Right-side tag/badge (e.g. "AI-DESIGNED" pill). */
  tag?: ReactNode;
}

export function MppFooter({ meta, tag }: MppFooterProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-t border-border-subtle bg-surface-sunken">
      <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-fg-muted truncate flex-1">
        {meta}
      </span>
      {tag}
    </div>
  );
}

/**
 * Pill primitive used for per-vendor / per-tier tags (e.g. "AI-DESIGNED",
 * "PRIME", "100 EVER"). Tone-aware: defaults to a subtle dark pill;
 * `tone="purple"` for AI/generated tags, `tone="green"` for success state,
 * `tone="dark"` for vendor labels.
 */
export function MppTag({
  children,
  tone = 'dark',
}: {
  children: ReactNode;
  tone?: 'dark' | 'purple' | 'green' | 'blue';
}) {
  const toneClass: Record<string, string> = {
    dark: 'bg-surface-sunken text-fg-muted border border-border-subtle',
    purple: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
    green: 'bg-success-solid/10 text-success-solid border border-success-solid/20',
    blue: 'bg-info-solid/10 text-info-solid border border-info-solid/20',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-mono uppercase tracking-[0.12em] shrink-0',
        toneClass[tone],
      )}
    >
      {children}
    </span>
  );
}

/**
 * Defensive USD price formatter. The gateway returns `price` as a string
 * ("0.04", "0.0046"). Most renderers want it as `$0.04`. Sub-cent values
 * floor to `< $0.01` per the cards/primitives.tsx fmtYield convention.
 */
export function fmtMppPrice(price: string | number | undefined | null): string {
  if (price == null) return '—';
  const n = typeof price === 'number' ? price : Number(price);
  if (!Number.isFinite(n)) return '—';
  if (n > 0 && n < 0.005) return '< $0.01';
  if (n < 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(2)}`;
}
