import { prisma } from '@/lib/prisma';
import { getClient } from '@/lib/protocol-registry';

export interface DayBucket {
  date: string;
  count: number;
  types: Record<string, number>;
}

export interface ActionBreakdown {
  action: string;
  count: number;
  totalAmountUsd: number;
}

export interface ActivitySummary {
  period: string;
  totalTransactions: number;
  byAction: ActionBreakdown[];
  totalMovedUsd: number;
  netSavingsUsd: number;
  yieldEarnedUsd: number;
}

const ACTION_LABELS: Record<string, string> = {
  save: 'Saves',
  withdraw: 'Withdrawals',
  send: 'Sends',
  borrow: 'Borrows',
  repay: 'Repayments',
  swap: 'Swaps',
  pay: 'Services',
  claim: 'Claims',
  stake: 'Stakes',
  chain: 'On-chain',
};

function normalizeAction(type: string): string | null {
  const t = type.toLowerCase();
  if (t.includes('save') || t.includes('deposit')) return 'save';
  if (t.includes('withdraw')) return 'withdraw';
  if (t.includes('send') || t.includes('transfer')) return 'send';
  if (t.includes('borrow')) return 'borrow';
  if (t.includes('repay')) return 'repay';
  if (t.includes('swap')) return 'swap';
  if (t.includes('pay') || t.includes('service')) return 'pay';
  if (t.includes('claim')) return 'claim';
  if (t.includes('stake')) return 'stake';
  if (t === 'chain') return 'chain';
  if (t.includes('follow_up') || t.includes('briefing') || t.includes('goal')) return null;
  return null;
}

function periodToDate(period: string): Date {
  const now = new Date();
  switch (period) {
    case 'week': return new Date(now.getTime() - 7 * 86_400_000);
    case 'month': return new Date(now.getTime() - 30 * 86_400_000);
    case 'year': return new Date(now.getTime() - 365 * 86_400_000);
    case 'all': return new Date(0);
    default: return new Date(now.getTime() - 30 * 86_400_000);
  }
}

async function fetchAppEventBuckets(address: string, since: Date): Promise<Map<string, DayBucket>> {
  const events = await prisma.appEvent.findMany({
    where: { address, createdAt: { gte: since } },
    select: { type: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const map = new Map<string, DayBucket>();
  for (const e of events) {
    const date = e.createdAt.toISOString().slice(0, 10);
    const bucket = map.get(date) ?? { date, count: 0, types: {} };
    bucket.count++;
    bucket.types[e.type] = (bucket.types[e.type] ?? 0) + 1;
    map.set(date, bucket);
  }
  return map;
}

async function fetchChainBuckets(address: string, since: Date): Promise<Map<string, DayBucket>> {
  const client = getClient();
  const map = new Map<string, DayBucket>();
  const sinceMs = since.getTime();
  const seen = new Set<string>();
  const MAX_PAGES = 10;
  const PAGE_SIZE = 50;

  async function paginateQuery(filter: { FromAddress: string } | { ToAddress: string }) {
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      try {
        const res = await client.queryTransactionBlocks({
          filter,
          options: { showInput: true, showEffects: false },
          limit: PAGE_SIZE,
          order: 'descending',
          cursor,
        });

        let reachedOldTxns = false;
        for (const tx of res.data ?? []) {
          if (seen.has(tx.digest)) continue;
          seen.add(tx.digest);
          const ts = Number(tx.timestampMs ?? 0);
          if (ts === 0) continue;
          if (ts < sinceMs) { reachedOldTxns = true; break; }
          const date = new Date(ts).toISOString().slice(0, 10);
          const bucket = map.get(date) ?? { date, count: 0, types: {} };
          bucket.count++;
          bucket.types['chain'] = (bucket.types['chain'] ?? 0) + 1;
          map.set(date, bucket);
        }

        if (reachedOldTxns || !res.hasNextPage || !res.nextCursor) break;
        cursor = res.nextCursor;
      } catch {
        break;
      }
    }
  }

  try {
    await Promise.all([
      paginateQuery({ FromAddress: address }),
      paginateQuery({ ToAddress: address }),
    ]);
  } catch {
    // chain data is best-effort
  }

  return map;
}

function mergeBuckets(a: Map<string, DayBucket>, b: Map<string, DayBucket>): DayBucket[] {
  const merged = new Map<string, DayBucket>(a);
  for (const [date, bucket] of b) {
    const existing = merged.get(date);
    if (existing) {
      existing.count += bucket.count;
      for (const [type, count] of Object.entries(bucket.types)) {
        existing.types[type] = (existing.types[type] ?? 0) + count;
      }
    } else {
      merged.set(date, bucket);
    }
  }
  return [...merged.values()].sort((x, y) => x.date.localeCompare(y.date));
}

/**
 * Returns merged daily activity buckets from AppEvent + on-chain transactions.
 * Used by both the heatmap canvas and the activity summary.
 *
 * NOTE: AppEvent and chain data can overlap — a single on-chain tx that also
 * has an AppEvent will be counted in both sources. This is acceptable because
 * AppEvent provides categorization (save, send, etc.) while chain provides
 * coverage for txs not tracked by the app. Full dedup would require storing
 * digests on AppEvent and cross-referencing, which is a future optimization.
 */
export async function fetchActivityBuckets(address: string, days: number): Promise<DayBucket[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const [appBuckets, chainBuckets] = await Promise.all([
    fetchAppEventBuckets(address, since),
    fetchChainBuckets(address, since),
  ]);

  return mergeBuckets(appBuckets, chainBuckets);
}

/**
 * Returns a categorized activity summary including both AppEvent and on-chain transactions.
 * Augmented with yield data from portfolio snapshots.
 */
export async function fetchActivitySummary(address: string, period: string): Promise<ActivitySummary> {
  const since = periodToDate(period);

  const [events, buckets] = await Promise.all([
    prisma.appEvent.findMany({
      where: { address, createdAt: { gte: since } },
      select: { type: true, details: true },
    }),
    fetchChainBuckets(address, since),
  ]);

  const actionMap = new Map<string, { count: number; totalAmountUsd: number }>();

  for (const e of events) {
    const action = normalizeAction(e.type);
    if (!action) continue;

    const entry = actionMap.get(action) ?? { count: 0, totalAmountUsd: 0 };
    entry.count++;

    const details = (e.details ?? {}) as Record<string, unknown>;
    const amount = typeof details.amountUsd === 'number' ? details.amountUsd
      : typeof details.amount === 'number' ? details.amount : 0;
    entry.totalAmountUsd += amount;
    actionMap.set(action, entry);
  }

  let chainTxCount = 0;
  for (const bucket of buckets.values()) {
    chainTxCount += bucket.types['chain'] ?? 0;
  }
  if (chainTxCount > 0) {
    const existing = actionMap.get('chain') ?? { count: 0, totalAmountUsd: 0 };
    existing.count += chainTxCount;
    actionMap.set('chain', existing);
  }

  const byAction = [...actionMap.entries()]
    .map(([action, data]) => ({
      action: ACTION_LABELS[action] ?? action,
      count: data.count,
      totalAmountUsd: Math.round(data.totalAmountUsd * 100) / 100,
    }))
    .sort((a, b) => b.count - a.count);

  const totalTransactions = byAction.reduce((s, a) => s + a.count, 0);
  const totalMovedUsd = byAction.reduce((s, a) => s + a.totalAmountUsd, 0);

  const saves = actionMap.get('save')?.totalAmountUsd ?? 0;
  const withdrawals = actionMap.get('withdraw')?.totalAmountUsd ?? 0;
  const netSavingsUsd = saves - withdrawals;

  let yieldEarnedUsd = 0;
  try {
    const user = await prisma.user.findUnique({
      where: { suiAddress: address },
      select: { id: true },
    });
    if (user) {
      const yieldSnaps = await prisma.portfolioSnapshot.findMany({
        where: { userId: user.id, date: { gte: since } },
        select: { yieldEarnedUsd: true },
      });
      yieldEarnedUsd = yieldSnaps.reduce((s, snap) => s + (snap.yieldEarnedUsd ?? 0), 0);
    }
  } catch {
    // yield is supplementary
  }

  return {
    period,
    totalTransactions,
    byAction,
    totalMovedUsd: Math.round(totalMovedUsd * 100) / 100,
    netSavingsUsd: Math.round(netSavingsUsd * 100) / 100,
    yieldEarnedUsd: Math.round(yieldEarnedUsd * 100) / 100,
  };
}
