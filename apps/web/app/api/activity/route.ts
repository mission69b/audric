import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { ActivityItem, ActivityLeg, ActivityPage } from '@/lib/activity-types';
import {
  getTransactionHistory,
  getSuiNetwork,
  type ChainTxRecord,
} from '@/lib/transaction-history';
import { getTokenPrices } from '@/lib/portfolio';
import {
  STABLE_SYMBOLS,
  buildTitle,
  bundleSubtitle,
  detectBundle,
} from '@/lib/activity-formatting';

export const runtime = 'nodejs';

const MPP_TREASURY = '0x76d70cf9d3ab7f714a35adf8766a2cb25929cae92ab4de54ff4dea0482b05012';

/**
 * Map filter chip → set of resolved `ActivityItem.type` values that
 * should pass through. `'savings'` covers any lending bucket
 * (`'lending'` action), regardless of the fine-grained label.
 *
 * [Activity rebuild / 2026-05-10] `'pay'` no longer references
 * `'alert'` (no production writer in AppEvent table — confirmed via
 * audit). Bundle txs always pass through filter `'all'` (they don't
 * have a clean filter mapping since they may touch multiple types).
 */
const TYPE_FILTER_MAP: Record<string, string[]> = {
  savings: ['lending'],
  send: ['send'],
  receive: ['receive'],
  swap: ['swap'],
  pay: ['pay'],
};

const APP_EVENT_TYPE_MAP: Record<string, string[]> = {
  savings: [],
  send: [],
  receive: ['pay_received'],
  swap: [],
  pay: ['pay', 'pay_received'],
};

/**
 * GET /api/activity?address=0x...&type=all&cursor=<ms-timestamp>&limit=20
 *
 * Merges on-chain transaction history (via the canonical
 * `getTransactionHistory()`) with AppEvent rows (NeonDB). Supports
 * cursor-based pagination and type filtering.
 *
 * [Activity rebuild / 2026-05-10] Chain rows now include a `legs[]`
 * array with per-leg USD values (priced via `getTokenPrices`) so the
 * UI can render `1 USDC ↔ 987.60 MANIFEST · $1 → $2.89` for swaps and
 * `Bundle (3 ops) · -$10` for multi-op PTBs — instead of the old
 * single-leg picker that produced `Swapped $987.60 MANIFEST` (treating
 * token quantity as USD).
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

  // Collect every unique non-stable coinType across every leg in this
  // page so we hit `getTokenPrices` ONCE for the whole page (typically
  // 5–10 unique types) instead of per-row. Stables short-circuit the
  // price lookup since price ≈ 1.00.
  const priceableCoinTypes = new Set<string>();
  for (const r of records) {
    for (const leg of r.legs) {
      if (!STABLE_SYMBOLS.has(leg.asset)) {
        priceableCoinTypes.add(leg.coinType);
      }
    }
  }
  const priceMap =
    priceableCoinTypes.size > 0
      ? await getTokenPrices([...priceableCoinTypes]).catch((err) => {
          console.warn('[activity] price fetch failed (degrading to no-USD):', err);
          return {} as Record<string, { price: number }>;
        })
      : ({} as Record<string, { price: number }>);

  const items: ActivityItem[] = [];
  const allowedTypes = filterType !== 'all' ? TYPE_FILTER_MAP[filterType] ?? null : null;

  for (const r of records) {
    const item = recordToActivityItem(r, priceMap);
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

/**
 * Convert a canonical {@link ChainTxRecord} to an `ActivityItem` for
 * the dashboard feed. Layers two dashboard-specific overrides on top
 * of the canonical parser output:
 *
 *   - `counterparty === MPP_TREASURY` ⇒ rebrand as `'pay'`
 *   - inflow from a different sender ⇒ rebrand as `'receive'`
 *
 * Plus the activity-rebuild logic:
 *   - Bundle detection via `detectBundle()` → type `'bundle'`
 *   - Per-leg pricing via `priceMap` → `legs[i].usdValue`
 *
 * Returns `null` if the record can't be mapped (legacy allowance
 * filtering already happens inside `getTransactionHistory`).
 */
function recordToActivityItem(
  r: ChainTxRecord,
  priceMap: Record<string, { price: number }>,
): ActivityItem | null {
  const legs: ActivityLeg[] = r.legs.map((leg) => {
    const isStable = STABLE_SYMBOLS.has(leg.asset);
    const price = isStable ? 1 : priceMap[leg.coinType]?.price ?? null;
    const usdValue = price !== null ? leg.amount * price : null;
    return {
      coinType: leg.coinType,
      asset: leg.asset,
      decimals: leg.decimals,
      amount: leg.amount,
      direction: leg.direction,
      usdValue,
      isStable,
    };
  });

  const bundle = detectBundle(legs, r.moveCallTargets);
  const direction: 'in' | 'out' | 'self' = r.direction ?? 'self';
  const counterparty = r.counterparty;

  let type: string = bundle.isBundle ? 'bundle' : r.action;
  if (!bundle.isBundle) {
    if (direction === 'in' && !r.isUserTx && type !== 'lending' && type !== 'swap') {
      type = 'receive';
    }
    if (counterparty === MPP_TREASURY) {
      type = 'pay';
    }
  }

  const title = buildTitle(type, legs, bundle.opCount || undefined, counterparty);

  return {
    id: r.digest,
    source: 'chain',
    type,
    title,
    subtitle: bundleSubtitle(legs, type),
    legs,
    amount: r.amount,
    asset: r.asset,
    direction,
    counterparty,
    digest: r.digest,
    timestamp: r.timestamp,
    bundleOpCount: bundle.isBundle ? bundle.opCount : undefined,
  };
}
