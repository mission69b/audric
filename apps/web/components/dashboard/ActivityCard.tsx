'use client';

import type { ActivityItem } from '@/lib/activity-types';

const TYPE_ICONS: Record<string, string> = {
  send: '\u2191',
  receive: '\u2193',
  lending: '\uD83C\uDFE6',
  swap: '\u21C4',
  pay: '\u26A1',
  alert: '\uD83D\uDEA8',
  contract: '\uD83D\uDCC4',
  transaction: '\uD83D\uDCC4',
};

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
}

export function ActivityCard({ item, network }: ActivityCardProps) {
  const icon = TYPE_ICONS[item.type] ?? '\uD83D\uDCC4';
  const isIn = item.direction === 'in';
  const sign = isIn ? '+' : item.direction === 'self' ? '' : '-';
  const amountStr = item.amount != null ? `${sign}$${item.amount.toFixed(2)}` : null;

  const explorerBase = network === 'testnet'
    ? 'https://suiscan.xyz/testnet/tx'
    : 'https://suiscan.xyz/mainnet/tx';
  const txUrl = item.digest ? `${explorerBase}/${item.digest}` : null;

  const Wrapper = txUrl ? 'a' : 'div';
  const linkProps = txUrl
    ? { href: txUrl, target: '_blank', rel: 'noopener noreferrer' }
    : {};

  return (
    <Wrapper
      {...linkProps}
      className="flex items-center justify-between py-3 px-1 -mx-1 rounded-lg hover:bg-surface/50 transition group"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-base w-7 text-center shrink-0">{icon}</span>
        <div className="min-w-0">
          <p className="text-sm text-foreground font-medium truncate">{item.title}</p>
          <p className="text-xs text-muted font-mono">
            {relativeTime(item.timestamp)}
            {item.subtitle && <span className="ml-2">{item.subtitle}</span>}
          </p>
        </div>
      </div>
      <div className="text-right shrink-0 ml-3 flex items-center gap-2">
        {amountStr && (
          <p className={`text-sm font-mono font-medium ${isIn ? 'text-success' : 'text-foreground'}`}>
            {amountStr}
          </p>
        )}
        {txUrl && (
          <svg
            className="w-3.5 h-3.5 text-dim group-hover:text-muted transition shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        )}
      </div>
    </Wrapper>
  );
}

export function ActivityCardSkeleton() {
  return (
    <div className="flex items-center justify-between py-3 px-1 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-full bg-border" />
        <div className="space-y-1.5">
          <div className="h-3.5 w-36 bg-border rounded" />
          <div className="h-3 w-20 bg-border rounded" />
        </div>
      </div>
      <div className="h-3.5 w-14 bg-border rounded" />
    </div>
  );
}
