/**
 * Confirm-of-bundle detection
 * ---------------------------
 * Heuristic that decides whether a short user message ("Confirmed", "yes",
 * "go") is a confirmation of a multi-write Payment Stream that the assistant
 * proposed in the immediately prior turn.
 *
 * Why this exists (May 2026 / SPEC 13 Phase 2 soak):
 *   `classifyEffort` routes single-word user replies to `low` effort →
 *   Haiku. When the prior assistant turn proposed a 2-3 op atomic bundle and
 *   asked "Confirm to proceed?", Haiku doesn't reliably emit ALL N writes in
 *   a single assistant message. It emits ONE write, gets guard-blocked
 *   (e.g. STALE_QUOTE because a swap_quote needs refreshing), re-quotes, and
 *   only THEN emits the full atomic bundle. Net cost: ~10s + ~500 tokens of
 *   extra round-trip on every multi-write confirm.
 *
 *   When this helper detects the pattern we promote `low` → `medium` so
 *   Sonnet (with adaptive thinking) handles the confirm turn. Sonnet emits
 *   the parallel tool_use blocks correctly on the first try.
 *
 * Detection rules (all three must hold):
 *   1. Current message is short (≤ 30 chars) and matches the affirmative-
 *      confirmation pattern.
 *   2. The most recent assistant message contains the word "confirm" OR
 *      "proceed" — covers both "Confirm to proceed?" and "Shall I
 *      proceed?" / "Ready to proceed?" phrasings the planner emits.
 *      (1.14.2: original pattern only matched "confirm" and missed every
 *      "Shall I proceed?" plan tail in production logs.)
 *   3. The same assistant message mentions ≥ 2 distinct write verbs (the
 *      verbs the system prompt uses to describe Payment Stream legs).
 *
 * False positives are cheap (Sonnet-medium for one extra turn), false
 * negatives are the status quo (Haiku as before). The bias is intentionally
 * conservative — we only promote when the signal is strong.
 */

import type { Message } from '@t2000/engine';

// [Fix 1 / 2026-05-04] Pattern extended to cover production-observed misses:
//
//   - "execute" / "exec" — observed at 21:28:09 in session
//     `s_1777843407792_2b7fc088a8fa`. User said "execute" after "proceed";
//     fast-path skipped with `not_affirmative`; Haiku-low (no thinking) then
//     emitted 7,159 final-text tokens of stream-of-consciousness over 69s
//     trying to figure out whether "execute" was a confirm or a command.
//     Adding it to the affirmative set fast-paths the redundant-confirm and
//     prevents the 69s ramble. (Fix 2 — guarding Haiku-lean against the
//     ramble itself when there's nothing to do — is tracked separately.)
//
//   - "confimed" — observed at 21:19:19 in session
//     `s_1777841977869_2f844b8a694a`. Common typo of "confirmed". Same skip,
//     same downstream cost.
//
//   - "run" / "fire" / "launch" — natural synonyms for "execute" the
//     planner's plan-tail copy invites ("Confirm to proceed?" → user types
//     "fire it" / "launch"). Adding these now prevents the same regression
//     for the next user who picks a different verb.
//
// All anchored at `^...$` and length-capped at 30 chars upstream, so
// "run analytics" or "execute the audit" still fall through to the LLM.
const CONFIRM_PATTERN =
  /^(y|yes|yep|yeah|ok|okay|sure|confirm(ed|s)?|confimed|do it|go|proceed|approve(d)?|let'?s do it|sounds good|ship it|execute|exec|run|fire|launch|👍)[.!?]?$/i;

/**
 * Write verbs the system prompt uses when describing a Payment Stream plan.
 * Mirrors the tool surface (swap_execute, withdraw, send_transfer,
 * save_deposit, borrow, repay_debt, claim_rewards, volo_stake, pay_api).
 */
const WRITE_VERB_PATTERN = /\b(swap|withdraw|borrow|send|repay|save|deposit|stake|unstake|claim|pay)\b/gi;

/**
 * Marker regex for "this assistant message looks like a plan-confirm
 * tail." Single source of truth: used by `detectBundleConfirm` and
 * `detectPriorPlanContext` (Phase 1) to gate promotion AND by
 * `expects-confirm-decorator.ts` (Phase 2) to gate chip rendering.
 *
 * Promoted to a top-level export so production code doesn't have to
 * reach into `__testOnly__` to share the regex. Keeps Phase 1, 1.5,
 * and 2 in lockstep — if the planner copy ever changes, this regex is
 * the single edit point.
 */
export const PRIOR_PLAN_MARKER = /\b(confirm|proceed)\b/i;

// [SPEC 15 Phase 1.5 / 2026-05-04] Tight pattern catching clearly-negative
// short replies. Used by the fast-path bundle dispatcher to bail out of
// the plan-context override path when the user is OBVIOUSLY not
// confirming. Must stay strict: false positives here mean a confirm-
// shaped message ("do it bro") accidentally gets blocked from the fast
// path, dropping us back to LLM re-planning (which decomposes bundles —
// the bug we just shipped Phase 1.5 to fix). False negatives are cheap
// (LLM handles modifications correctly under plan-context promotion).
//
// Anchored at `^...\b` to require the negative word at the START of the
// message AND followed by a word boundary. Lets through cases where the
// user types "yes but please change leg 3" (starts with "yes", not "no")
// while blocking "no thanks" / "wait, change leg 3" / "actually let me
// reconsider".
//
// `actually` is included because in conversational English it almost
// always introduces a reversal ("actually, let me think more"). If we
// see false positives on "actually go ahead", we can tighten — but
// production logs to date show "actually" + plan-tail = reversal ~100%.
const NEGATIVE_PATTERN =
  /^(n|no|nope|nah|cancel|stop|wait|hold[-\s]?on|hold[-\s]?up|actually|nvm|nm|never[-\s]?mind|change|edit|modify|update|skip|abort|undo|revert|don'?t|do not)\b/i;

interface PriorAssistantTextResult {
  text: string;
  /** Index of this message in the history array. */
  index: number;
}

function extractAssistantText(m: Message): string {
  if (m.role !== 'assistant') return '';
  const blocks = m.content.filter((b): b is { type: 'text'; text: string } => b.type === 'text');
  return blocks.map((b) => b.text).join('\n');
}

function findMostRecentAssistantText(history: Message[]): PriorAssistantTextResult | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role !== 'assistant') continue;
    const text = extractAssistantText(m);
    if (text.trim().length === 0) continue;
    return { text, index: i };
  }
  return null;
}

function countDistinctWriteVerbs(text: string): number {
  const verbs = new Set<string>();
  for (const match of text.matchAll(WRITE_VERB_PATTERN)) {
    verbs.add(match[1].toLowerCase());
  }
  return verbs.size;
}

export interface BundleConfirmDetection {
  matched: boolean;
  /** Number of distinct write verbs found in the prior assistant message. */
  priorWriteVerbCount: number;
  /** Truncated current-message reason for telemetry/logging. */
  reason: 'no-history' | 'not-short-confirm' | 'no-prior-assistant' | 'no-confirm-marker' | 'fewer-than-two-writes' | 'matched';
}

/**
 * Detects whether the current user message is a confirmation of a multi-
 * write Payment Stream proposed in the prior assistant turn.
 *
 * Pure function — no side effects, no LLM calls. Cheap to run on every turn.
 */
export function detectBundleConfirm(currentMessage: string, history: Message[]): BundleConfirmDetection {
  if (history.length === 0) {
    return { matched: false, priorWriteVerbCount: 0, reason: 'no-history' };
  }

  const trimmed = currentMessage.trim();
  if (trimmed.length === 0 || trimmed.length > 30 || !CONFIRM_PATTERN.test(trimmed)) {
    return { matched: false, priorWriteVerbCount: 0, reason: 'not-short-confirm' };
  }

  const prior = findMostRecentAssistantText(history);
  if (!prior) {
    return { matched: false, priorWriteVerbCount: 0, reason: 'no-prior-assistant' };
  }

  if (!PRIOR_PLAN_MARKER.test(prior.text)) {
    return { matched: false, priorWriteVerbCount: 0, reason: 'no-confirm-marker' };
  }

  const verbCount = countDistinctWriteVerbs(prior.text);
  if (verbCount < 2) {
    return { matched: false, priorWriteVerbCount: verbCount, reason: 'fewer-than-two-writes' };
  }

  return { matched: true, priorWriteVerbCount: verbCount, reason: 'matched' };
}

/**
 * [SPEC 14 Phase 2] Tight predicate for "is the user's reply an
 * affirmative short confirm?". Re-exports the same regex
 * `detectBundleConfirm` uses for its first gate, so the fast-path
 * bypass and the Haiku→Sonnet promotion path agree on what a
 * confirm message looks like.
 *
 * Intentionally narrow — only matches short, unambiguous yes-words
 * with no trailing question marks. Anything longer than 30 chars
 * falls through to the LLM (which can handle nuance).
 */
export function isAffirmativeConfirmReply(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length === 0 || trimmed.length > 30) return false;
  return CONFIRM_PATTERN.test(trimmed);
}

/**
 * [SPEC 15 Phase 1 / 2026-05-04] Plan-context detection — should we
 * promote Haiku-low → Sonnet-medium for THIS user reply, based on
 * the SHAPE OF THE PRIOR ASSISTANT TURN, not the user's message?
 *
 * Promotes whenever the most recent assistant message is a multi-write
 * Payment Stream plan (≥ 2 distinct write verbs + a "confirm"/"proceed"
 * tail), regardless of what the user typed in response. The fast-path
 * bypass (`isAffirmativeConfirmReply`) handles the cheap happy-case in
 * 108 ms; this detector is the safety net for everything else —
 * modifications, voice transcripts, multi-language confirms, typos
 * the regex doesn't cover.
 *
 * Why this DROPPED the regex check that `detectBundleConfirm` keeps:
 *   We were chasing the long tail of human language with regex
 *   extensions (Fix 1 added "execute" / "exec" / "run" / "fire" /
 *   "launch" / "confimed" after a 69-second Haiku-lean ramble in
 *   prod — session `s_1777843407792_2b7fc088a8fa` @ 21:28:09). The
 *   next user types "vamos", "do it bro", "proceed it", "let's go",
 *   "sí", or speaks the confirm into voice mode — same bug. The
 *   structural answer is: when the prior assistant turn is a plan,
 *   ALWAYS use Sonnet for the next turn — Sonnet handles language
 *   variance natively, no regex maintenance.
 *
 *   The fast-path bypass keeps the strict regex (false positives
 *   there = wrongly dispatched bundle = bad). Promotion can be
 *   liberal because the worst case is one extra Sonnet-medium turn
 *   (~$0.03 vs Haiku, negligible) and Sonnet handles unrelated
 *   messages gracefully whereas Haiku-lean rambles for 7 K tokens.
 *
 * Detection rules (both must hold):
 *   1. The most recent assistant message contains "confirm" OR
 *      "proceed" (covers "Confirm to proceed?", "Shall I proceed?",
 *      "Ready to proceed?" — same marker `detectBundleConfirm` uses).
 *   2. The same assistant message mentions ≥ 2 distinct write verbs.
 *
 * Pure function — no side effects, no LLM calls. Cheap to run on
 * every turn (the engine-factory only calls it when baseEffort is
 * already 'low', so single-write replies and chitchat short-circuit
 * upstream).
 */
/**
 * [SPEC 15 Phase 1.5 / 2026-05-04] Companion to `detectPriorPlanContext`.
 *
 * Tight predicate for "is this user message clearly NEGATIVE / a
 * modification request / a denial?". Used by the fast-path bundle
 * dispatcher to gate the plan-context override path: when the strict
 * regex (`isAffirmativeConfirmReply`) misses, we look at plan-context;
 * but if the message looks negative, we bail out instead of dispatching.
 *
 * Bias is intentionally tight (false negatives > false positives):
 *   - False negative (we miss a negative, dispatch the bundle anyway)
 *     → bad. User wanted to cancel/modify, gets the original bundle.
 *   - False positive (we see negative where there isn't one, block
 *     fast-path) → annoying but recoverable. LLM picks up the turn
 *     and handles correctly under plan-context promotion (Phase 1).
 *
 * So we'd rather be too narrow (let some negatives through to be
 * caught by the LLM) than too broad (block legitimate "do it bro").
 *
 * The anchor `^...\b` requires the negative word at the START of the
 * message — "no thanks" / "wait" / "actually" all match, but "yes but
 * change leg 3" doesn't (because it starts with "yes"). The latter is
 * a YES + modification, which the bundle dispatch will surface as a
 * pending_action that the user can then refuse via the permission card.
 */
export function looksLikeNegativeReply(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length === 0) return false;
  return NEGATIVE_PATTERN.test(trimmed);
}

export function detectPriorPlanContext(history: Message[]): BundleConfirmDetection {
  if (history.length === 0) {
    return { matched: false, priorWriteVerbCount: 0, reason: 'no-history' };
  }

  const prior = findMostRecentAssistantText(history);
  if (!prior) {
    return { matched: false, priorWriteVerbCount: 0, reason: 'no-prior-assistant' };
  }

  if (!PRIOR_PLAN_MARKER.test(prior.text)) {
    return { matched: false, priorWriteVerbCount: 0, reason: 'no-confirm-marker' };
  }

  const verbCount = countDistinctWriteVerbs(prior.text);
  if (verbCount < 2) {
    return { matched: false, priorWriteVerbCount: verbCount, reason: 'fewer-than-two-writes' };
  }

  return { matched: true, priorWriteVerbCount: verbCount, reason: 'matched' };
}

export const __testOnly__ = {
  CONFIRM_PATTERN,
  WRITE_VERB_PATTERN,
  PRIOR_PLAN_MARKER,
  NEGATIVE_PATTERN,
  countDistinctWriteVerbs,
  extractAssistantText,
};
