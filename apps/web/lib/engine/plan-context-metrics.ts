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
