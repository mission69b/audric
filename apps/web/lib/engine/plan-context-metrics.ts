import { getTelemetrySink } from '@t2000/engine';

/**
 * [SPEC 15 Phase 1 / 2026-05-04] Plan-context promotion telemetry.
 *
 * Fires once per turn where `engine-factory.ts` promoted the LLM from
 * Haiku-low to Sonnet-medium based on plan-context detection (the prior
 * assistant turn was a multi-write Payment Stream plan).
 *
 * The load-bearing signal is `matched_regex`:
 *   - `'true'`  → Fix 1's `CONFIRM_PATTERN` would have caught the user's
 *                 message anyway; the fast-path bypass already dispatched
 *                 in 108 ms. Promotion fired but didn't actually
 *                 prevent a Haiku-lean ramble (the bypass did).
 *   - `'false'` → `CONFIRM_PATTERN` missed; the user typed something the
 *                 regex couldn't match (voice transcript, typo not in
 *                 the Fix 1 set, multilingual confirm, qualified yes,
 *                 emoji not in the set, modification request, etc).
 *                 Plan-context promotion is the ONLY thing keeping this
 *                 turn from a Haiku-lean ramble.
 *
 * Watching `matched_regex=false` over a 24h window is the empirical test
 * for whether SPEC 15 Phase 1 is paying for itself:
 *   - If `matched_regex=false` ratio is materially > 0, we're catching
 *     real misses Fix 1's regex couldn't.
 *   - If it stays at 0 forever, the regex extension was sufficient and
 *     this layer is dead code (worth knowing, but unlikely — the spec
 *     enumerates 6+ language/typo/voice classes the regex won't catch).
 *
 * Companion tags for distribution analysis:
 *   - `msg_length_bucket`: 0-10 / 11-30 / 31-100 / 101+
 *     Shorter buckets are likely typos / casual confirms. Longer
 *     buckets are likely modifications ("yes but change leg 3 to 0.1").
 *   - `msg_lang_hint`: 'en' (ASCII letters only) | 'non_en' (any
 *     non-ASCII letter or CJK character). Crude — doesn't distinguish
 *     Spanish from Japanese — but detects "we have multilingual users
 *     hitting this path" without pulling in an i18n library.
 *
 * Mirrors the `audric.harness.*` shape in `bundle-metrics.ts` but uses
 * a new `audric.confirm_flow.*` namespace because SPEC 15 will land
 * additional metrics (chip dispatches, edit-vs-text ratios) that
 * deserve their own dashboard slice.
 */

const NAMESPACE = 'audric.confirm_flow';

const NON_ASCII_LETTER = /[^\x00-\x7F]/;

export type MsgLengthBucket = '0-10' | '11-30' | '31-100' | '101+';
export type MsgLangHint = 'en' | 'non_en';

export function bucketMessageLength(len: number): MsgLengthBucket {
  if (len <= 10) return '0-10';
  if (len <= 30) return '11-30';
  if (len <= 100) return '31-100';
  return '101+';
}

export function detectLangHint(message: string): MsgLangHint {
  return NON_ASCII_LETTER.test(message) ? 'non_en' : 'en';
}

/**
 * Fire-and-forget. Wrapped in try/catch — telemetry must never block
 * a request. Mirrors the pattern in `bundle-metrics.ts` and
 * `post-write-refresh-metrics.ts`.
 */
export function emitPlanContextPromoted(args: {
  message: string;
  matchedRegex: boolean;
  priorWriteVerbCount: number;
}): void {
  try {
    getTelemetrySink().counter(`${NAMESPACE}.plan_context_promoted`, {
      matched_regex: args.matchedRegex ? 'true' : 'false',
      msg_length_bucket: bucketMessageLength(args.message.length),
      msg_lang_hint: detectLangHint(args.message),
      prior_write_verb_count: args.priorWriteVerbCount,
    });
  } catch {
    // Telemetry must never block the request.
  }
}

// ─────────────────────────────────────────────────────────────────────────
// SPEC 15 Phase 2 — Confirm chips telemetry
// ─────────────────────────────────────────────────────────────────────────
//
// Phase 2 adds two counters in the same `audric.confirm_flow.*` namespace.
// Both ship in commit 1 (backend) so we collect baseline data BEFORE
// chips render in the UI (commit 2 + flag flip). That way we can answer:
//
//   1. "How often WOULD chips have rendered?" (decorator firing rate) —
//      via `expects_confirm_set`. Baseline expected to track ~1:1 with
//      multi-write `prepare_bundle` calls in production.
//
//   2. "When chips ship, what's the via=chip vs via=text split?" — via
//      `dispatch_count`. Phase 2 success criterion is chip adoption ≥ 60%
//      within 14 days of full rollout.
//
// Both counters share the bucketing helpers above with the existing
// `plan_context_promoted` counter so dashboards can join on identical
// tag shapes.

/**
 * Bucket for `step_count` tag. Phase 3a's MAX_BUNDLE_OPS=4 caps the
 * upper bound today; older payment streams may have ≤3.
 */
export type StepCountBucket = '2' | '3' | '4';

export function bucketStepCount(count: number): StepCountBucket {
  if (count <= 2) return '2';
  if (count === 3) return '3';
  return '4';
}

/**
 * Fired by the audric chat route AFTER the decorator returns a non-null
 * `ExpectsConfirmSseEvent`. Confirms that the assistant turn produced
 * a chip-renderable confirmation point — backend signal regardless of
 * whether the frontend renders chips (gated by env flag).
 *
 * Tags:
 *   - `has_swap`: 'true' when at least one step is `swap_execute` (these
 *     bundles carry `expiresAt`); 'false' otherwise. Splits the
 *     quote-staleness population from non-quote-bearing bundles.
 *   - `step_count_bucket`: '2' | '3' | '4' (Phase 3a cap).
 */
export function emitExpectsConfirmSet(args: {
  hasSwap: boolean;
  stepCount: number;
}): void {
  try {
    getTelemetrySink().counter(`${NAMESPACE}.expects_confirm_set`, {
      has_swap: args.hasSwap ? 'true' : 'false',
      step_count_bucket: bucketStepCount(args.stepCount),
    });
  } catch {
    // Telemetry must never block the request.
  }
}

/**
 * How a confirm-flow turn was resolved. Tagged on
 * `audric.confirm_flow.dispatch_count`.
 *
 * - 'dispatched': bundle dispatched to the wallet (chip-Yes happy path
 *   OR text-confirm regex/plan-context fast-path).
 * - 'cancelled': user explicitly declined (chip-No click — text-no with
 *   plan-context is counted under `audric.bundle.fast_path_skipped`
 *   `reason='negative_reply'`, NOT here, to avoid double-counting).
 * - 'stash_mismatch': chip-Yes click whose `forStashId` didn't match the
 *   live `bundleId` — ghost-dispatch race repro. We DON'T dispatch the
 *   stale stash binding, falling through to the regular text-confirm
 *   path instead. Tracked separately so the dashboard can spot stale
 *   clients (suggests a UI staleness bug or aggressive caching).
 */
export type DispatchVia = 'chip' | 'text';
export type DispatchOutcome = 'dispatched' | 'cancelled' | 'stash_mismatch';
/**
 * Mirrors the fast-path's `AdmittedVia` for `via='text'` rows so a single
 * dashboard query can split text-vs-chip AND tell which fast-path path
 * caught the text confirm. For `via='chip'` rows, value is always 'chip'
 * (no other admission path is possible from the chip POST).
 */
export type DispatchAdmittedVia = 'regex' | 'plan_context' | 'chip';

/**
 * Fired by the chat route when a confirm-flow turn resolves: either the
 * bundle dispatched (chip-Yes or text-yes via fast-path) or the user
 * cancelled (chip-No, or text-no caught by `looksLikeNegativeReply`).
 *
 * Two adoption ratios drive Phase 2 rollout decisions:
 *   - chip adoption: dispatch_count{via=chip} / dispatch_count{*}
 *   - cancel rate:   dispatch_count{outcome=cancelled,via=chip} /
 *                    dispatch_count{via=chip}
 *
 * If chip adoption stays low (< 30%) with cancel rate > 15%, the chip
 * UX is misfiring and we tighten the decorator heuristic. If chip
 * adoption goes high (> 80%) with cancel rate < 5%, ship is healthy.
 */
export function emitConfirmFlowDispatch(args: {
  via: DispatchVia;
  outcome: DispatchOutcome;
  admittedVia: DispatchAdmittedVia;
  stepCount: number;
}): void {
  try {
    getTelemetrySink().counter(`${NAMESPACE}.dispatch_count`, {
      via: args.via,
      outcome: args.outcome,
      admitted_via: args.admittedVia,
      step_count_bucket: bucketStepCount(args.stepCount),
    });
  } catch {
    // Telemetry must never block the request.
  }
}
