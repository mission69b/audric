import { type NextRequest, NextResponse } from "next/server";
import { fetchActivityBuckets } from "@/lib/activity-data";
import { authenticateAnalyticsRequest } from "@/lib/internal-auth";

/**
 * GET /api/analytics/activity-heatmap?days=365&address=0x...
 * Header: x-internal-key (engine + cron) OR x-zklogin-jwt (browser)
 * Query: address (read target — required for internal-key path; optional
 *                 for JWT path where it defaults to caller)
 *
 * Returns daily activity counts from AppEvent + on-chain transactions.
 * Used by `ActivityHeatmapCanvas` (the GitHub-style 365-day grid) and
 * `FullPortfolioCanvas` (the 30-day rollup tile).
 *
 * --- HISTORY ---
 *
 * [S.264 — 2026-05-23] Ported from `apps/web/app/api/analytics/
 * activity-heatmap/route.ts` (deleted in S.253's apps/web archive).
 * The legacy route relied on the `authenticateRequest` + WatchAddress
 * (`assertOwnsOrWatched`) pattern; both helpers were rewritten in
 * S.254's WatchAddress retirement (`assertOwnsOrWatched` is now an
 * alias for `assertOwns`). Web-v2's `authenticateAnalyticsRequest`
 * helper already encodes the post-S.254 dual-auth shape, so the port
 * just adopts that helper instead of inlining the JWT branch.
 *
 * Why the port wasn't done in S.253: the apps/web → web-v2 archive
 * focused on routes the chat client + page transitions actually called
 * during the cutover smoke. This canvas only renders when the user
 * runs `Show me my activity heatmap`, which wasn't part of that smoke
 * pass; the missing route 404'd silently because the canvas's fetch
 * path uses `.catch(() => null)` and degrades to empty buckets.
 */
export async function GET(request: NextRequest) {
  const days = Math.min(
    Number.parseInt(request.nextUrl.searchParams.get("days") ?? "365", 10),
    365
  );

  const auth = await authenticateAnalyticsRequest(request);
  if ("error" in auth) {
    return auth.error;
  }
  const { address } = auth;

  try {
    const buckets = await fetchActivityBuckets(address, days);
    const totalEvents = buckets.reduce((s, d) => s + d.count, 0);
    const activeDays = buckets.filter((d) => d.count > 0).length;
    const maxCount = buckets.reduce((m, d) => Math.max(m, d.count), 0);

    return NextResponse.json({
      address,
      days,
      buckets,
      summary: { totalEvents, activeDays, maxCount, periodDays: days },
    });
  } catch (err) {
    console.error("[activity-heatmap] Error:", err);
    return NextResponse.json({
      address,
      days,
      buckets: [],
      summary: { totalEvents: 0, activeDays: 0, maxCount: 0, periodDays: days },
    });
  }
}
