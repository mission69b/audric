'use client';

import { CardShell, fmtAmt, fmtRelativeTime, SUISCAN_TX_URL, SUISCAN_ICON } from './primitives';

interface TxRecord {
  digest: string;
  /** Coarse bucket: send / lending / swap / transaction. */
  action: string;
  /**
   * [v1.5.3] Finer-grained display label from engine
   * (deposit, withdraw, borrow, repay, payment_link, on-chain, …).
   * Falls back to `action` when missing (older SDK versions).
   */
  label?: string;
  amount?: number;
  asset?: string;
  recipient?: string;
  timestamp: string | number;
  gasCost?: number;
}

function toDate(ts: string | number): Date {
  if (typeof ts === 'number') return new Date(ts);
  const n = Number(ts);
  if (!isNaN(n) && n > 1e12) return new Date(n);
  return new Date(ts);
}

function toIso(ts: string | number): string {
  return toDate(ts).toISOString();
}

interface HistoryData {
  transactions: TxRecord[];
  count: number;
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
  'on-chain': '◆',
  lending: '◆',
};

/**
 * [v1.5.3] Friendly capitalized labels for the new finer-grained
 * `label` strings emitted by engine ≥ v0.45.0. Anything not in this
 * map falls through to a CSS-capitalized version of the raw label.
 */
const FRIENDLY_LABELS: Record<string, string> = {
  payment_link: 'Payment link',
  'on-chain': 'On-chain',
  unstake: 'Unstake',
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

function isOutflow(label: string): boolean {
  const lower = label.toLowerCase();
  return (
    lower.includes('send') ||
    lower.includes('pay') ||
    lower.includes('repay') ||
    lower.includes('withdraw') ||
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
    const label = d === today ? 'Today' : d === yesterday ? 'Yesterday' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(tx);
  }
  return groups;
}

/**
 * [v1.5.3] Show up to 10 rows by default (was 5). The engine caps
 * `transaction_history` at 50 with `maxResultSizeChars: 8000`, so
 * 10 is a comfortable fit while still feeling like a real list.
 *
 * If the user wants more, they can ask for a date filter or the
 * dashboard activity feed (which renders the full set).
 */
const VISIBLE_LIMIT = 10;

export function TransactionHistoryCard({ data }: { data: HistoryData }) {
  const txs = data.transactions.slice(0, VISIBLE_LIMIT);
  if (!txs.length) return null;

  const groups = groupByDate(txs);

  return (
    <CardShell
      title="Recent Transactions"
      badge={<span className="text-[10px] font-mono text-fg-muted">{data.count} total</span>}
    >
      <div className="space-y-2">
        {Array.from(groups.entries()).map(([label, items]) => (
          <div key={label}>
            <span className="text-[10px] font-mono uppercase tracking-wider text-fg-muted">{label}</span>
            <div className="mt-1 space-y-0.5">
              {items.map((tx) => {
                const rawLabel = tx.label ?? tx.action;
                const display = getDisplayLabel(rawLabel);
                const outflow = isOutflow(rawLabel);
                return (
                  <div key={tx.digest} className="flex items-center justify-between py-1 border-t border-border-subtle/30 font-mono text-[11px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-fg-muted">{getIcon(rawLabel)}</span>
                      <span className="text-fg-primary font-medium capitalize truncate">{display}</span>
                      {tx.recipient && (
                        <span className="text-fg-muted truncate max-w-[60px]">→ {tx.recipient.length > 10 ? `${tx.recipient.slice(0, 6)}...` : tx.recipient}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {tx.amount != null && tx.amount > 0 && (
                        <span className={outflow ? 'text-fg-primary' : 'text-success-solid'}>
                          {outflow ? '−' : '+'}{fmtAmt(tx.amount)} {tx.asset ?? 'USDC'}
                        </span>
                      )}
                      <span className="text-fg-muted text-[9px]">{fmtRelativeTime(toIso(tx.timestamp))}</span>
                      <a
                        href={`${SUISCAN_TX_URL}/${tx.digest}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-info-solid hover:opacity-70"
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
        <div className="mt-1.5 pt-1.5 border-t border-border-subtle/50 text-[10px] font-mono text-fg-muted text-center">
          Showing {txs.length} of {data.count}
        </div>
      )}
    </CardShell>
  );
}
