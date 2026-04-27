import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { ActivityItem, ActivityPage } from '@/lib/activity-types';
import {
  getTransactionHistory,
  getSuiNetwork,
  type ChainTxRecord,
} from '@/lib/transaction-history';

export const runtime = 'nodejs';

const MPP_TREASURY = '0x76d70cf9d3ab7f714a35adf8766a2cb25929cae92ab4de54ff4dea0482b05012';

/**
 * Map filter chip → set of resolved `ActivityItem.type` values that
 * should pass through. `'savings'` covers any lending bucket
 * (`'lending'` action), regardless of the fine-grained label.
 */
const TYPE_FILTER_MAP: Record<string, string[]> = {
  savings: ['lending'],
  send: ['send'],
  receive: ['receive'],
  swap: ['swap'],
  pay: ['pay', 'alert'],
};

const APP_EVENT_TYPE_MAP: Record<string, string[]> = {
  savings: [],
  send: [],
  receive: ['pay_received'],
  swap: [],
  pay: ['pay', 'pay_received', 'alert'],
};

/**
 * GET /api/activity?address=0x...&type=all&cursor=<ms-timestamp>&limit=20
 *
 * Merges on-chain transaction history (via the canonical
 * `getTransactionHistory()`) with AppEvent rows (NeonDB). Supports
 * cursor-based pagination and type filtering.
 *
 * Chain reads are delegated to `lib/transaction-history.ts`; this
 * route layers dashboard-specific overrides (`MPP_TREASURY` →
 * `'pay'`, inflows from another sender → `'receive'`) on top of the
 * canonical parser output, plus the AppEvent merge + de-dup by digest.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const address = searchParams.get('address');
  const filterType = searchParams.get('type') ?? 'all';
  const cursorMs = searchParams.get('cursor') ? Number(searchParams.get('cursor')) : null;
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 50);

  if (!address || !address.startsWith('0x')) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  try {
    const [chainItems, appItems] = await Promise.all([
      fetchChainActivity(address, limit + 5, filterType),
      fetchAppEvents(address, limit + 5, cursorMs, filterType),
    ]);

    const appDigests = new Set(appItems.filter((e) => e.digest).map((e) => e.digest!));
    const deduped = chainItems.filter((c) => !c.digest || !appDigests.has(c.digest));

    let merged = [...deduped, ...appItems].sort((a, b) => b.timestamp - a.timestamp);

    if (cursorMs) {
      merged = merged.filter((item) => item.timestamp < cursorMs);
    }

    const page = merged.slice(0, limit);
    const nextCursor = page.length === limit ? String(page[page.length - 1].timestamp) : null;

    const result: ActivityPage = { items: page, nextCursor, network: getSuiNetwork() };
    return NextResponse.json(result);
  } catch (err) {
    console.error('[activity] Error:', err);
    return NextResponse.json({ items: [], nextCursor: null, network: getSuiNetwork() });
  }
}

async function fetchChainActivity(
  address: string,
  limit: number,
  filterType: string,
): Promise<ActivityItem[]> {
  const skipOutgoing = filterType === 'receive';
  const incomingLimit = filterType === 'receive' ? Math.min(limit, 50) : Math.min(limit, 15);

  const records = await getTransactionHistory(address, {
    limit: Math.min(limit, 50),
    skipOutgoing,
    incomingLimit,
  });

  const items: ActivityItem[] = [];
  const allowedTypes = filterType !== 'all' ? TYPE_FILTER_MAP[filterType] ?? null : null;

  for (const r of records) {
    const item = recordToActivityItem(r);
    if (!item) continue;
    if (allowedTypes && !allowedTypes.includes(item.type)) continue;
    items.push(item);
  }

  return items;
}

async function fetchAppEvents(
  address: string,
  limit: number,
  cursorMs: number | null,
  filterType: string,
): Promise<ActivityItem[]> {
  const where: Record<string, unknown> = { address };

  if (cursorMs) {
    where.createdAt = { lt: new Date(cursorMs) };
  }

  if (filterType !== 'all') {
    const types = APP_EVENT_TYPE_MAP[filterType];
    if (!types || types.length === 0) return [];
    where.type = { in: types };
  }

  const events = await prisma.appEvent.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return events.map((e) => {
    const details = (e.details ?? {}) as Record<string, unknown>;
    return {
      id: e.id,
      source: 'app' as const,
      type: e.type,
      title: e.title,
      subtitle: details.service as string | undefined,
      amount: typeof details.amount === 'number' ? details.amount : undefined,
      asset: details.asset as string | undefined,
      direction: details.direction as 'in' | 'out' | 'self' | undefined,
      digest: e.digest ?? undefined,
      timestamp: e.createdAt.getTime(),
      paymentMethod: typeof details.paymentMethod === 'string' ? details.paymentMethod : undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// On-chain transaction → ActivityItem
// ---------------------------------------------------------------------------

function truncAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

function buildTitle(
  type: string,
  direction: 'in' | 'out' | 'self',
  amount?: number,
  asset?: string,
  counterparty?: string,
): string {
  const amtStr = amount != null ? `$${amount.toFixed(2)}` : '';
  const assetStr = asset ?? '';

  switch (type) {
    case 'pay':
      return `Paid ${amtStr} for service`.trim();
    case 'send':
      return counterparty
        ? `Sent ${amtStr} ${assetStr} to ${truncAddr(counterparty)}`.trim()
        : `Sent ${amtStr} ${assetStr}`.trim();
    case 'receive':
      return counterparty
        ? `Received ${amtStr} ${assetStr} from ${truncAddr(counterparty)}`.trim()
        : `Received ${amtStr} ${assetStr}`.trim();
    case 'lending':
      if (direction === 'out') return `Saved ${amtStr} ${assetStr} into NAVI`.trim();
      if (direction === 'in') return `Withdrew ${amtStr} ${assetStr} from NAVI`.trim();
      return `DeFi interaction ${amtStr} ${assetStr}`.trim();
    case 'swap':
      return `Swapped ${amtStr} ${assetStr}`.trim();
    case 'contract':
      return `Contract call ${amtStr}`.trim();
    default:
      return `Transaction ${amtStr}`.trim();
  }
}

/**
 * Convert a canonical {@link ChainTxRecord} to an `ActivityItem` for
 * the dashboard feed. Layers two dashboard-specific overrides on top
 * of the canonical parser output:
 *
 *   - `counterparty === MPP_TREASURY` ⇒ rebrand as `'pay'`
 *   - inflow from a different sender ⇒ rebrand as `'receive'`
 *
 * Returns `null` if the record can't be mapped (legacy allowance
 * filtering already happens inside `getTransactionHistory`, so we
 * don't repeat it here).
 */
function recordToActivityItem(r: ChainTxRecord): ActivityItem | null {
  // Map the SDK direction (`'in' | 'out' | undefined`) to the
  // dashboard's tri-state (`'in' | 'out' | 'self'`). Undefined means
  // we couldn't detect a user balance change — usually a self-call /
  // contract interaction.
  const direction: 'in' | 'out' | 'self' = r.direction ?? 'self';
  const counterparty = r.counterparty;

  let type: string = r.action;
  if (direction === 'in' && !r.isUserTx && type !== 'lending' && type !== 'swap') {
    type = 'receive';
  }
  if (counterparty === MPP_TREASURY) {
    type = 'pay';
  }

  const title = buildTitle(type, direction, r.amount, r.asset, counterparty);

  return {
    id: r.digest,
    source: 'chain',
    type,
    title,
    amount: r.amount,
    asset: r.asset,
    direction,
    counterparty,
    digest: r.digest,
    timestamp: r.timestamp,
  };
}
