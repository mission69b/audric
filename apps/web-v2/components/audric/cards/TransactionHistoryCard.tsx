'use client';

import {
  AddressBadge,
  CardShell,
  fmtRelativeTime,
  SUISCAN_TX_URL,
  SUISCAN_ICON,
} from './primitives';

// TransactionHistoryCard — `transaction_history` tool renderer. Ported
// from `apps/web/components/engine/cards/TransactionHistoryCard.tsx` by
// Phase 5a.4 (renderer migration sweep, 2026-05-19). Verbatim except
// the legacy heuristic helper's `isNaN` → `Number.isNaN` lint cleanup.

function fmtTxAmount(n: number): string {
  if (n > 0 && n < 0.01) return n.toFixed(4);
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface TxRecord {
  digest: string;
  action: string;
  label?: string;
  amount?: number;
  asset?: string;
  recipient?: string;
  direction?: 'in' | 'out';
  timestamp: string | number;
  gasCost?: number;
}

function toDate(ts: string | number): Date {
  if (typeof ts === 'number') return new Date(ts);
  const n = Number(ts);
  if (!Number.isNaN(n) && n > 1e12) return new Date(n);
  return new Date(ts);
}

function toIso(ts: string | number): string {
  return toDate(ts).toISOString();
}

interface HistoryData {
  transactions: TxRecord[];
  count: number;
  address?: string;
  isSelfQuery?: boolean;
  suinsName?: string | null;
}

const ACTION_ICONS: Record<string, string> = {
  save: '↗',
  deposit: '↗',
  supply: '↗',
  withdraw: '↙',
  send: '→',
  transfer: '→',
  receive: '←',
  borrow: '↙',
  repay: '↑',
  swap: '↺',
  claim: '↗',
  pay: '⚡',
  payment_link: '⚡',
  invoice: '⚡',
  stake: '↗',
  unstake: '↙',
  liquidate: '⚠',
  lending: '◆',
  transaction: '◆',
  'on-chain': '◆',
};

const FRIENDLY_LABELS: Record<string, string> = {
  payment_link: 'Payment link',
  'on-chain': 'On-chain',
  unstake: 'Unstake',
  swap: 'Swap',
  send: 'Send',
  deposit: 'Deposit',
  withdraw: 'Withdraw',
  borrow: 'Borrow',
  repay: 'Repay',
  claim: 'Claim',
  stake: 'Stake',
  invoice: 'Invoice',
  lending: 'Lending',
  transaction: 'On-chain',
};

function getIcon(label: string): string {
  const lower = label.toLowerCase();
  if (ACTION_ICONS[lower]) return ACTION_ICONS[lower];
  for (const [key, icon] of Object.entries(ACTION_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return '•';
}

function getDisplayLabel(label: string): string {
  return FRIENDLY_LABELS[label.toLowerCase()] ?? label;
}

function legacyIsOutflow(label: string): boolean {
  const lower = label.toLowerCase();
  return (
    lower.includes('send') ||
    lower.includes('pay') ||
    lower.includes('repay') ||
    lower === 'deposit' ||
    lower === 'supply' ||
    lower === 'stake'
  );
}

function groupByDate(txs: TxRecord[]): Map<string, TxRecord[]> {
  const groups = new Map<string, TxRecord[]>();
  const now = new Date();
  const today = now.toDateString();
  const yesterday = new Date(now.getTime() - 86_400_000).toDateString();

  for (const tx of txs) {
    const date = toDate(tx.timestamp);
    const d = date.toDateString();
    const label =
      d === today
        ? 'Today'
        : d === yesterday
          ? 'Yesterday'
          : date.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            });
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(tx);
  }
  return groups;
}

const VISIBLE_LIMIT = 10;

export function TransactionHistoryCard({ data }: { data: HistoryData }) {
  const txs = data.transactions.slice(0, VISIBLE_LIMIT);
  if (!txs.length) return null;

  const groups = groupByDate(txs);
  const isWatched = data.isSelfQuery === false && !!data.address;
  const badge = isWatched ? (
    <span className="inline-flex items-center gap-2">
      <AddressBadge address={data.address!} suinsName={data.suinsName} />
      <span className="text-[10px] font-mono text-muted-foreground">
        {data.count} total
      </span>
    </span>
  ) : (
    <span className="text-[10px] font-mono text-muted-foreground">
      {data.count} total
    </span>
  );

  return (
    <CardShell title="Recent Transactions" badge={badge}>
      <div className="space-y-2">
        {Array.from(groups.entries()).map(([label, items]) => (
          <div key={label}>
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              {label}
            </span>
            <div className="mt-1 space-y-0.5">
              {items.map((tx) => {
                const rawLabel = tx.label ?? tx.action;
                const display = getDisplayLabel(rawLabel);
                const outflow =
                  tx.direction === 'out'
                    ? true
                    : tx.direction === 'in'
                      ? false
                      : legacyIsOutflow(rawLabel);
                return (
                  <div
                    key={tx.digest}
                    className="flex items-center justify-between py-1 border-t border-border/30 font-mono text-[11px]"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-muted-foreground">{getIcon(rawLabel)}</span>
                      <span className="text-foreground font-medium capitalize truncate">
                        {display}
                      </span>
                      {tx.recipient && (
                        <span className="text-muted-foreground truncate max-w-[60px]">
                          →{' '}
                          {tx.recipient.length > 10
                            ? `${tx.recipient.slice(0, 6)}...`
                            : tx.recipient}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {tx.amount != null && tx.amount > 0 && (
                        <span
                          className={
                            outflow ? 'text-foreground' : 'text-success'
                          }
                        >
                          {outflow ? '−' : '+'}
                          {fmtTxAmount(tx.amount)} {tx.asset ?? 'USDC'}
                        </span>
                      )}
                      <span className="text-muted-foreground text-[9px]">
                        {fmtRelativeTime(toIso(tx.timestamp))}
                      </span>
                      <a
                        href={`${SUISCAN_TX_URL}/${tx.digest}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-info hover:opacity-70"
                      >
                        {SUISCAN_ICON}
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {data.count > VISIBLE_LIMIT && (
        <div className="mt-1.5 pt-1.5 border-t border-border/50 text-[10px] font-mono text-muted-foreground text-center">
          Showing {txs.length} of {data.count}
        </div>
      )}
    </CardShell>
  );
}
