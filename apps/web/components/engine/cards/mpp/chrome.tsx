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

import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { SuiscanLink } from '../primitives';

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
  /**
   * Sui digest of the on-chain payment leg (`paymentDigest` from
   * ServiceResult). When present, renders a `<SuiscanLink>` strip below
   * the footer so the user can click through to verify the receipt
   * on-chain. The strip lives INSIDE the shell so the link stays visually
   * tied to the card it receipts.
   *
   * Required for `pay_api` consumers — every successful pay_api turn has
   * a paymentDigest and the user MUST be able to click through (audric
   * convention: every on-chain action surfaces its Suiscan link).
   */
  txDigest?: string;
}

export function MppCardShell({
  header,
  footer,
  children,
  className,
  bodyNoPadding,
  txDigest,
}: MppCardShellProps) {
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
      {/*
        SuiscanLink already brings its own `border-t` (see primitives.tsx),
        so the wrapper just provides horizontal padding + a small bottom
        gap. Adding `border-t` here would double-draw the separator.
      */}
      {txDigest && (
        <div className="px-3 pb-2">
          <SuiscanLink digest={txDigest} />
        </div>
      )}
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
 * "PRIME", "100 EVER"). Defaults to `tone="dark"` (subtle vendor label).
 *
 * Tone palette resolution:
 *   - dark / green / blue use Tailwind utilities backed by tokens defined
 *     in `globals.css` `@theme inline`.
 *   - purple uses inline `var(--color-purple*)` because audric's Tailwind
 *     v4 theme exposes `--color-purple` as a SINGLE token (no -400/-500
 *     ramp), so utility classes like `bg-purple-500/10` would silently
 *     no-op. The inline-style path resolves through the same token both
 *     light + dark themes already shift (line 211–213 vs 322–323 of
 *     globals.css).
 *
 * If you add a new tone, prefer Tailwind utilities. Use inline styles only
 * when the design system token doesn't have a shade ramp.
 */
const TONE_CLASS: Record<'dark' | 'green' | 'blue', string> = {
  dark: 'bg-surface-sunken text-fg-muted border border-border-subtle',
  green: 'bg-success-solid/10 text-success-solid border border-success-solid/20',
  blue: 'bg-info-solid/10 text-info-solid border border-info-solid/20',
};

const PURPLE_INLINE_STYLE: CSSProperties = {
  background: 'var(--color-purple-bg)',
  color: 'var(--color-purple)',
  border: '1px solid var(--color-purple)',
};

export function MppTag({
  children,
  tone = 'dark',
}: {
  children: ReactNode;
  tone?: 'dark' | 'purple' | 'green' | 'blue';
}) {
  const baseClass =
    'inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-mono uppercase tracking-[0.12em] shrink-0';
  if (tone === 'purple') {
    return (
      <span className={baseClass} style={PURPLE_INLINE_STYLE}>
        {children}
      </span>
    );
  }
  return <span className={cn(baseClass, TONE_CLASS[tone])}>{children}</span>;
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
