import { NextRequest, NextResponse } from 'next/server';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { getDecimalsForCoinType, resolveSymbol, SUI_TYPE } from '@t2000/sdk';
import { prisma } from '@/lib/prisma';
import type { ActivityItem, ActivityPage } from '@/lib/activity-types';

export const runtime = 'nodejs';

const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
const suiClient = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(SUI_NETWORK), network: SUI_NETWORK });

const ALLOWANCE_PACKAGE_PREFIX = '0xd775fcc66eae26797654d435d751dea56b82eeb999de51fd285348e573b968ad';

// Layer 1: Protocol-specific module names (high confidence, verified against SDK sources)
// NAVI: incentive_v\d+, lending, navi_adaptor, oracle_pro, flash_loan
// Suilend: suilend, obligation, reserve
// Cetus: cetus (package/module namespace)
// DeepBook: deepbook
const KNOWN_TARGETS: [RegExp, string][] = [
  [/::suilend|::obligation|::reserve/, 'lending'],
  [/::incentive_v\d+|::oracle_pro|::flash_loan|::lending|::navi_adaptor/, 'lending'],
  [/::cetus/, 'swap'],
  [/::deepbook/, 'swap'],
  [/::transfer::public_transfer/, 'send'],
];

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
  receive: [],
  swap: [],
  pay: ['pay', 'alert'],
};

/**
 * GET /api/activity?address=0x...&type=all&cursor=<ms-timestamp>&limit=20
 *
 * Merges on-chain transaction history (Sui RPC) with AppEvent rows (NeonDB).
 * Supports cursor-based pagination and type filtering.
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
  if (filterType === 'pay') return [];

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
  const allTxns: TxBlock[] = [];

  for (const tx of outgoing.data ?? []) {
    seen.add(tx.digest);
    allTxns.push(tx as unknown as TxBlock);
  }
  for (const tx of incoming.data ?? []) {
    if (!seen.has(tx.digest)) {
      seen.add(tx.digest);
      allTxns.push(tx as unknown as TxBlock);
    }
  }

  allTxns.sort((a, b) => Number(b.timestampMs ?? 0) - Number(a.timestampMs ?? 0));

  const items: ActivityItem[] = [];
  const allowedTypes = filterType !== 'all' ? TYPE_FILTER_MAP[filterType] ?? null : null;

  for (const tx of allTxns) {
    try {
      const parsed = parseTx(tx, address);
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
    };
  });
}

// ---------------------------------------------------------------------------
// On-chain transaction parsing (adapted from /api/history)
// ---------------------------------------------------------------------------

interface TxBlock {
  digest: string;
  timestampMs?: string;
  transaction?: unknown;
  effects?: { gasUsed?: { computationCost: string; storageCost: string; storageRebate: string } };
  balanceChanges?: BalanceChange[];
}

interface BalanceChange {
  owner: { AddressOwner?: string } | string;
  coinType: string;
  amount: string;
}

function resolveOwner(owner: BalanceChange['owner']): string | null {
  if (typeof owner === 'object' && owner.AddressOwner) return owner.AddressOwner;
  if (typeof owner === 'string') return owner;
  return null;
}

function extractSender(txBlock: unknown): string | null {
  try {
    if (!txBlock || typeof txBlock !== 'object') return null;
    const data = 'data' in txBlock ? (txBlock as Record<string, unknown>).data : undefined;
    if (!data || typeof data !== 'object') return null;
    return (data as Record<string, unknown>).sender as string ?? null;
  } catch {
    return null;
  }
}

function extractCommands(txBlock: unknown): { moveCallTargets: string[]; commandTypes: string[] } {
  const result = { moveCallTargets: [] as string[], commandTypes: [] as string[] };
  try {
    if (!txBlock || typeof txBlock !== 'object') return result;
    const data = 'data' in txBlock ? (txBlock as Record<string, unknown>).data : undefined;
    if (!data || typeof data !== 'object') return result;
    const inner = 'transaction' in (data as Record<string, unknown>)
      ? (data as Record<string, unknown>).transaction
      : undefined;
    if (!inner || typeof inner !== 'object') return result;
    const commands = 'commands' in (inner as Record<string, unknown>)
      ? (inner as Record<string, unknown>).commands
      : 'transactions' in (inner as Record<string, unknown>)
        ? (inner as Record<string, unknown>).transactions
        : undefined;
    if (!Array.isArray(commands)) return result;
    for (const cmd of commands as Record<string, unknown>[]) {
      if (cmd.MoveCall) {
        const mc = cmd.MoveCall as { package: string; module: string; function: string };
        result.moveCallTargets.push(`${mc.package}::${mc.module}::${mc.function}`);
        result.commandTypes.push('MoveCall');
      } else if (cmd.TransferObjects) {
        result.commandTypes.push('TransferObjects');
      }
    }
  } catch { /* best effort */ }
  return result;
}

function classifyAction(targets: string[], commandTypes: string[]): string {
  for (const target of targets) {
    for (const [pattern, label] of KNOWN_TARGETS) {
      if (pattern.test(target)) return label;
    }
  }
  if (commandTypes.includes('TransferObjects') && !commandTypes.includes('MoveCall')) return 'send';
  if (commandTypes.includes('MoveCall')) return 'contract';
  return 'transaction';
}

function truncAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

function buildTitle(action: string, direction: 'in' | 'out' | 'self', amount?: number, asset?: string, counterparty?: string): string {
  const amtStr = amount != null ? `$${amount.toFixed(2)}` : '';
  const assetStr = asset ?? '';

  switch (action) {
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

function parseTx(tx: TxBlock, address: string): ActivityItem | null {
  const { moveCallTargets, commandTypes } = extractCommands(tx.transaction);

  if (moveCallTargets.some((t) => t.startsWith(ALLOWANCE_PACKAGE_PREFIX))) {
    return null;
  }

  const sender = extractSender(tx.transaction);
  const isUserTx = sender === address;
  const action = classifyAction(moveCallTargets, commandTypes);
  const changes = tx.balanceChanges ?? [];

  const userInflows = changes.filter(
    (c) => resolveOwner(c.owner) === address && BigInt(c.amount) > BigInt(0) && c.coinType !== SUI_TYPE,
  );
  const userOutflows = changes.filter(
    (c) => resolveOwner(c.owner) === address && BigInt(c.amount) < BigInt(0) && c.coinType !== SUI_TYPE,
  );

  let direction: 'out' | 'in' | 'self' = 'self';
  let amount: number | undefined;
  let asset: string | undefined;
  let counterparty: string | undefined;

  if (userOutflows.length > 0 && userInflows.length === 0) {
    direction = 'out';
    const primary = userOutflows.sort((a, b) => Number(BigInt(a.amount) - BigInt(b.amount)))[0];
    const decimals = getDecimalsForCoinType(primary.coinType);
    amount = Math.round(Math.abs(Number(BigInt(primary.amount))) / 10 ** decimals * 100) / 100;
    asset = resolveSymbol(primary.coinType);
    const recipientChange = changes.find(
      (c) => resolveOwner(c.owner) !== address && c.coinType === primary.coinType && BigInt(c.amount) > BigInt(0),
    );
    counterparty = recipientChange ? resolveOwner(recipientChange.owner) ?? undefined : undefined;
  } else if (userInflows.length > 0 && userOutflows.length === 0) {
    direction = 'in';
    const primary = userInflows.sort((a, b) => Number(BigInt(b.amount) - BigInt(a.amount)))[0];
    const decimals = getDecimalsForCoinType(primary.coinType);
    amount = Math.round(Math.abs(Number(BigInt(primary.amount))) / 10 ** decimals * 100) / 100;
    asset = resolveSymbol(primary.coinType);
    if (!isUserTx && sender) counterparty = sender;
  } else if (userOutflows.length > 0 && userInflows.length > 0) {
    direction = 'out';
    const primary = userOutflows.sort((a, b) => Number(BigInt(a.amount) - BigInt(b.amount)))[0];
    const decimals = getDecimalsForCoinType(primary.coinType);
    amount = Math.round(Math.abs(Number(BigInt(primary.amount))) / 10 ** decimals * 100) / 100;
    asset = resolveSymbol(primary.coinType);
  } else {
    const suiChanges = changes.filter(
      (c) => resolveOwner(c.owner) === address && c.coinType === SUI_TYPE,
    );
    if (suiChanges.length > 0) {
      const netSui = suiChanges.reduce((s, c) => s + Number(BigInt(c.amount)), 0);
      if (Math.abs(netSui) > 1_000_000) {
        direction = netSui > 0 ? 'in' : 'out';
        amount = Math.round(Math.abs(netSui) / 1e9 * 100) / 100;
        asset = 'SUI';
      }
    }
  }

  let resolvedAction = action;
  const hasMoveCall = commandTypes.includes('MoveCall');
  const hasMultipleAssetTypes = new Set(
    [...userInflows, ...userOutflows].map((c) => c.coinType),
  ).size > 1;

  if (hasMultipleAssetTypes && userInflows.length > 0 && userOutflows.length > 0 && action !== 'lending') {
    resolvedAction = 'swap';
  } else if (direction === 'in' && !isUserTx) {
    resolvedAction = 'receive';
  } else if (isUserTx && hasMoveCall && (action === 'contract' || action === 'transaction')) {
    resolvedAction = direction === 'self' && !amount ? 'contract' : 'lending';
  } else if (direction === 'out' && !hasMoveCall) {
    resolvedAction = 'send';
  }

  const title = buildTitle(resolvedAction, direction, amount, asset, counterparty);

  return {
    id: tx.digest,
    source: 'chain',
    type: resolvedAction,
    title,
    amount,
    asset,
    direction,
    counterparty,
    digest: tx.digest,
    timestamp: Number(tx.timestampMs ?? 0),
  };
}
