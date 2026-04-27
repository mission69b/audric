// ---------------------------------------------------------------------------
// Per-model token-cost rates for TurnMetrics + ConversationLog accounting.
//
// Extracted from `app/api/engine/chat/route.ts` (v1.4 — Day 1) so the
// resume route, harness-metrics, and any future cost surface can share a
// single source of truth. The chat route still owns the legacy
// `COST_PER_INPUT_TOKEN` / `COST_PER_OUTPUT_TOKEN` Sonnet-default
// constants because the legacy `Message` row writer in that file falls
// back to them when no model context is available.
// ---------------------------------------------------------------------------

export interface ModelCostRates {
  /** USD per input token. */
  input: number;
  /** USD per output token. */
  output: number;
  /** USD per cached-prefix read token (Anthropic prompt cache). */
  cacheRead: number;
  /** USD per cached-prefix write token (initial-cache turn). */
  cacheWrite: number;
}

/**
 * Per-million-token Anthropic pricing as of late 2025:
 *   Haiku 4.5:  $1 input / $5 output
 *   Sonnet 4.6: $3 input / $15 output
 *   Opus 4.6:   $15 input / $75 output
 * Cache reads bill at 0.1× input rate, cache writes at 1.25× input rate.
 *
 * Used by TurnMetrics to charge each turn at its actual model's rate
 * instead of always assuming Sonnet (the pre-0.47 bug that made Haiku
 * turns look 2–3× more expensive than reality).
 */
export function costRatesForModel(model: string): ModelCostRates {
  if (model.includes('haiku')) {
    const i = 1 / 1_000_000;
    return { input: i, output: 5 / 1_000_000, cacheRead: i * 0.1, cacheWrite: i * 1.25 };
  }
  if (model.includes('opus')) {
    const i = 15 / 1_000_000;
    return { input: i, output: 75 / 1_000_000, cacheRead: i * 0.1, cacheWrite: i * 1.25 };
  }
  const i = 3 / 1_000_000;
  return { input: i, output: 15 / 1_000_000, cacheRead: i * 0.1, cacheWrite: i * 1.25 };
}
