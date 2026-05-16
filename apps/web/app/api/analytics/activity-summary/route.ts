import { NextRequest, NextResponse } from 'next/server';
import { fetchActivitySummary } from '@/lib/activity-data';
import { authenticateAnalyticsRequest } from '@/lib/internal-auth';

export const runtime = 'nodejs';

/**
 * GET /api/analytics/activity-summary?period=month&address=0x...
 * Header: x-internal-key (engine + cron) OR x-zklogin-jwt (browser)
 * Query: address (read target — required for internal-key path;
 *                 optional for JWT path where it defaults to caller)
 *
 * Returns categorised activity breakdown from AppEvent + on-chain
 * transactions. The query-string `address` lets the engine's
 * `activity_summary` tool fetch a watched / saved-contact address
 * without spoofing the caller header (v0.49 universal address-aware
 * reads).
 *
 * SPEC 30 Phase 1A.5: caller identity is proven via verified zkLogin
 * JWT (was forgeable `x-sui-address` header). Watched-address reads
 * still allowed when the target is in the caller's `WatchAddress`
 * watchlist.
 *
 * Day 20d: dual-auth via `authenticateAnalyticsRequest()` — the engine
 * runs server-side and has no JWT, so it now authenticates with
 * `x-internal-key` (server-only, never in the browser). See
 * `lib/internal-auth.ts` for the helper + security rationale.
 */
export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get('period') ?? 'month';

  const auth = await authenticateAnalyticsRequest(request);
  if ('error' in auth) return auth.error;
  const { address } = auth;

  try {
    const summary = await fetchActivitySummary(address, period);
    return NextResponse.json(summary);
  } catch (err) {
    console.error('[activity-summary] Error:', err);
    return NextResponse.json({
      period,
      totalTransactions: 0,
      byAction: [],
      totalMovedUsd: 0,
      netSavingsUsd: 0,
      yieldEarnedUsd: 0,
    });
  }
}
