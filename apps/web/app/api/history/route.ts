import { NextRequest, NextResponse } from 'next/server';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import {
  parseSuiRpcTx,
  type SuiRpcTxBlock,
  type TransactionRecord,
  type TxDirection,
} from '@t2000/sdk';

export const runtime = 'nodejs';

const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(SUI_NETWORK), network: SUI_NETWORK });

export interface TxHistoryItem {
  digest: string;
  /** Coarse bucket: send | lending | swap | transaction */
  action: string;
  /** Fine-grained label (deposit, withdraw, payment_link, swap, …) */
  label?: string;
  /**
   * `'in'` = user received, `'out'` = user spent. Computed from
   * actual on-chain balance changes (NOT from the label string).
   * `undefined` when no user balance change is detectable.
   */
  direction?: TxDirection;
  amount?: number;
  asset?: string;
  /** Counterparty address (only set for outflows with a clear recipient). */
  counterparty?: string;
  timestamp: number;
  gasCost?: number;
}

/**
 * GET /api/history?address=0x...&limit=20
 *
 * Returns on-chain transaction history with parsed actions and balance
 * changes. Queries both outgoing (FromAddress) and incoming (ToAddress)
 * transactions. Parsing is delegated to `@t2000/sdk`'s shared
 * `parseSuiRpcTx` so this endpoint, the engine's `transaction_history`
 * tool, and the dashboard `/api/activity` route all classify transactions
 * identically.
 */
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address');
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') ?? '20', 10), 50);

  if (!address || !address.startsWith('0x')) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  try {
    const [outgoing, incoming] = await Promise.all([
      client.queryTransactionBlocks({
        filter: { FromAddress: address },
        options: { showEffects: true, showInput: true, showBalanceChanges: true },
        limit,
        order: 'descending',
      }).catch((err) => {
        console.error('[history] FromAddress query failed:', err?.message);
        return { data: [] };
      }),
      client.queryTransactionBlocks({
        filter: { ToAddress: address },
        options: { showEffects: true, showInput: true, showBalanceChanges: true },
        limit: Math.min(limit, 10),
        order: 'descending',
      }).catch((err) => {
        console.error('[history] ToAddress query failed:', err?.message);
        return { data: [] };
      }),
    ]);

    const seen = new Set<string>();
    const allTxns: SuiRpcTxBlock[] = [];

    for (const tx of (outgoing.data ?? [])) {
      seen.add(tx.digest);
      allTxns.push(tx as unknown as SuiRpcTxBlock);
    }
    for (const tx of (incoming.data ?? [])) {
      if (!seen.has(tx.digest)) {
        seen.add(tx.digest);
        allTxns.push(tx as unknown as SuiRpcTxBlock);
      }
    }

    allTxns.sort((a, b) => Number(b.timestampMs ?? 0) - Number(a.timestampMs ?? 0));

    const items: TxHistoryItem[] = allTxns.slice(0, limit).map((tx) => {
      try {
        const record = parseSuiRpcTx(tx, address);
        return toHistoryItem(record);
      } catch (err) {
        console.error('[history] Parse error for', tx.digest, err);
        return {
          digest: tx.digest,
          action: 'transaction',
          timestamp: Number(tx.timestampMs ?? 0),
        };
      }
    });

    return NextResponse.json({ items, network: SUI_NETWORK });
  } catch (err) {
    console.error('[history] Unexpected error:', err);
    return NextResponse.json({ items: [], network: SUI_NETWORK });
  }
}

/**
 * Map the canonical {@link TransactionRecord} to this endpoint's
 * historical wire shape. The only field rename is `recipient` →
 * `counterparty` to match the existing dashboard contract; everything
 * else passes through unchanged.
 */
function toHistoryItem(record: TransactionRecord): TxHistoryItem {
  return {
    digest: record.digest,
    action: record.action,
    label: record.label,
    direction: record.direction,
    amount: record.amount,
    asset: record.asset,
    counterparty: record.recipient,
    timestamp: record.timestamp,
    gasCost: record.gasCost,
  };
}
