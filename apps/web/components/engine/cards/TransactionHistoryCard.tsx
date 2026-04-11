'use client';

import { CardShell, fmtAmt, fmtRelativeTime, SUISCAN_TX_URL, SUISCAN_ICON } from './primitives';

interface TxRecord {
  digest: string;
  action: string;
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
  stake: '↗',
  unstake: '↙',
};

function getIcon(action: string): string {
  const lower = action.toLowerCase();
  for (const [key, icon] of Object.entries(ACTION_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return '•';
}

function isOutflow(action: string): boolean {
  const lower = action.toLowerCase();
  return lower.includes('send') || lower.includes('pay') || lower.includes('repay') || lower.includes('withdraw');
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

export function TransactionHistoryCard({ data }: { data: HistoryData }) {
  const txs = data.transactions.slice(0, 5);
  if (!txs.length) return null;

  const groups = groupByDate(txs);

  return (
    <CardShell
      title="Recent Transactions"
      badge={<span className="text-[10px] font-mono text-dim">{data.count} total</span>}
    >
      <div className="space-y-2">
        {Array.from(groups.entries()).map(([label, items]) => (
          <div key={label}>
            <span className="text-[10px] font-mono uppercase tracking-wider text-dim">{label}</span>
            <div className="mt-1 space-y-0.5">
              {items.map((tx) => {
                const outflow = isOutflow(tx.action);
                return (
                  <div key={tx.digest} className="flex items-center justify-between py-1 border-t border-border/30 font-mono text-[11px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-dim">{getIcon(tx.action)}</span>
                      <span className="text-foreground font-medium capitalize truncate">{tx.action}</span>
                      {tx.recipient && (
                        <span className="text-dim truncate max-w-[60px]">→ {tx.recipient.length > 10 ? `${tx.recipient.slice(0, 6)}...` : tx.recipient}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {tx.amount != null && tx.amount > 0 && (
                        <span className={outflow ? 'text-foreground' : 'text-emerald-400'}>
                          {outflow ? '−' : '+'}{fmtAmt(tx.amount)} {tx.asset ?? 'USDC'}
                        </span>
                      )}
                      <span className="text-dim text-[9px]">{fmtRelativeTime(toIso(tx.timestamp))}</span>
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
      {data.count > 5 && (
        <div className="mt-1.5 pt-1.5 border-t border-border/50 text-[10px] font-mono text-dim text-center">
          Showing {txs.length} of {data.count}
        </div>
      )}
    </CardShell>
  );
}
