import { NextRequest, NextResponse } from 'next/server';
import type { TxDirection } from '@t2000/sdk';
import { getTransactionHistory, getSuiNetwork } from '@/lib/transaction-history';

export const runtime = 'nodejs';

export interface TxHistoryItem {
  digest: string;
  /** Coarse bucket: send | lending | swap | transaction */
  action: string;
  /** Fine-grained label (deposit, withdraw, payment_link, swap, …) */
  label?: string;
  /** `'in'` = user received, `'out'` = user spent. */
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
 * changes. Thin adapter around `getTransactionHistory()` — projects
 * the canonical {@link ChainTxRecord} into the legacy `TxHistoryItem`
 * wire shape expected by the dashboard.
 */
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address');
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') ?? '20', 10), 50);

  if (!address || !address.startsWith('0x')) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  try {
    const records = await getTransactionHistory(address, { limit });

    const items: TxHistoryItem[] = records.map((r) => ({
      digest: r.digest,
      action: r.action,
      label: r.label,
      direction: r.direction,
      amount: r.amount,
      asset: r.asset,
      counterparty: r.counterparty,
      timestamp: r.timestamp,
      gasCost: r.gasCost,
    }));

    return NextResponse.json({ items, network: getSuiNetwork() });
  } catch (err) {
    console.error('[history] Unexpected error:', err);
    return NextResponse.json({ items: [], network: getSuiNetwork() });
  }
}
