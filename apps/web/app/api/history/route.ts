import { NextRequest, NextResponse } from 'next/server';
import type { TxDirection } from '@t2000/sdk';
import { getTransactionHistory, getSuiNetwork } from '@/lib/transaction-history';
import { authenticateAnalyticsRequest } from '@/lib/internal-auth';

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
 * Header: x-internal-key (engine + cron) OR x-zklogin-jwt (browser)
 *
 * Returns on-chain transaction history with parsed actions and balance
 * changes. Thin adapter around `getTransactionHistory()` — projects
 * the canonical {@link ChainTxRecord} into the legacy `TxHistoryItem`
 * wire shape expected by the dashboard.
 *
 * SPEC 30 Phase 1A.5: caller must hold a valid zkLogin JWT. The
 * `?address=` parameter must either equal the caller's own address or
 * be in their `WatchAddress` watchlist.
 *
 * Day 20e: dual-auth via `authenticateAnalyticsRequest()` — the engine's
 * `transaction_history` tool authenticates with `x-internal-key`
 * server-side. Pre-fix the engine silently 401'd here and fell back to
 * the direct Sui-RPC path, bypassing the canonical
 * `getTransactionHistory()` SSOT (the parser used by the dashboard).
 */
export async function GET(request: NextRequest) {
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') ?? '20', 10), 50);

  const auth = await authenticateAnalyticsRequest(request);
  if ('error' in auth) return auth.error;
  const { address } = auth;

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
