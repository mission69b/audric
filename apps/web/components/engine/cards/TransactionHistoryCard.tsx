'use client';

import { AddressBadge, CardShell, fmtRelativeTime, SUISCAN_TX_URL, SUISCAN_ICON } from './primitives';

/**
 * Transaction-history-specific amount formatter.
 *
 * Differs from the shared `fmtAmt` (which falls into 6-decimal mode for
 * any value < 1) — for tx history rows that produces eyesores like
 * `+0.100000 USDC` for a $0.10 borrow.
 *
 * Rules:
 *   - amount >= 0.01 → 2 decimals (e.g. `0.10`, `1.00`, `1,234.56`)
 *   - 0 < amount < 0.01 → 4 decimals (true dust where 2dp would round to 0)
 */
function fmtTxAmount(n: number): string {
  if (n > 0 && n < 0.01) return n.toFixed(4);
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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
  /**
   * [v0.46.2] Direction of the user's principal balance change on
   * this tx — `'in'` if the user received the asset, `'out'` if they
   * spent it. Computed from on-chain balance flows by the SDK, NOT
   * from the textual label, so opaque actions (`swap`, `router`,
   * unknown contracts) still render the correct sign. Older engine
   * versions don't emit this; we fall back to a label-based heuristic.
   */
  direction?: 'in' | 'out';
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
  /** [v0.49] Stamped by the engine's transaction_history tool. */
  address?: string;
  /** [v0.49] False for watched-address reads. */
  isSelfQuery?: boolean;
  /**
   * [v1.2 SuiNS] Original SuiNS name when the user passed
   * `address: "alex.sui"`. Surfaced on the watched-address chip.
   */
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

/**
 * [v1.5.3] Friendly capitalized labels for the new finer-grained
 * `label` strings emitted by engine ≥ v0.45.0. Anything not in this
 * map falls through to a CSS-capitalized version of the raw label.
 */
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

/**
 * Legacy heuristic for inferring sign from the textual label, kept as
 * a fallback for older engine versions that don't emit `direction`.
 * Engine ≥ v0.46.2 always emits `direction` from on-chain balance
 * flows, so this branch should be dead code in production.
 */
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
  const isWatched = data.isSelfQuery === false && !!data.address;
  const badge = isWatched ? (
    <span className="inline-flex items-center gap-2">
      <AddressBadge address={data.address!} suinsName={data.suinsName} />
      <span className="text-[10px] font-mono text-fg-muted">{data.count} total</span>
    </span>
  ) : (
    <span className="text-[10px] font-mono text-fg-muted">{data.count} total</span>
  );

  return (
    <CardShell
      title="Recent Transactions"
      badge={badge}
    >
      <div className="space-y-2">
        {Array.from(groups.entries()).map(([label, items]) => (
          <div key={label}>
            <span className="text-[10px] font-mono uppercase tracking-wider text-fg-muted">{label}</span>
            <div className="mt-1 space-y-0.5">
              {items.map((tx) => {
                const rawLabel = tx.label ?? tx.action;
                const display = getDisplayLabel(rawLabel);
                const outflow =
                  tx.direction === 'out' ? true
                  : tx.direction === 'in' ? false
                  : legacyIsOutflow(rawLabel);
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
                          {outflow ? '−' : '+'}{fmtTxAmount(tx.amount)} {tx.asset ?? 'USDC'}
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
