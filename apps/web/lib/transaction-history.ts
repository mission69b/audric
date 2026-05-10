// ---------------------------------------------------------------------------
// Canonical transaction-history fetcher — SINGLE SOURCE OF TRUTH for
// "what happened on this wallet recently". Both the `/api/history`
// (chain-only minimal view) and `/api/activity` (chain + AppEvent feed
// for the dashboard) routes are now thin adapters around this module.
//
// See [.cursor/rules/single-source-of-truth.mdc].
//
// ---------------------------------------------------------------------------
// PR 7 (April 2026) — added a 3-layer scaling stack mirroring PR 1+2 for
// the BlockVision Indexer path:
//
//   1. **Upstash cache** (30s TTL) — stops re-fetching the same address
//      across dashboard auto-refresh cycles. Keyed by address + opts
//      fingerprint so the `receive`-only and `default` activity calls
//      coalesce independently.
//
//   2. **Cross-instance fetch lock** — `awaitOrFetch` from the engine
//      coalesces concurrent cache-misses for the same key across all
//      Vercel instances. 100 concurrent dashboard loads on the same
//      address → 1 RPC fan-out instead of 100.
//
//   3. **Per-direction retry** — wraps the raw `client.queryTransactionBlocks`
//      calls in a 3-attempt exponential backoff so transient 429s from
//      the BlockVision Sui RPC endpoint absorb cleanly. Both directions
//      retry independently so a 429 on FromAddress doesn't poison
//      ToAddress.
//
// Telemetry (visible at `/admin/scaling`):
//   - `sui_rpc.requests` (counter, tag: direction=from|to, result=ok|429|other)
//   - `tx_history.cache_hit` (counter, tag: source=cache|miss)
// ---------------------------------------------------------------------------

import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { awaitOrFetch, getTelemetrySink } from '@t2000/engine';
import {
  extractTxCommands,
  extractTxSender,
  parseSuiRpcTx,
  type SuiRpcTxBlock,
  type TransactionLeg,
  type TransactionRecord,
  type TxDirection,
} from '@t2000/sdk';
import { env } from '@/lib/env';
import { getSuiRpcUrl } from '@/lib/sui-rpc';
import {
  getTxHistoryCacheStore,
  txHistoryCacheKey,
  TX_HISTORY_TTL_SEC,
} from '@/lib/upstash-tx-history-cache';

const SUI_NETWORK = env.NEXT_PUBLIC_SUI_NETWORK;
const client = new SuiJsonRpcClient({ url: getSuiRpcUrl(), network: SUI_NETWORK });

const ALLOWANCE_PACKAGE_PREFIX = '0xd775fcc66eae26797654d435d751dea56b82eeb999de51fd285348e573b968ad';

// PR 7 retry config — sized for transient 429s from BlockVision RPC.
// 3 attempts × ~1s backoff (250ms + 750ms) = max ~2s extra latency on
// degraded conditions. Past 3 attempts we surface the empty array and
// let the route degrade gracefully (same behaviour as before PR 7).
const RPC_RETRY_ATTEMPTS = 3;
const RPC_RETRY_BASE_MS = 250;

export interface ChainTxRecord {
  digest: string;
  /** Coarse bucket: `'send' | 'lending' | 'swap' | 'transaction' | 'pay' | 'receive' | 'contract'`. */
  action: string;
  /** Fine-grained label from the SDK parser (`'deposit'`, `'withdraw'`, `'payment_link'`, …). */
  label?: string;
  /** Sender of the transaction (address that signed). */
  sender?: string;
  /** Whether the queried address signed the transaction. */
  isUserTx: boolean;
  /** `'in'` = user received, `'out'` = user spent, `undefined` = no detectable change. */
  direction?: TxDirection;
  amount?: number;
  asset?: string;
  /**
   * All non-zero user balance legs for this transaction (added in the
   * activity rebuild / 2026-05-10). Length 1 for single-write txs, 2
   * for swaps, >2 for bundles. The activity route prices these via
   * `getTokenPrices` to render swap + bundle rows truthfully.
   */
  legs: TransactionLeg[];
  /** Resolved counterparty (recipient on outflows, sender on inflows from others). */
  counterparty?: string;
  timestamp: number;
  gasCost?: number;
  /** Every Move call target on the tx (used for legacy-package filtering + bundle detection). */
  moveCallTargets: string[];
}

export interface GetTransactionHistoryOpts {
  /** Max chain transactions to return (default 20, max 50). */
  limit?: number;
  /** Skip the outgoing query (used by activity feed when filter === 'receive'). */
  skipOutgoing?: boolean;
  /** Override the incoming query limit (default `Math.min(limit, 15)`). */
  incomingLimit?: number;
  /** Drop transactions touching the legacy allowance package. Default true. */
  excludeLegacyAllowance?: boolean;
}

/**
 * Fetch a wallet's recent on-chain history, parsed and de-duplicated.
 *
 * Combines `FromAddress` + `ToAddress` queries, dedupes by digest,
 * sorts by timestamp DESC, runs each through the canonical SDK parser,
 * and returns a unified `ChainTxRecord[]` that both `/api/history`
 * (chain-only minimal view) and `/api/activity` (chain + AppEvent feed)
 * map to their respective wire shapes.
 *
 * Errors on either side query are caught and surfaced as empty arrays
 * (degrade-gracefully — same behaviour the legacy routes had).
 *
 * PR 7: results are cached in Upstash for 30s. Concurrent cache-misses
 * coalesce via `awaitOrFetch` — only one instance fans out the actual
 * RPC fetch; the rest poll the cache and serve the same result.
 */
export async function getTransactionHistory(
  address: string,
  opts: GetTransactionHistoryOpts = {},
): Promise<ChainTxRecord[]> {
  const limit = Math.min(opts.limit ?? 20, 50);
  const skipOutgoing = opts.skipOutgoing ?? false;
  const incomingLimit = opts.incomingLimit ?? Math.min(limit, 15);
  const excludeLegacy = opts.excludeLegacyAllowance ?? true;

  const cacheKey = txHistoryCacheKey(address, { limit, skipOutgoing, incomingLimit, excludeLegacy });
  const cache = getTxHistoryCacheStore();
  const sink = getTelemetrySink();

  // Cache hit short-circuit (no lock needed — read-only).
  const hit = await cache.get(cacheKey).catch((err) => {
    console.warn('[transaction-history] cache get failed (degrading):', err);
    return null;
  });
  if (hit) {
    sink.counter('tx_history.cache_hit', { source: 'cache' });
    return hit.records;
  }
  sink.counter('tx_history.cache_hit', { source: 'miss' });

  // Cache miss — coalesce concurrent fetches across instances. Followers
  // poll the same cache key until the leader writes; if the leader dies
  // (lease expires) the follower falls through to a direct fetch.
  return awaitOrFetch(
    `tx-history-lock:${cacheKey}`,
    async () => {
      const records = await fetchTransactionHistoryFresh(address, {
        limit,
        skipOutgoing,
        incomingLimit,
        excludeLegacy,
      });
      // Write cache as the LAST act so followers polling pollCache() see
      // the result the instant we're done. Cache write failure is logged
      // but non-fatal — followers will time out and fall through.
      await cache
        .set(cacheKey, { records, cachedAt: Date.now() }, TX_HISTORY_TTL_SEC)
        .catch((err) => console.warn('[transaction-history] cache set failed (non-fatal):', err));
      return records;
    },
    {
      pollCache: async () => {
        const polled = await cache.get(cacheKey).catch(() => null);
        return polled ? polled.records : null;
      },
    },
  );
}

/**
 * Direct (uncached) fetch path — runs the parallel FromAddress / ToAddress
 * queries with retry, dedupes by digest, parses each tx through the
 * canonical SDK parser. Called by `getTransactionHistory` only on cache
 * miss (and once per address per 30s under steady load).
 */
async function fetchTransactionHistoryFresh(
  address: string,
  opts: { limit: number; skipOutgoing: boolean; incomingLimit: number; excludeLegacy: boolean },
): Promise<ChainTxRecord[]> {
  const { limit, skipOutgoing, incomingLimit, excludeLegacy } = opts;

  const [outgoing, incoming] = await Promise.all([
    skipOutgoing
      ? Promise.resolve({ data: [] })
      : queryTxBlocksWithRetry('from', { FromAddress: address }, limit),
    queryTxBlocksWithRetry('to', { ToAddress: address }, incomingLimit),
  ]);

  const seen = new Set<string>();
  const allTxns: SuiRpcTxBlock[] = [];

  // The retry helper returns `data: unknown[]` to keep the helper's type
  // signature decoupled from `@mysten/sui` internals. We cast at the
  // boundary because the SDK guarantees every entry has a `digest`.
  for (const tx of (outgoing.data ?? []) as SuiRpcTxBlock[]) {
    if (seen.has(tx.digest)) continue;
    seen.add(tx.digest);
    allTxns.push(tx);
  }
  for (const tx of (incoming.data ?? []) as SuiRpcTxBlock[]) {
    if (seen.has(tx.digest)) continue;
    seen.add(tx.digest);
    allTxns.push(tx);
  }

  allTxns.sort((a, b) => Number(b.timestampMs ?? 0) - Number(a.timestampMs ?? 0));

  const records: ChainTxRecord[] = [];

  for (const tx of allTxns) {
    try {
      const { moveCallTargets } = extractTxCommands(tx.transaction);
      if (excludeLegacy && moveCallTargets.some((t) => t.startsWith(ALLOWANCE_PACKAGE_PREFIX))) {
        continue;
      }

      const record: TransactionRecord = parseSuiRpcTx(tx, address);
      const sender = extractTxSender(tx.transaction) ?? undefined;
      const isUserTx = sender === address;

      let counterparty: string | undefined = record.recipient;
      if (!counterparty && record.direction === 'in' && !isUserTx && sender) {
        counterparty = sender;
      }

      records.push({
        digest: record.digest,
        action: record.action,
        label: record.label,
        sender,
        isUserTx,
        direction: record.direction,
        amount: record.amount,
        asset: record.asset,
        legs: record.legs,
        counterparty,
        timestamp: record.timestamp,
        gasCost: record.gasCost,
        moveCallTargets,
      });
    } catch (err) {
      console.error('[transaction-history] parse error for', tx.digest, err);
      records.push({
        digest: tx.digest,
        action: 'transaction',
        isUserTx: false,
        timestamp: Number(tx.timestampMs ?? 0),
        legs: [],
        moveCallTargets: [],
      });
    }
  }

  return records.slice(0, limit);
}

/**
 * Wrap one direction of `client.queryTransactionBlocks` with retry +
 * telemetry. Returns the canonical `{ data: [] }` shape on terminal
 * failure so the caller can degrade gracefully (matches pre-PR-7
 * behaviour where `.catch()` returned the same empty shape).
 *
 * Backoff: 250ms, 750ms (3 attempts total). Sized for transient 429
 * spikes from BlockVision RPC — long enough that the upstream rate
 * limiter resets between attempts, short enough that we don't blow
 * the dashboard's perceived load time.
 */
async function queryTxBlocksWithRetry(
  direction: 'from' | 'to',
  filter: { FromAddress: string } | { ToAddress: string },
  limit: number,
): Promise<{ data: unknown[] }> {
  const sink = getTelemetrySink();
  let lastErr: unknown = null;

  for (let attempt = 0; attempt < RPC_RETRY_ATTEMPTS; attempt++) {
    try {
      const result = await client.queryTransactionBlocks({
        filter,
        options: { showEffects: true, showInput: true, showBalanceChanges: true },
        limit,
        order: 'descending',
      });
      sink.counter('sui_rpc.requests', { direction, result: 'ok' });
      return result as unknown as { data: unknown[] };
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      const result = status === 429 ? '429' : 'other';
      sink.counter('sui_rpc.requests', { direction, result });

      // Don't retry on the final attempt — fall through to the error log.
      if (attempt === RPC_RETRY_ATTEMPTS - 1) break;
      // Don't retry non-429 errors (4xx other than 429 = our bug, not theirs).
      if (status && status !== 429 && status >= 400 && status < 500) break;

      const delay = RPC_RETRY_BASE_MS * Math.pow(3, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  console.error(
    `[transaction-history] ${direction === 'from' ? 'FromAddress' : 'ToAddress'} query failed after ${RPC_RETRY_ATTEMPTS} attempts:`,
    lastErr,
  );
  return { data: [] };
}

/**
 * Internal accessor for the underlying SUI network identifier.
 * Adapters may need this for wire-format `network` fields without
 * re-importing the env var.
 */
export function getSuiNetwork(): 'mainnet' | 'testnet' {
  return SUI_NETWORK;
}
