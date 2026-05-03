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

const CONFIRM_PATTERN =
  /^(y|yes|yep|yeah|ok|okay|sure|confirm(ed|s)?|do it|go|proceed|approve(d)?|let'?s do it|sounds good|ship it|👍)[.!?]?$/i;

/**
 * Write verbs the system prompt uses when describing a Payment Stream plan.
 * Mirrors the tool surface (swap_execute, withdraw, send_transfer,
 * save_deposit, borrow, repay_debt, claim_rewards, volo_stake, pay_api).
 */
const WRITE_VERB_PATTERN = /\b(swap|withdraw|borrow|send|repay|save|deposit|stake|unstake|claim|pay)\b/gi;

const PRIOR_PLAN_MARKER = /\b(confirm|proceed)\b/i;

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

export const __testOnly__ = {
  CONFIRM_PATTERN,
  WRITE_VERB_PATTERN,
  PRIOR_PLAN_MARKER,
  countDistinctWriteVerbs,
  extractAssistantText,
};
