// ───────────────────────────────────────────────────────────────────────────
// SPEC 21.3 — Render-time thinking-similarity collapse
//
// On bundle saturation (turns 8/9/10 of the SPEC 19 acceptance smoke), the
// model started narrating meta-observations: "Same request as before",
// "Same pattern again", "Same as last time". Visually noisy, semantically
// empty. The fix has two layers:
//
//   1. System-prompt forbiddance ("Never narrate meta-observations…") in
//      `engine-context.ts` — cheaper at LLM layer (frees output tokens).
//   2. Render-time Jaccard similarity collapse (this module) — defense in
//      depth for when the LLM ignores the prompt.
//
// This module is the LAYER 2 piece. It compares the current `thinking`
// block's text to the last 3 turns' thinking texts and returns whether
// the UI should render a collapsed `THINKING — same as turn N` row
// instead of the full reasoning stream.
//
// Algorithm — Jaccard similarity over normalized word sets:
//   1. Normalize both texts (lowercase, strip punctuation, split on
//      whitespace, drop tokens < 3 chars to suppress filler-word noise).
//   2. Compute |A ∩ B| / |A ∪ B|.
//   3. If similarity > threshold → collapse.
//
// Carve-outs (when thinking SHOULD render fully even on high similarity):
//   - First turn of session (always show — sets user expectation).
//   - Error recovery (preceded by a tool result with `isError: true`).
//   - Ambiguous input requiring clarification (`clarification_needed`).
//   - Multi-step planning (thinking enumerates ≥3 distinct steps detected
//     by the simple "1." / "2." / "3." prefix heuristic — covers the
//     common LLM enumeration pattern without rich NLP).
//
// Edge cases:
//   - PREFIX-AWARE GUARD: even when Jaccard says "similar", if the first
//     3 normalized tokens differ, we DON'T collapse. This keeps:
//        "Evaluating route again because…"
//     distinct from:
//        "Evaluating route…"
//     Both have high Jaccard overlap; the prefix difference signals
//     distinct intent (re-eval vs first eval).
//   - Empty / very short text (< 3 normalized tokens) is never collapsed
//     — there's not enough signal to compare against.
//
// The threshold is exposed as a parameter (defaulting to 0.7) so future
// callers can tune from telemetry without redeploying.
// ───────────────────────────────────────────────────────────────────────────

export interface ThinkingCollapseOptions {
  /**
   * Jaccard similarity threshold above which the collapse fires.
   * Default 0.7 — chosen so legitimate reasoning rephrases don't
   * collapse, but verbatim repeats do. Tunable from telemetry.
   */
  threshold?: number;
  /**
   * If true, the current turn is the first user-message of the session.
   * Always renders fully (sets expectation that thinking is visible).
   */
  isFirstTurn?: boolean;
  /**
   * If true, the prior tool result was an error. Always render so the
   * user can see how the LLM is recovering from the failure.
   */
  isErrorRecovery?: boolean;
  /**
   * If true, the prior tool result asked for clarification (e.g.
   * `clarification_needed: true`). Always render — the user is about
   * to be asked something and the reasoning is the trail.
   */
  isAmbiguousInput?: boolean;
}

export interface ThinkingCollapseResult {
  collapse: boolean;
  /**
   * The 1-based turn index whose thinking matched. Used to render
   * `THINKING — same as turn N (click to expand)`. Undefined when
   * `collapse` is false.
   */
  similarTurnIndex?: number;
}

const DEFAULT_THRESHOLD = 0.7;
const MIN_TOKENS_FOR_COMPARISON = 3;
const PREFIX_TOKEN_COUNT = 3;
const STOPWORD_MIN_LEN = 3;

function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= STOPWORD_MIN_LEN);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function detectMultiStepPlan(tokens: string[], rawText: string): boolean {
  // Cheap heuristic: ≥3 enumerated steps. Looks for "1." "2." "3."
  // prefixes anywhere in the original text. Multi-step planning
  // legitimately repeats structure ("step 1: do X, step 2: do Y") and
  // we don't want to collapse those.
  const enumerationCount = (rawText.match(/(?:^|\s)([1-9])\.\s/g) ?? []).length;
  return enumerationCount >= 3 || tokens.length >= 80;
}

/**
 * Compute whether to collapse the current thinking block.
 *
 * Pure function — no I/O, no React. Callers (ChatMessage / parent
 * timeline component) plumb in the prior turns' thinking text and the
 * carve-out flags from the message graph.
 */
export function computeThinkingCollapse(
  currentText: string,
  priorThinkingTexts: ReadonlyArray<string>,
  options: ThinkingCollapseOptions = {},
): ThinkingCollapseResult {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;

  if (options.isFirstTurn) return { collapse: false };
  if (options.isErrorRecovery) return { collapse: false };
  if (options.isAmbiguousInput) return { collapse: false };

  const currentTokens = normalize(currentText);
  if (currentTokens.length < MIN_TOKENS_FOR_COMPARISON) return { collapse: false };

  if (detectMultiStepPlan(currentTokens, currentText)) return { collapse: false };

  const currentSet = new Set(currentTokens);
  const currentPrefix = currentTokens.slice(0, PREFIX_TOKEN_COUNT).join(' ');

  for (let i = 0; i < priorThinkingTexts.length; i += 1) {
    const priorTokens = normalize(priorThinkingTexts[i]);
    if (priorTokens.length < MIN_TOKENS_FOR_COMPARISON) continue;

    const priorSet = new Set(priorTokens);
    const score = jaccard(currentSet, priorSet);
    if (score <= threshold) continue;

    // [Prefix-aware guard] Even on high Jaccard, if the first 3
    // normalized tokens differ, the intent is distinct — don't collapse.
    const priorPrefix = priorTokens.slice(0, PREFIX_TOKEN_COUNT).join(' ');
    if (currentPrefix !== priorPrefix) continue;

    return {
      collapse: true,
      // 1-based "turn N" — N is the index in the prior list + 1 from the
      // caller's perspective. The caller is responsible for translating
      // the array index back to the real turn number for display.
      similarTurnIndex: i + 1,
    };
  }

  return { collapse: false };
}
