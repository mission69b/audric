import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

export const runtime = 'nodejs';

const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
const suiClient = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(SUI_NETWORK), network: SUI_NETWORK });

interface DayBucket {
  date: string; // YYYY-MM-DD
  count: number;
  types: Record<string, number>;
}

/**
 * GET /api/analytics/activity-heatmap?address=0x...&days=365
 *
 * Returns daily activity counts from AppEvent + on-chain transactions.
 * Used by ActivityHeatmapCanvas for the GitHub-style contribution grid.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const address = searchParams.get('address');
  const days = Math.min(parseInt(searchParams.get('days') ?? '365', 10), 365);

  if (!address || !address.startsWith('0x')) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  try {
    const [appBuckets, chainBuckets] = await Promise.all([
      fetchAppEventBuckets(address, since),
      fetchChainBuckets(address, days),
    ]);

    const merged = mergeBuckets(appBuckets, chainBuckets);

    const totalEvents = merged.reduce((s, d) => s + d.count, 0);
    const activeDays = merged.filter((d) => d.count > 0).length;
    const maxCount = merged.reduce((m, d) => Math.max(m, d.count), 0);

    return NextResponse.json({
      address,
      days,
      buckets: merged,
      summary: { totalEvents, activeDays, maxCount, periodDays: days },
    });
  } catch (err) {
    console.error('[activity-heatmap] Error:', err);
    return NextResponse.json({ address, days, buckets: [], summary: { totalEvents: 0, activeDays: 0, maxCount: 0, periodDays: days } });
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

async function fetchChainBuckets(address: string, days: number): Promise<Map<string, DayBucket>> {
  const map = new Map<string, DayBucket>();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceMs = since.getTime();
  const seen = new Set<string>();
  const MAX_PAGES = 10;
  const PAGE_SIZE = 50;

  async function paginateQuery(filter: { FromAddress: string } | { ToAddress: string }) {
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      try {
        const res = await suiClient.queryTransactionBlocks({
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

  const sorted = [...merged.values()].sort((x, y) => x.date.localeCompare(y.date));
  return sorted;
}
