'use client';

// ActivityCard — single-row layout for the activity feed.
//
// Layout:
//   [28px round avatar]  [title]                                [right]
//                        [subtitle (USD today + relative time)]
//                        [bundle leg breakdown — bundles only]
//                        [EXPLAIN ›   SUISCAN ↗]
//
// Surface uses `bg-surface-sunken` + `border-border-subtle` + `rounded-md`.
// Avatar is a 28px round neutral chip with the kind glyph drawn in a
// semantic color. Right column shows the signed USD for chain rows
// (computed from `legs[].usdValue`) — error tone for outflows, success
// for inflows, accent for pending schedule confirms.
//
// [Activity rebuild / 2026-05-10] Pre-rebuild this component prefixed
// `$` to a token amount, producing `+$987.60 MANIFEST` for a 1 USDC →
// 987.60 MANIFEST swap (off by ~340x). Now we read `item.legs[]` (which
// the route prices via `getTokenPrices`) and render USD only when it
// represents real dollars. Token amounts are shown separately in the
// title (`Swapped 1.00 USDC for 987.60 MANIFEST`).

import type { ActivityItem, ActivityLeg } from '@/lib/activity-types';

const KIND_GLYPHS: Record<string, { glyph: string; color: string }> = {
  send: { glyph: '\u2197', color: 'var(--info-solid)' },
  receive: { glyph: '\u2193', color: 'var(--success-solid)' },
  lending: { glyph: '\u2191', color: 'var(--success-solid)' },
  swap: { glyph: '\u21C6', color: 'var(--info-solid)' },
  bundle: { glyph: '\u2630', color: 'var(--accent-primary)' },
  pay: { glyph: '\u25CE', color: 'var(--info-solid)' },
  store_sale: { glyph: '\u25C6', color: 'var(--color-purple)' },
  pay_received: { glyph: '\u2193', color: 'var(--success-solid)' },
  contract: { glyph: '\u25A1', color: 'var(--fg-secondary)' },
  transaction: { glyph: '\u25A1', color: 'var(--fg-secondary)' },
  follow_up: { glyph: '\u2026', color: 'var(--fg-secondary)' },
  schedule_confirm: { glyph: '\u2713', color: 'var(--success-solid)' },
  schedule_execute: { glyph: '\u21BB', color: 'var(--info-solid)' },
  schedule_reminder: { glyph: '\u23F0', color: 'var(--color-purple)' },
  compound_available: { glyph: '\u2726', color: 'var(--success-solid)' },
  auto_compound: { glyph: '\u2726', color: 'var(--success-solid)' },
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

function formatTokenAmount(amount: number, decimals: number): string {
  const dp = amount >= 1 ? 4 : amount >= 0.01 ? 6 : Math.min(decimals, 9);
  return amount.toFixed(dp).replace(/\.?0+$/, '');
}

function formatUsdSigned(value: number, sign: '+' | '-' | ''): string {
  if (value >= 1) return `${sign}$${value.toFixed(2)}`;
  if (value >= 0.01) return `${sign}$${value.toFixed(3)}`;
  return `${sign}<$0.01`;
}

interface ActivityCardProps {
  item: ActivityItem;
  network: string;
  onAction?: (flow: string) => void;
  // [Bug 3 / 2026-04-27] Wire EXPLAIN to engine.sendMessage(`Explain transaction ${digest}`).
  onExplainTx?: (digest: string) => void;
}

/**
 * Compute the signed USD figure for the right-side amount column.
 * Returns the magnitude + the sign. For chain rows, derives from
 * `legs[].usdValue`; for app rows (which don't have legs), falls
 * back to the old `amount`/`direction` shape.
 *
 * Returns `null` when there's no USD value to show (degraded prices,
 * unknown long-tail tokens, or rows that intentionally omit the
 * column like `schedule_reminder`).
 */
function computeRightUsd(item: ActivityItem): { amount: number; sign: '+' | '-' | '' } | null {
  // Schedule confirms render their own pending pill, not a USD.
  if (item.type === 'schedule_confirm') return null;

  if (item.legs && item.legs.length > 0) {
    // For chain rows: net OUT USD (what the user spent) is the
    // primary number. For pure inflow rows (withdraw, borrow,
    // receive), show net IN USD as a +.
    const outs = item.legs.filter((l) => l.direction === 'out');
    if (outs.length > 0) {
      const total = outs.reduce((s, l) => s + (l.usdValue ?? 0), 0);
      if (total > 0) return { amount: total, sign: '-' };
    }
    const ins = item.legs.filter((l) => l.direction === 'in');
    const totalIn = ins.reduce((s, l) => s + (l.usdValue ?? 0), 0);
    if (totalIn > 0) return { amount: totalIn, sign: '+' };
    return null;
  }

  // App-event row (no legs) — use the back-compat amount + direction.
  if (item.amount == null) return null;
  const isPayReceived = item.type === 'pay_received';
  const isIn = item.direction === 'in' || isPayReceived;
  const sign: '+' | '-' | '' = isIn ? '+' : item.direction === 'self' ? '' : '-';
  return { amount: item.amount, sign };
}

/**
 * Per-leg breakdown for a bundle's expanded view. Renders each leg
 * inline (single line), e.g. `-5.00 USDC · +4.443 SUI · +0.000639 GOLD`.
 * Stables get just the token amount; non-stables show `(usd today)`
 * after the symbol so the user can spot the 1-USDC-for-987-MANIFEST
 * pattern without doing math.
 */
function BundleLegBreakdown({ legs }: { legs: ActivityLeg[] }) {
  if (legs.length === 0) return null;
  return (
    <div className="font-mono text-[10px] tracking-[0.04em] text-fg-secondary mt-1.5 flex flex-wrap gap-x-2.5 gap-y-1">
      {legs.map((leg, i) => {
        const sign = leg.direction === 'out' ? '-' : '+';
        const tokenStr = formatTokenAmount(leg.amount, leg.decimals);
        const usdSuffix =
          leg.usdValue != null && !leg.isStable
            ? ` (~${formatUsdSigned(leg.usdValue, '').replace(/^[+-]/, '')})`
            : '';
        return (
          <span key={`${leg.coinType}-${i}`} className={leg.direction === 'out' ? 'text-error-fg' : 'text-success-solid'}>
            {sign}
            {tokenStr} {leg.asset}
            {usdSuffix}
          </span>
        );
      })}
    </div>
  );
}

export function ActivityCard({ item, network, onAction, onExplainTx }: ActivityCardProps) {
  const isScheduleConfirm = item.type === 'schedule_confirm';
  const isPayReceived = item.type === 'pay_received';
  const isBundle = item.type === 'bundle';
  const glyphData = KIND_GLYPHS[item.type] ?? DEFAULT_GLYPH;
  const isIn = item.direction === 'in' || isPayReceived;

  const rightUsd = computeRightUsd(item);
  const rightStr = isScheduleConfirm
    ? item.amount != null
      ? `$${item.amount.toFixed(2)} pending`
      : null
    : rightUsd
      ? formatUsdSigned(rightUsd.amount, rightUsd.sign)
      : null;
  const rightColor = isScheduleConfirm
    ? 'text-accent-primary'
    : rightUsd?.sign === '+' || (isIn && !isBundle)
      ? 'text-success-solid'
      : rightUsd?.sign === '-'
        ? 'text-error-fg'
        : 'text-fg-primary';

  const explorerBase = network === 'testnet'
    ? 'https://suiscan.xyz/testnet/tx'
    : 'https://suiscan.xyz/mainnet/tx';
  const txUrl = item.digest ? `${explorerBase}/${item.digest}` : null;

  return (
    <div
      className={[
        'flex items-start gap-3.5 px-4 py-3.5 rounded-md border bg-surface-sunken',
        isScheduleConfirm ? 'border-accent-primary/30' : 'border-border-subtle',
      ].join(' ')}
    >
      <div
        className="shrink-0 w-7 h-7 mt-0.5 rounded-full bg-border-subtle grid place-items-center text-sm"
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
        {isBundle && item.legs && <BundleLegBreakdown legs={item.legs} />}
        <div className="font-mono text-[9px] tracking-[0.1em] uppercase text-fg-muted mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {isScheduleConfirm ? (
            <button
              type="button"
              onClick={() => onAction?.('automations')}
              className="text-accent-primary hover:opacity-80 transition focus-visible:outline-none focus-visible:underline"
            >
              Confirm in Automations &rsaquo;
            </button>
          ) : item.digest && onExplainTx ? (
            <button
              type="button"
              onClick={() => onExplainTx(item.digest!)}
              className="text-fg-secondary hover:text-fg-primary transition focus-visible:outline-none focus-visible:underline"
            >
              Explain &rsaquo;
            </button>
          ) : null}
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

      {rightStr && (
        <div className={`shrink-0 mt-0.5 font-mono text-[13px] ${rightColor}`}>
          {rightStr}
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
