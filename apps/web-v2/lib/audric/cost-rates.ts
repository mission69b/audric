/**
 * Per-model token-cost rates for TurnMetrics accounting.
 *
 * **Vendored** (byte-identical to `audric/web/lib/engine/cost-rates.ts`)
 * per the Day 2b cross-app-import audit. The audric/web source has no
 * `@/`-alias imports so cross-package import would work mechanically,
 * but at ~30 LoC standalone, vendoring is simpler and avoids deep
 * coupling to the legacy chat-route module tree. Phase 6 cutover
 * collapses both copies into a shared lib.
 *
 * Per-million-token Anthropic pricing as of late 2025:
 *   Haiku 4.5:  $1 input / $5 output
 *   Sonnet 4.6: $3 input / $15 output
 *   Opus 4.6:   $15 input / $75 output
 * Cache reads bill at 0.1× input rate, cache writes at 1.25× input rate.
 */

export interface ModelCostRates {
  cacheRead: number;
  cacheWrite: number;
  input: number;
  output: number;
}

export function costRatesForModel(model: string): ModelCostRates {
  if (model.includes("haiku")) {
    const i = 1 / 1_000_000;
    return {
      input: i,
      output: 5 / 1_000_000,
      cacheRead: i * 0.1,
      cacheWrite: i * 1.25,
    };
  }
  if (model.includes("opus")) {
    const i = 15 / 1_000_000;
    return {
      input: i,
      output: 75 / 1_000_000,
      cacheRead: i * 0.1,
      cacheWrite: i * 1.25,
    };
  }
  const i = 3 / 1_000_000;
  return {
    input: i,
    output: 15 / 1_000_000,
    cacheRead: i * 0.1,
    cacheWrite: i * 1.25,
  };
}
