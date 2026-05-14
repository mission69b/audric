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
import {
  resolveCounterpartyDisplayMap,
  type CounterpartyDisplayMap,
} from '@/lib/activity-counterparty';
import { authenticateRequest, assertOwnsOrWatched } from '@/lib/auth';

export const runtime = 'nodejs';

const MPP_TREASURY = '0x76d70cf9d3ab7f714a35adf8766a2cb25929cae92ab4de54ff4dea0482b05012';

/**
 * Allowlist of `AppEvent.type` values that are emitted by live code
 * paths today. Any other type in the table is stale data from a
 * retired feature (Suggestions, Schedules, Auto-compound, Patterns —
 * all retired in S.7 / April 2026) and MUST NOT render in the feed.
 *
 * Live writers (audited 2026-05-10):
 *   - `pay`         — `app/api/services/{prepare,complete}/route.ts`
 *                     (MPP API service usage, outgoing)
 *   - `pay_received` — `app/api/payments/[slug]/verify/route.ts`
 *                     (incoming payment-link receipt)
 *
 * This allowlist is the route's defense-in-depth against stale rows
 * still in the DB. The companion one-shot purge script
 * (`scripts/purge-stale-app-events.mjs`) actually deletes them; this
 * filter is what protects the user during the window between deploy
 * and purge, and what protects against any future ECS write that
 * resurrects a retired type.
 */
const LIVE_APP_EVENT_TYPES = ['pay', 'pay_received'] as const;

/**
 * GET /api/activity?address=0x...&cursor=<ms-timestamp>&limit=20
 * Header: x-zklogin-jwt (required — SPEC 30 Phase 1A.5)
 *
 * Merges on-chain transaction history (via the canonical
 * `getTransactionHistory()`) with AppEvent rows (NeonDB). Supports
 * cursor-based pagination. Activity is a single chronological stream
 * — no `?type=` filter (chips were removed; the agent IS the filter
 * via natural language).
 *
 * [Activity rebuild / 2026-05-10] Chain rows include a `legs[]` array
 * with per-leg USD values (priced via `getTokenPrices`) so the UI can
 * render `1 USDC ↔ 987.60 MANIFEST · $1 → $2.89` for swaps and
 * `Payment Intent (3 ops) · -$10` for multi-op PTBs — instead of the
 * old single-leg picker that produced `Swapped $987.60 MANIFEST`
 * (treating token quantity as USD).
 *
 * SPEC 30 Phase 1A.5: caller must hold a valid zkLogin JWT. The
 * `?address=` parameter must either equal the caller's own address or
 * be in their `WatchAddress` watchlist — pre-fix this endpoint
 * accepted `?address=anyone` with no auth and exposed the user's
 * private `AppEvent` rows.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const address = searchParams.get('address');
  const cursorMs = searchParams.get('cursor') ? Number(searchParams.get('cursor')) : null;
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 50);

  if (!address || !address.startsWith('0x')) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const auth = await authenticateRequest(request);
  if ('error' in auth) return auth.error;
  const ownership = await assertOwnsOrWatched(auth.verified, address);
  if (ownership) return ownership;

  try {
    const [chainItems, appItems] = await Promise.all([
      fetchChainActivity(address, limit + 5),
      fetchAppEvents(address, limit + 5, cursorMs),
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
): Promise<ActivityItem[]> {
  const records = await getTransactionHistory(address, {
    limit: Math.min(limit, 50),
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
  // Collect counterparty addresses for display-label resolution
  // (saved contact name + Audric handle). Skips MPP_TREASURY since
  // it's a system address — `recordToActivityItem` rebrands it as
  // type `'pay'` and shows "Paid 1 USDC for service" instead of
  // "Sent ... to <treasury>".
  const counterpartyAddrs = new Set<string>();
  for (const r of records) {
    if (r.counterparty && r.counterparty !== MPP_TREASURY) {
      counterpartyAddrs.add(r.counterparty);
    }
  }

  const [priceMap, counterpartyMap] = await Promise.all([
    priceableCoinTypes.size > 0
      ? getTokenPrices([...priceableCoinTypes]).catch((err) => {
          console.warn('[activity] price fetch failed (degrading to no-USD):', err);
          return {} as Record<string, { price: number }>;
        })
      : Promise.resolve({} as Record<string, { price: number }>),
    counterpartyAddrs.size > 0
      ? resolveCounterpartyDisplayMap([...counterpartyAddrs], address).catch((err) => {
          console.warn('[activity] counterparty resolve failed (degrading to truncated 0x):', err);
          return {} as CounterpartyDisplayMap;
        })
      : Promise.resolve({} as CounterpartyDisplayMap),
  ]);

  const items: ActivityItem[] = [];
  for (const r of records) {
    const item = recordToActivityItem(r, priceMap, counterpartyMap);
    if (!item) continue;
    items.push(item);
  }

  return items;
}

async function fetchAppEvents(
  address: string,
  limit: number,
  cursorMs: number | null,
): Promise<ActivityItem[]> {
  const where: Record<string, unknown> = {
    address,
    // Defense-in-depth: stale-feature rows ('suggestion_*', 'schedule_*',
    // 'compound_*', 'follow_up', 'pattern_*', 'alert') never surface
    // even before the one-shot purge runs.
    type: { in: [...LIVE_APP_EVENT_TYPES] },
  };

  if (cursorMs) {
    where.createdAt = { lt: new Date(cursorMs) };
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
  counterpartyMap: CounterpartyDisplayMap,
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

  const counterpartyLabel = counterparty
    ? counterpartyMap[counterparty.toLowerCase()]
    : undefined;
  const title = buildTitle(
    type,
    legs,
    bundle.opCount || undefined,
    counterparty,
    counterpartyLabel,
  );

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
