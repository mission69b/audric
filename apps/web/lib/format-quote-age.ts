/**
 * SPEC 7 P2.4b — Quote-Refresh ReviewCard / "QUOTE Ns OLD" badge.
 *
 * Renders the engine-stamped `PendingAction.quoteAge` (milliseconds
 * since the stalest contributing read landed) as a compact badge
 * label. The 1s polling interval the host uses for the live
 * countdown re-renders this string each tick.
 *
 * Format rules:
 *  - undefined / null  →  "QUOTE FRESH" (ageMs unset means engine
 *    couldn't measure freshness; treat as best-case for the user)
 *  - <60s              →  "QUOTE Ns OLD"
 *  - >=60s             →  "QUOTE Mm Ss OLD"
 *
 * Why exposed as a function (not a hook). The PermissionCard already
 * runs a 1s `setInterval` for the timeout countdown — the same tick
 * recomputes the age string. Pulling this out as a hook would force
 * an additional tick subscription and surface no benefit.
 */
export function formatQuoteAge(ageMs?: number | null): string {
  if (ageMs == null || !Number.isFinite(ageMs) || ageMs < 0) {
    return 'QUOTE FRESH';
  }
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return `QUOTE ${seconds}s OLD`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `QUOTE ${m}m ${s}s OLD`;
}

/**
 * Quote-age severity tier — drives PermissionCard badge color and
 * regenerate-button auto-pulse. Mirrors the spec's three-state model:
 *
 *  - 'fresh'   →  ageMs < shortestTtl       (dim grey)
 *  - 'amber'   →  ageMs >= shortestTtl      (amber pulse)
 *  - 'stale'   →  ageMs >= 2 × shortestTtl  (red, no pulse)
 *
 * The TTL itself is derived from `bundleShortestTtl(toolUseIds, ...)`
 * exported by `@t2000/engine` — host imports it; engine doesn't
 * enforce. Sui's on-chain dry-run is the actual correctness gate;
 * `severity` is purely UX hint.
 */
export type QuoteAgeSeverity = 'fresh' | 'amber' | 'stale';

export function quoteAgeSeverity(
  ageMs: number | undefined | null,
  shortestTtlMs: number,
): QuoteAgeSeverity {
  if (ageMs == null || !Number.isFinite(ageMs) || ageMs < 0) return 'fresh';
  if (ageMs >= 2 * shortestTtlMs) return 'stale';
  if (ageMs >= shortestTtlMs) return 'amber';
  return 'fresh';
}

/**
 * Format a duration in milliseconds for the "↻ Regenerated · Ns"
 * timeline group label. Used by `RegeneratedBlockView` to show the
 * total wall-clock time of the re-fired upstream reads.
 */
export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  return `${Math.round(seconds)}s`;
}
