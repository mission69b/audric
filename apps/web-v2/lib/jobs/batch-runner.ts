/**
 * [S.278 / SPEC 272 Lever 1 — 2026-05-23] Bounded-batch runner for daily
 * crons that fan out per-user reads against BlockVision-backed canonical
 * fetchers.
 *
 * Why this exists
 * ---------------
 * The 02:30 UTC `financial-context-snapshot` cron and 07:00 UTC
 * `portfolio-snapshot` cron both ran `for (const user of users)` strictly
 * sequentially over ~165 active users. At ~2s/user typical, that lands
 * around ~330s — over Vercel's 300s `maxDuration` cap. Tail users got
 * cut off → ~6 daily UFC snapshots skipped per cron run.
 *
 * The fix (SPEC 272 Lever 1): process users in bounded parallel batches
 * with a small intra-batch delay. With N=10 / M=500ms defaults, the
 * worst-case wall time drops to ~17 batches × ~3s = ~51s — comfortably
 * inside maxDuration with headroom for slow days.
 *
 * Design choices (per `coding-discipline.mdc` simplicity-first)
 * --------------
 *   - One helper, two consumers. Not an abstraction layer — a literal
 *     30-LoC for-loop with batching semantics that both jobs share.
 *   - `Promise.allSettled` per batch — defense in depth. The per-user
 *     `processOneUser` body already catches its own errors and updates
 *     counters; `allSettled` ensures that a NEW kind of escape (e.g. an
 *     async throw from a future Prisma error path) doesn't abort the
 *     whole batch.
 *   - Intra-batch delay between batch STARTS, not between user STARTS.
 *     We want to space the BV-fan-out bursts, not slow down individual
 *     users.
 *   - `onBatchComplete` callback for telemetry. Lets each job emit its
 *     own per-batch histogram name without baking the metric name into
 *     this generic helper.
 *
 * What this does NOT do
 * ---------------------
 *   - No retry inside the runner — that lives in the engine's BV retry
 *     layer (`fetchBlockVisionWithRetry`).
 *   - No cross-batch deduping — each cron already idempotently
 *     `upsert`s per user, so re-running the same user is a no-op
 *     correctness-wise; the batch runner doesn't need to know.
 *   - No AbortSignal plumbing — SPEC 272 Lever 3 may add that to the
 *     engine fan-out, but the cron runner is the wrong place for it
 *     (it'd interrupt mid-user, leaving inconsistent state).
 */

import { setTimeout as sleep } from "node:timers/promises";

export interface RunInBatchesOptions<T, R> {
  /** Max in-flight items per batch. Default 10. Clamped to >= 1. */
  batchSize?: number;

  /** Delay between batch STARTS (ms). Default 500. Clamped to >= 0.
   *  Applied AFTER each batch settles, BEFORE starting the next one;
   *  skipped after the final batch. */
  intraBatchDelayMs?: number;
  /** Items to process. Empty list returns immediately. */
  items: readonly T[];

  /** Telemetry hook fired after each batch settles. */
  onBatchComplete?: (info: BatchCompleteInfo) => void;

  /** Per-item async work. MUST handle its own errors internally; any
   *  escapes are caught by `Promise.allSettled` (defense-in-depth). */
  process: (item: T) => Promise<R>;
}

export interface BatchCompleteInfo {
  /** Zero-indexed batch number. */
  batchIndex: number;
  /** Number of items in this batch (may be smaller for the final batch). */
  batchSize: number;
  /** Wall-clock duration of this batch's `Promise.allSettled`, in ms. */
  durationMs: number;
}

export interface BatchOutcome<R> {
  /** Per-item settled results, in the SAME ORDER as `opts.items`. */
  results: PromiseSettledResult<R>[];
  /** Total number of batches executed. */
  totalBatches: number;
}

/**
 * Process `items` in bounded parallel batches with intra-batch pacing.
 *
 * Returns a `BatchOutcome` whose `results` array is indexed identically
 * to the input — callers can correlate by index when needed.
 *
 * Errors from `process` are NEVER re-thrown; the runner returns
 * `{ status: 'rejected', reason }` slots and continues. This matches
 * the existing cron behaviour (per-user errors logged + counted but
 * never abort the loop).
 */
export async function runInBatches<T, R>(
  opts: RunInBatchesOptions<T, R>
): Promise<BatchOutcome<R>> {
  const batchSize = Math.max(1, Math.floor(opts.batchSize ?? 10));
  const intraBatchDelayMs = Math.max(
    0,
    Math.floor(opts.intraBatchDelayMs ?? 500)
  );
  const { items, process: processOne, onBatchComplete } = opts;

  if (items.length === 0) {
    return { results: [], totalBatches: 0 };
  }

  const results: PromiseSettledResult<R>[] = new Array(items.length);
  const totalBatches = Math.ceil(items.length / batchSize);

  for (let b = 0; b < totalBatches; b++) {
    const start = b * batchSize;
    const end = Math.min(start + batchSize, items.length);
    const batch = items.slice(start, end);

    const batchStart = Date.now();
    const settled = await Promise.allSettled(batch.map(processOne));
    const durationMs = Date.now() - batchStart;

    for (let i = 0; i < settled.length; i++) {
      results[start + i] = settled[i];
    }

    onBatchComplete?.({ batchIndex: b, batchSize: batch.length, durationMs });

    if (b < totalBatches - 1 && intraBatchDelayMs > 0) {
      await sleep(intraBatchDelayMs);
    }
  }

  return { results, totalBatches };
}
