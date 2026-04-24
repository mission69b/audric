import { NextRequest, NextResponse } from 'next/server';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import {
  extractTxCommands,
  extractTxSender,
  parseSuiRpcTx,
  type SuiRpcTxBlock,
  type TransactionRecord,
} from '@t2000/sdk';
import { prisma } from '@/lib/prisma';
import type { ActivityItem, ActivityPage } from '@/lib/activity-types';

export const runtime = 'nodejs';

const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
const suiClient = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(SUI_NETWORK), network: SUI_NETWORK });

const ALLOWANCE_PACKAGE_PREFIX = '0xd775fcc66eae26797654d435d751dea56b82eeb999de51fd285348e573b968ad';
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

// [SIMPLIFICATION DAY 12.5] Dropped `follow_up` + `schedule` defensive
// backstops — UI no longer exposes them and the autonomy stack that emitted
// schedule_* / follow_up event types is gone. Stale `?type=follow_up` URLs
// fall through to the empty default and return zero rows.
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
 * Merges on-chain transaction history (Sui RPC) with AppEvent rows
 * (NeonDB). Supports cursor-based pagination and type filtering.
 *
 * Transaction parsing is delegated to `@t2000/sdk`'s shared
 * `parseSuiRpcTx` (same parser used by the engine's
 * `transaction_history` tool and the `/api/history` route).
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
      fetchChainActivity(address, limit + 5, cursorMs, filterType),
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

    const result: ActivityPage = { items: page, nextCursor, network: SUI_NETWORK };
    return NextResponse.json(result);
  } catch (err) {
    console.error('[activity] Error:', err);
    return NextResponse.json({ items: [], nextCursor: null, network: SUI_NETWORK });
  }
}

async function fetchChainActivity(
  address: string,
  limit: number,
  _cursorMs: number | null,
  filterType: string,
): Promise<ActivityItem[]> {
  const skipOutgoing = filterType === 'receive';
  const incomingLimit = filterType === 'receive' ? Math.min(limit, 50) : Math.min(limit, 15);

  const [outgoing, incoming] = await Promise.all([
    skipOutgoing
      ? { data: [] }
      : suiClient.queryTransactionBlocks({
          filter: { FromAddress: address },
          options: { showEffects: true, showInput: true, showBalanceChanges: true },
          limit: Math.min(limit, 50),
          order: 'descending',
        }).catch(() => ({ data: [] })),
    suiClient.queryTransactionBlocks({
      filter: { ToAddress: address },
      options: { showEffects: true, showInput: true, showBalanceChanges: true },
      limit: incomingLimit,
      order: 'descending',
    }).catch(() => ({ data: [] })),
  ]);

  const seen = new Set<string>();
  const allTxns: SuiRpcTxBlock[] = [];

  for (const tx of outgoing.data ?? []) {
    seen.add(tx.digest);
    allTxns.push(tx as unknown as SuiRpcTxBlock);
  }
  for (const tx of incoming.data ?? []) {
    if (!seen.has(tx.digest)) {
      seen.add(tx.digest);
      allTxns.push(tx as unknown as SuiRpcTxBlock);
    }
  }

  allTxns.sort((a, b) => Number(b.timestampMs ?? 0) - Number(a.timestampMs ?? 0));

  const items: ActivityItem[] = [];
  const allowedTypes = filterType !== 'all' ? TYPE_FILTER_MAP[filterType] ?? null : null;

  for (const tx of allTxns) {
    try {
      const parsed = parseChainTx(tx, address);
      if (!parsed) continue;
      if (allowedTypes && !allowedTypes.includes(parsed.type)) continue;
      items.push(parsed);
    } catch {
      // skip unparseable
    }
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
// On-chain transaction → ActivityItem (uses shared SDK parser)
// ---------------------------------------------------------------------------

/**
 * Truncate an address for display (`0xabcd…1234`). Falls back to the
 * raw value when shorter than the cutoff.
 */
function truncAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

/**
 * Build the activity-feed title from a resolved {@link TransactionRecord}.
 */
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
 * Convert a raw RPC tx to an `ActivityItem` for the dashboard feed.
 *
 * Logic:
 *   1. Drop transactions touching the legacy allowance package — those
 *      are scaffolding noise.
 *   2. Run the canonical SDK parser to get action / direction / amount.
 *   3. Apply two dashboard-specific overrides:
 *        - `recipient === MPP_TREASURY` ⇒ rebrand as `'pay'`
 *        - inflow from a different sender ⇒ rebrand as `'receive'`
 *   4. Build a human-readable title.
 */
function parseChainTx(tx: SuiRpcTxBlock, address: string): ActivityItem | null {
  const { moveCallTargets } = extractTxCommands(tx.transaction);
  if (moveCallTargets.some((t) => t.startsWith(ALLOWANCE_PACKAGE_PREFIX))) {
    return null;
  }

  const record: TransactionRecord = parseSuiRpcTx(tx, address);
  const sender = extractTxSender(tx.transaction);
  const isUserTx = sender === address;

  // Map the SDK direction (`'in' | 'out' | undefined`) to the
  // dashboard's tri-state (`'in' | 'out' | 'self'`). Undefined means
  // we couldn't detect a user balance change — usually a self-call /
  // contract interaction.
  const direction: 'in' | 'out' | 'self' = record.direction ?? 'self';

  // Counterparty rules:
  //   - For outflows: SDK populates `recipient` with the address that
  //     received the principal asset.
  //   - For inflows from a different sender: surface the sender as the
  //     counterparty so the title reads "Received from 0xabc…".
  let counterparty: string | undefined = record.recipient;
  if (!counterparty && direction === 'in' && !isUserTx && sender) {
    counterparty = sender;
  }

  // Type resolution: prefer the explicit action bucket, then layer
  // dashboard-only refinements on top.
  let type: string = record.action;
  if (direction === 'in' && !isUserTx && type !== 'lending' && type !== 'swap') {
    type = 'receive';
  }
  if (counterparty === MPP_TREASURY) {
    type = 'pay';
  }

  const title = buildTitle(type, direction, record.amount, record.asset, counterparty);

  return {
    id: record.digest,
    source: 'chain',
    type,
    title,
    amount: record.amount,
    asset: record.asset,
    direction,
    counterparty,
    digest: record.digest,
    timestamp: record.timestamp,
  };
}
