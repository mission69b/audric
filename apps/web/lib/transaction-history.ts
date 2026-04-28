// ---------------------------------------------------------------------------
// Canonical transaction-history fetcher — SINGLE SOURCE OF TRUTH for
// "what happened on this wallet recently". Both the `/api/history`
// (chain-only minimal view) and `/api/activity` (chain + AppEvent feed
// for the dashboard) routes are now thin adapters around this module.
//
// See [.cursor/rules/single-source-of-truth.mdc].
// ---------------------------------------------------------------------------

import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import {
  extractTxCommands,
  extractTxSender,
  parseSuiRpcTx,
  type SuiRpcTxBlock,
  type TransactionRecord,
  type TxDirection,
} from '@t2000/sdk';
import { env } from '@/lib/env';
import { getSuiRpcUrl } from '@/lib/sui-rpc';

const SUI_NETWORK = env.NEXT_PUBLIC_SUI_NETWORK;
const client = new SuiJsonRpcClient({ url: getSuiRpcUrl(), network: SUI_NETWORK });

const ALLOWANCE_PACKAGE_PREFIX = '0xd775fcc66eae26797654d435d751dea56b82eeb999de51fd285348e573b968ad';

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
  /** Resolved counterparty (recipient on outflows, sender on inflows from others). */
  counterparty?: string;
  timestamp: number;
  gasCost?: number;
  /** First Move call target on the tx (used for legacy-package filtering). */
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
 */
export async function getTransactionHistory(
  address: string,
  opts: GetTransactionHistoryOpts = {},
): Promise<ChainTxRecord[]> {
  const limit = Math.min(opts.limit ?? 20, 50);
  const skipOutgoing = opts.skipOutgoing ?? false;
  const incomingLimit = opts.incomingLimit ?? Math.min(limit, 15);
  const excludeLegacy = opts.excludeLegacyAllowance ?? true;

  const [outgoing, incoming] = await Promise.all([
    skipOutgoing
      ? Promise.resolve({ data: [] })
      : client
          .queryTransactionBlocks({
            filter: { FromAddress: address },
            options: { showEffects: true, showInput: true, showBalanceChanges: true },
            limit,
            order: 'descending',
          })
          .catch((err: unknown) => {
            console.error('[transaction-history] FromAddress query failed:', err);
            return { data: [] };
          }),
    client
      .queryTransactionBlocks({
        filter: { ToAddress: address },
        options: { showEffects: true, showInput: true, showBalanceChanges: true },
        limit: incomingLimit,
        order: 'descending',
      })
      .catch((err: unknown) => {
        console.error('[transaction-history] ToAddress query failed:', err);
        return { data: [] };
      }),
  ]);

  const seen = new Set<string>();
  const allTxns: SuiRpcTxBlock[] = [];

  for (const tx of outgoing.data ?? []) {
    if (seen.has(tx.digest)) continue;
    seen.add(tx.digest);
    allTxns.push(tx as unknown as SuiRpcTxBlock);
  }
  for (const tx of incoming.data ?? []) {
    if (seen.has(tx.digest)) continue;
    seen.add(tx.digest);
    allTxns.push(tx as unknown as SuiRpcTxBlock);
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
        moveCallTargets: [],
      });
    }
  }

  return records.slice(0, limit);
}

/**
 * Internal accessor for the underlying SUI network identifier.
 * Adapters may need this for wire-format `network` fields without
 * re-importing the env var.
 */
export function getSuiNetwork(): 'mainnet' | 'testnet' {
  return SUI_NETWORK;
}
