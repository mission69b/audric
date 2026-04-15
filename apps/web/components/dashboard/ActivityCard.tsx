'use client';

import type { ActivityItem } from '@/lib/activity-types';

const TYPE_ICONS: Record<string, { icon: string; bg: string; color: string }> = {
  send: { icon: '↗', bg: 'rgba(13,157,252,.1)', color: 'var(--color-info)' },
  receive: { icon: '↓', bg: 'rgba(60,193,78,.12)', color: 'var(--color-success)' },
  lending: { icon: '↑', bg: 'rgba(60,193,78,.12)', color: 'var(--color-success)' },
  swap: { icon: '⇄', bg: 'rgba(155,127,232,.1)', color: 'var(--color-purple)' },
  pay: { icon: '🤖', bg: 'rgba(13,157,252,.1)', color: 'var(--color-info)' },
  store_sale: { icon: '🎨', bg: 'rgba(155,127,232,.1)', color: 'var(--color-purple)' },
  pay_received: { icon: '🔗', bg: 'rgba(60,193,78,.12)', color: 'var(--color-success)' },
  autonomous: { icon: '✦', bg: 'rgba(60,193,78,.12)', color: 'var(--color-success)' },
  alert: { icon: '🚨', bg: 'rgba(227,175,37,.1)', color: 'var(--color-warning)' },
  contract: { icon: '📄', bg: 'var(--n700)', color: 'var(--muted)' },
  transaction: { icon: '📄', bg: 'var(--n700)', color: 'var(--muted)' },
  follow_up: { icon: '💬', bg: 'var(--n700)', color: 'var(--muted)' },
  schedule_confirm: { icon: '✅', bg: 'rgba(60,193,78,.12)', color: 'var(--color-success)' },
  schedule_execute: { icon: '🔄', bg: 'rgba(13,157,252,.1)', color: 'var(--color-info)' },
  schedule_reminder: { icon: '🔔', bg: 'rgba(155,127,232,.1)', color: 'var(--color-purple)' },
  compound_available: { icon: '🌱', bg: 'rgba(60,193,78,.12)', color: 'var(--color-success)' },
  auto_compound: { icon: '🌱', bg: 'rgba(60,193,78,.12)', color: 'var(--color-success)' },
};

const DEFAULT_ICON = { icon: '📄', bg: 'var(--n700)', color: 'var(--muted)' };

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

function truncDigest(digest: string): string {
  if (digest.length <= 16) return digest;
  return `${digest.slice(0, 6)}...${digest.slice(-6)}`;
}

interface ActivityCardProps {
  item: ActivityItem;
  network: string;
  onAction?: (flow: string) => void;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  wallet_connect: 'Wallet',
  card: 'Card',
  manual: 'Manual',
  qr: 'QR',
};

export function ActivityCard({ item, network, onAction }: ActivityCardProps) {
  const isScheduleConfirm = item.type === 'schedule_confirm';
  const isPayReceived = item.type === 'pay_received';
  const iconData = TYPE_ICONS[item.type] ?? DEFAULT_ICON;
  const isIn = item.direction === 'in' || isPayReceived;
  const sign = isScheduleConfirm ? '' : isIn ? '+' : item.direction === 'self' ? '' : '-';
  const amountStr = isScheduleConfirm
    ? (item.amount != null ? `$${item.amount.toFixed(2)} pending` : null)
    : (item.amount != null ? `${sign}$${item.amount.toFixed(2)}` : null);
  const amountColor = isScheduleConfirm ? 'text-accent' : isIn ? 'text-success' : item.type === 'pay' ? 'text-info' : 'text-foreground';
  const methodBadge = isPayReceived && item.paymentMethod ? PAYMENT_METHOD_LABELS[item.paymentMethod] ?? null : null;

  const explorerBase = network === 'testnet'
    ? 'https://suiscan.xyz/testnet/tx'
    : 'https://suiscan.xyz/mainnet/tx';
  const txUrl = item.digest ? `${explorerBase}/${item.digest}` : null;

  const isSaveable = isIn && (item.amount ?? 0) > 0 && item.type !== 'lending' && item.type !== 'schedule_confirm';
  const isReversible = item.type === 'autonomous' || item.type === 'schedule_execute';

  return (
    <div className={`rounded-lg border bg-surface hover:border-border-bright transition ${isScheduleConfirm ? 'border-accent/30' : 'border-border'}`}>
      {/* Main row */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm"
            style={{ background: iconData.bg, color: iconData.color }}
          >
            {iconData.icon}
          </div>
          <div className="min-w-0">
            <p className="text-[12px] text-foreground font-medium truncate">{item.title}</p>
            <p className="text-[10px] text-dim font-mono">
              {item.subtitle && <span>{item.subtitle} · </span>}
              {relativeTime(item.timestamp)}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0 ml-3">
          {amountStr && (
            <p className={`text-sm font-mono font-medium ${amountColor}`}>
              {amountStr}
            </p>
          )}
          {methodBadge && (
            <span className="inline-block font-mono text-[8px] tracking-wider uppercase px-1.5 py-0.5 rounded bg-success/10 text-success mt-0.5">
              {methodBadge}
            </span>
          )}
          {item.digest && (
            <p className="font-mono text-[9px] text-dim">{truncDigest(item.digest)}</p>
          )}
        </div>
      </div>

      {/* Tx actions row */}
      <div className="flex items-center gap-4 px-4 pb-2.5 pt-0">
        {isScheduleConfirm ? (
          <button
            onClick={() => onAction?.('automations')}
            className="font-mono text-[10px] tracking-[0.06em] uppercase text-accent hover:text-accent/80 transition"
          >
            Confirm in Automations →
          </button>
        ) : (
          <button
            onClick={() => {/* fires prompt via parent in future */}}
            className="font-mono text-[10px] tracking-[0.06em] uppercase text-muted hover:text-foreground transition"
          >
            Explain →
          </button>
        )}
        {isSaveable && (
          <button
            onClick={() => {}}
            className="font-mono text-[10px] tracking-[0.06em] uppercase text-success hover:text-success/80 transition"
          >
            Save it →
          </button>
        )}
        {isReversible && (
          <button
            onClick={() => {}}
            className="font-mono text-[10px] tracking-[0.06em] uppercase text-warning hover:text-warning/80 transition"
          >
            Reverse →
          </button>
        )}
        {txUrl && (
          <a
            href={txUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] tracking-[0.06em] uppercase text-info hover:text-info/80 transition"
            onClick={e => e.stopPropagation()}
          >
            Suiscan ↗
          </a>
        )}
      </div>
    </div>
  );
}

export function ActivityCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-border" />
        <div className="space-y-1.5 flex-1">
          <div className="h-3.5 w-36 bg-border rounded" />
          <div className="h-3 w-20 bg-border rounded" />
        </div>
        <div className="h-3.5 w-14 bg-border rounded" />
      </div>
    </div>
  );
}
