import { getTelemetrySink } from '@t2000/engine';

/**
 * Backlog-1 (May 2026 — `followup-stale-blockvision`) — BlockVision
 * freshness telemetry for the post-write refresh path.
 *
 * Phase 3a expanded the bundle window: a single tap settles 2-4 writes
 * atomically in one PTB. The engine's `runPostWriteRefresh` clears caches
 * and waits 1500ms (Sui RPC indexer lag absorption) before re-running
 * `balance_check`. But BlockVision's internal indexer lags independently
 * of Sui's — meaning the post-write `balance_check` can return data
 * provenanced PRE-bundle, even after our 1500ms wait. The LLM then
 * narrates from stale state and may second-guess whether legs landed
 * (the original "tangent" cascade in SPEC 14 soak).
 *
 * This module is pure observability. It reads provenance fields the
 * `balance_check` tool already emits (`defiSource`, `defiPricedAt`) and
 * fires three signals so dashboards can answer:
 *
 *   1. "How stale was BlockVision DeFi data when the LLM started narrating
 *      the post-bundle state?" (histogram, by stepCount + defiSource)
 *   2. "Are bundle flows degrading BlockVision DeFi response quality
 *      relative to single-write flows?" (counter on defiSource, by
 *      stepCount)
 *   3. "Are post-write refreshes themselves erroring (vs the regular
 *      tool-call error population)?" (counter on outcome, by stepCount)
 *
 * Mirrors `bundle-metrics.ts` shape — same `audric.harness.*` namespace,
 * same try/catch wrapper (telemetry never blocks), same single emit
 * helper exported.
 */

const NAMESPACE = 'audric.harness';

/** `defiSource` discriminator from `balance_check.data.defiSource`. */
export type DefiSource = 'blockvision' | 'partial' | 'partial-stale' | 'degraded';

/** Outcome discriminator for the refresh tool_result itself. */
export type RefreshOutcome = 'ok' | 'error';

interface PostWriteRefreshMetricsInput {
  /**
   * 1 for single-write resumes (no `action.steps`), 2-4 for Phase 3a
   * bundles. Tagged on every emission so dashboards can compare bundle
   * vs single-write freshness without a join.
   */
  stepCount: number;
  /**
   * Whether the post-write refresh tool_result came back with `isError: true`.
   * Splits refresh-path errors from in-flow tool errors so the dashboard
   * can isolate "the refresh itself broke" from "a chained tool errored".
   */
  isError: boolean;
  /**
   * `balance_check` result payload. Optional because the refresh may
   * fire for tools that don't carry BlockVision provenance (e.g.
   * `savings_info`, `health_check`). Callers filter on
   * `toolName === 'balance_check'` before passing the result here; the
   * helper still defensively reads `defiSource` / `defiPricedAt` rather
   * than trusting the caller filtered correctly.
   */
  result?: unknown;
}

function readDefiSource(result: unknown): DefiSource | undefined {
  if (result == null || typeof result !== 'object') return undefined;
  const source = (result as { defiSource?: unknown }).defiSource;
  if (
    source === 'blockvision' ||
    source === 'partial' ||
    source === 'partial-stale' ||
    source === 'degraded'
  ) {
    return source;
  }
  return undefined;
}

function readDefiPricedAt(result: unknown): number | undefined {
  if (result == null || typeof result !== 'object') return undefined;
  const priced = (result as { defiPricedAt?: unknown }).defiPricedAt;
  return typeof priced === 'number' && Number.isFinite(priced) && priced > 0
    ? priced
    : undefined;
}

/**
 * Single emit helper — fires up to three signals per call (age histogram
 * + defiSource counter + outcome counter). All wrapped in try/catch so a
 * telemetry-side regression can never block the resume stream.
 *
 * Called once per `wasPostWriteRefresh: true` `tool_result` event whose
 * `toolName === 'balance_check'`.
 */
export function emitPostWriteRefreshMetrics({
  stepCount,
  isError,
  result,
}: PostWriteRefreshMetricsInput): void {
  try {
    const sink = getTelemetrySink();

    sink.counter(`${NAMESPACE}.post_write_refresh_outcome`, {
      outcome: isError ? 'error' : 'ok',
      stepCount,
    });

    if (isError) {
      // No defiSource / defiPricedAt to read on the error path — the
      // result payload is the engine's `{ error: '...' }` synthetic, not
      // the canonical balance_check shape. Outcome counter alone covers
      // this branch; bail to avoid emitting noisy zero-age histograms.
      return;
    }

    const defiSource = readDefiSource(result);
    if (defiSource) {
      sink.counter(`${NAMESPACE}.post_write_refresh_defi_source`, {
        source: defiSource,
        stepCount,
      });
    }

    const defiPricedAt = readDefiPricedAt(result);
    if (defiPricedAt !== undefined) {
      const ageMs = Math.max(0, Date.now() - defiPricedAt);
      sink.histogram(`${NAMESPACE}.post_write_refresh_age_ms`, ageMs, {
        stepCount,
        defiSource: defiSource ?? 'unknown',
      });
    }
  } catch {
    // Telemetry must never block the resume stream.
  }
}
