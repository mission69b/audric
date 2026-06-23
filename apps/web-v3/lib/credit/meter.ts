/**
 * Credit metering (Phase 5, SPEC_AUDRIC_TOPUP_METERING §3a-bis) — premium chat
 * is debited per-token against the credit balance; the free model debits
 * nothing. Pure: computes a micro-USD debit from a turn's token usage + the
 * model's Gateway price.
 *
 * MARGIN is a config knob: 1.0 = pass-through (debit = underlying Gateway cost).
 * Raise it to add margin once usage/cost data exists (the spec defers the
 * number — TODO(usage-data)). Kept here so pricing lives in ONE place.
 */

import { allChatModels, type ModelPricing } from "@/lib/ai/models";

// 1.4 = the DEFAULT markup over the underlying Gateway cost (used for any model
// without a per-model `margin`). Per-model overrides land the curated lineup a
// few % under Venice (the undercut-Venice rule — SPEC_AUDRIC_API): Grok 1.10,
// Sonnet 1.15, Opus 1.15, GPT-5.5 1.20. The switcher + the debit both use the
// resolved margin via `marginFor`, so charged === displayed === debited.
export const CREDIT_MARGIN = 1.4;

/** Resolve the credit margin for a model — its per-model `margin` or the
 * default. ONE source for both the displayed rate (/api/models) and the
 * debit (here), so they can never drift. */
export function marginFor(modelId: string): number {
  return allChatModels.find((m) => m.id === modelId)?.margin ?? CREDIT_MARGIN;
}

export type TurnUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

/**
 * Micro-USD to debit for a turn. per-1M-USD × tokens, scaled to micros, the
 * 1e6s cancel: `tokens × per1M` is already micro-USD. Returns 0 if no pricing.
 */
export function debitMicrosForUsage(
  usage: TurnUsage,
  pricing: ModelPricing | undefined,
  margin: number = CREDIT_MARGIN
): number {
  if (!pricing) {
    return 0;
  }
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  const micros =
    (input * (pricing.inputPer1M ?? 0) + output * (pricing.outputPer1M ?? 0)) *
    margin;
  return Math.max(0, Math.round(micros));
}
