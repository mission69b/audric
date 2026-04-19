'use client';

// [PHASE 6] ActivityCard — re-skinned to match the design's single-row layout.
//
// Layout (per `design_handoff_audric/.../activity.jsx`):
//   [28px round avatar]  [title]                                [amount]
//                        [time mono]
//                        [EXPLAIN ›   SUISCAN ↗]
//
// Surface uses `bg-surface-sunken` + `border-border-subtle` + `rounded-md`.
// Avatar is a 28px round neutral chip (`bg-border-subtle`) with the kind
// glyph drawn in a semantic color. Inline mono links sit below the time.
// Right column shows the signed amount in mono — error tone for outflows,
// success for inflows, accent for pending schedule confirms.
//
// Behavior preserved: digest → suiscan link uses the network from the feed
// hook; schedule_confirm rows still surface the "Confirm in Automations →"
// link that routes via `onAction('automations')`. Two no-op inline buttons
// from the previous skin ("Save it →", "Reverse →") were removed because
// their onClick was `() => {}` — they had no behavior to preserve.

import type { ActivityItem } from '@/lib/activity-types';

const KIND_GLYPHS: Record<string, { glyph: string; color: string }> = {
  send: { glyph: '\u2197', color: 'var(--info-solid)' },
  receive: { glyph: '\u2193', color: 'var(--success-solid)' },
  lending: { glyph: '\u2191', color: 'var(--success-solid)' },
  swap: { glyph: '\u21C6', color: 'var(--info-solid)' },
  pay: { glyph: '\u25CE', color: 'var(--info-solid)' },
  store_sale: { glyph: '\u25C6', color: 'var(--color-purple)' },
  pay_received: { glyph: '\u2193', color: 'var(--success-solid)' },
  autonomous: { glyph: '\u2726', color: 'var(--success-solid)' },
  alert: { glyph: '!', color: 'var(--warning-solid)' },
  contract: { glyph: '\u25A1', color: 'var(--fg-secondary)' },
  transaction: { glyph: '\u25A1', color: 'var(--fg-secondary)' },
  follow_up: { glyph: '\u2026', color: 'var(--fg-secondary)' },
  schedule_confirm: { glyph: '\u2713', color: 'var(--success-solid)' },
  schedule_execute: { glyph: '\u21BB', color: 'var(--info-solid)' },
  schedule_reminder: { glyph: '\u23F0', color: 'var(--color-purple)' },
  compound_available: { glyph: '\u2726', color: 'var(--success-solid)' },
  auto_compound: { glyph: '\u2726', color: 'var(--success-solid)' },
  // [PHASE 6] suggestion rows are mocked in `lib/mocks/activity.ts` —
  // glyph matches the design's `'\u270E'` (pencil) on muted neutral.
  suggestion_confirmed: { glyph: '\u270E', color: 'var(--fg-muted)' },
  suggestion_snoozed: { glyph: '\u270E', color: 'var(--fg-muted)' },
};

const DEFAULT_GLYPH = { glyph: '\u25A1', color: 'var(--fg-secondary)' };

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface ActivityCardProps {
  item: ActivityItem;
  network: string;
  onAction?: (flow: string) => void;
}

export function ActivityCard({ item, network, onAction }: ActivityCardProps) {
  const isScheduleConfirm = item.type === 'schedule_confirm';
  const isPayReceived = item.type === 'pay_received';
  const glyphData = KIND_GLYPHS[item.type] ?? DEFAULT_GLYPH;
  const isIn = item.direction === 'in' || isPayReceived;
  const sign = isScheduleConfirm ? '' : isIn ? '+' : item.direction === 'self' ? '' : '-';
  const amountStr = isScheduleConfirm
    ? (item.amount != null ? `$${item.amount.toFixed(2)} pending` : null)
    : (item.amount != null ? `${sign}$${item.amount.toFixed(2)}` : null);
  const amountColor = isScheduleConfirm
    ? 'text-accent-primary'
    : isIn
      ? 'text-success-solid'
      : item.direction === 'out'
        ? 'text-error-fg'
        : 'text-fg-primary';

  const explorerBase = network === 'testnet'
    ? 'https://suiscan.xyz/testnet/tx'
    : 'https://suiscan.xyz/mainnet/tx';
  const txUrl = item.digest ? `${explorerBase}/${item.digest}` : null;

  return (
    <div
      className={[
        'flex items-center gap-3.5 px-4 py-3.5 rounded-md border bg-surface-sunken',
        isScheduleConfirm ? 'border-accent-primary/30' : 'border-border-subtle',
      ].join(' ')}
    >
      <div
        className="shrink-0 w-7 h-7 rounded-full bg-border-subtle grid place-items-center text-sm"
        style={{ color: glyphData.color }}
        aria-hidden="true"
      >
        {glyphData.glyph}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-[14px] text-fg-primary truncate">{item.title}</div>
        <div className="font-mono text-[9px] tracking-[0.08em] text-fg-muted mt-1">
          {item.subtitle && <span>{item.subtitle} &middot; </span>}
          {relativeTime(item.timestamp).toUpperCase()}
        </div>
        <div className="font-mono text-[9px] tracking-[0.1em] uppercase text-fg-muted mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {isScheduleConfirm ? (
            <button
              type="button"
              onClick={() => onAction?.('automations')}
              className="text-accent-primary hover:opacity-80 transition focus-visible:outline-none focus-visible:underline"
            >
              Confirm in Automations &rsaquo;
            </button>
          ) : (
            <span>Explain &rsaquo;</span>
          )}
          {txUrl && (
            <a
              href={txUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-info-solid hover:opacity-80 transition focus-visible:outline-none focus-visible:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Suiscan &#8599;
            </a>
          )}
        </div>
      </div>

      {amountStr && (
        <div className={`shrink-0 font-mono text-[13px] ${amountColor}`}>
          {amountStr}
        </div>
      )}
    </div>
  );
}

export function ActivityCardSkeleton() {
  return (
    <div className="flex items-center gap-3.5 px-4 py-3.5 rounded-md border border-border-subtle bg-surface-sunken animate-pulse">
      <div className="w-7 h-7 rounded-full bg-border-subtle shrink-0" />
      <div className="space-y-1.5 flex-1 min-w-0">
        <div className="h-3.5 w-36 bg-border-subtle rounded" />
        <div className="h-2.5 w-20 bg-border-subtle rounded" />
        <div className="h-2.5 w-28 bg-border-subtle rounded" />
      </div>
      <div className="h-3.5 w-14 bg-border-subtle rounded shrink-0" />
    </div>
  );
}
