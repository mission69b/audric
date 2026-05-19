import { isValidSuiAddress } from "@mysten/sui/utils";
import { type NextRequest, NextResponse } from "next/server";
import { authenticateAnalyticsRequest } from "@/lib/internal-auth";
import { getPortfolio } from "@/lib/portfolio";

/**
 * GET /api/portfolio?address=0x...
 * Header: x-internal-key (engine + cron) OR x-zklogin-jwt (browser)
 *
 * Single source of truth for "what is this wallet worth right now".
 * Thin adapter around `getPortfolio()` (see [lib/portfolio.ts]).
 *
 * Returns the canonical {@link Portfolio} shape directly — wallet
 * coins (priced), per-symbol allocations, NAVI positions, derived net
 * worth, estimated daily yield, source flag, and price timestamp.
 *
 * SPEC 30 Phase 1A.5: caller must hold a valid zkLogin JWT. The
 * `?address=` parameter must either equal the caller's own address or
 * be in their `WatchAddress` watchlist — pre-fix this endpoint accepted
 * `?address=anyone` with no auth (unauthenticated-read class).
 *
 * Day 20e: dual-auth via `authenticateAnalyticsRequest()` — the engine
 * runs server-side and has no JWT, so it authenticates with
 * `x-internal-key`. Pre-fix the engine silently 401'd here and fell
 * back to the in-engine BlockVision path, bypassing the SSOT — engine
 * and dashboard COULD drift on degraded reads.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateAnalyticsRequest(request);
  if ("error" in auth) {
    return auth.error;
  }
  const { address } = auth;
  if (!isValidSuiAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  try {
    const portfolio = await getPortfolio(address);

    return NextResponse.json(
      {
        address: portfolio.address,
        netWorthUsd: portfolio.netWorthUsd,
        walletValueUsd: portfolio.walletValueUsd,
        walletAllocations: portfolio.walletAllocations,
        wallet: portfolio.wallet,
        positions: {
          savings: portfolio.positions.savings,
          borrows: portfolio.positions.borrows,
          savingsRate: portfolio.positions.savingsRate,
          healthFactor: portfolio.positions.healthFactor,
          maxBorrow: portfolio.positions.maxBorrow,
          pendingRewards: portfolio.positions.pendingRewards,
          supplies: portfolio.positions.supplies,
          borrowsDetail: portfolio.positions.borrowsDetail,
        },
        defiValueUsd: portfolio.defiValueUsd,
        defiSource: portfolio.defiSource,
        defiPricedAt: portfolio.defiPricedAt,
        estimatedDailyYield: portfolio.estimatedDailyYield,
        source: portfolio.source,
        pricedAt: portfolio.pricedAt,
      },
      // SPEC 30 Phase 1A.8 — `private` (NOT `public`). Pre-fix this used
      // `public, s-maxage=15` which let Vercel's CDN serve a cached
      // portfolio response from any authenticated query to ANY caller
      // for 15s — completely bypassing the `assertOwnsOrWatched` gate
      // above. `private, max-age=15` keeps the per-tab perf benefit while
      // forbidding shared caches (CDN / proxy) from storing per-user data.
      {
        headers: {
          "Cache-Control": "private, max-age=15, stale-while-revalidate=30",
        },
      }
    );
  } catch (err) {
    console.error(
      "[portfolio] Error:",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { error: "Failed to fetch portfolio" },
      { status: 500 }
    );
  }
}
