import { getTelemetrySink } from '@t2000/engine';

/**
 * SPEC 15 Phase 2 v0.6 — Unified quote-refresh telemetry
 *
 * Audric has two surfaces today where a user can refresh a stale swap
 * quote during a money-moving flow:
 *
 *   1. **`<ConfirmChips />` Refresh-quote chip** — appears below the
 *      Payment Stream plan when `expiresAt` passes BEFORE the user
 *      taps Confirm. Click → re-runs `swap_quote` + `prepare_bundle`
 *      via plan-context-promoted Sonnet (~5–8s round-trip). Required
 *      for auto-tier multi-write bundles where the bundle dispatches
 *      directly without a downstream `<PermissionCard />`.
 *
 *   2. **`<PermissionCard />` Refresh-quote button** (SPEC 7 P2.4b) —
 *      appears on the bundle confirm card AFTER the chip Confirm has
 *      dispatched, when the swap leg's quote ages past the warning
 *      band. Click → `/api/engine/regenerate` swaps the action's
 *      payload in place (~500ms, no LLM round-trip). Required for
 *      single-write confirm-tier flows that have no chip surface.
 *
 * The two surfaces serve different scenarios (defense-in-depth, NOT
 * code duplication — see SPEC_15_PHASE2_DESIGN.md v0.6 "Two layers of
 * quote refresh, by design"). This module emits a unified counter so
 * the dashboard can answer "how often does the user refresh a stale
 * quote, broken down by which surface fired" without joining two
 * separate metrics.
 *
 * Pairs with the existing per-surface counters which keep their
 * downstream-outcome detail (`audric.harness.regenerate_count` and
 * the implicit chat-route turn counters); this counter is the
 * top-of-funnel "user wanted a fresh quote" event.
 */

const COUNTER_NAME = 'audric.quote_refresh.fired';

/** Which surface the user clicked on. */
export type QuoteRefreshSurface = 'chip' | 'permission_card';

interface QuoteRefreshFiredInput {
  /** The surface the click came from — gates which downstream path runs. */
  surface: QuoteRefreshSurface;
}

/**
 * Fire the unified `audric.quote_refresh.fired` counter. Wraps the
 * sink call in try/catch so telemetry never blocks a hot path —
 * matches the pattern in every other Audric metrics helper
 * (bundle-metrics, post-write-refresh-metrics, plan-context-metrics).
 */
export function emitQuoteRefreshFired({ surface }: QuoteRefreshFiredInput): void {
  try {
    getTelemetrySink().counter(COUNTER_NAME, { surface });
  } catch {
    // Telemetry must never block the request flow.
  }
}
