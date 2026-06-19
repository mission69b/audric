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

import type { ModelPricing } from "@/lib/ai/models";

export const CREDIT_MARGIN = 1.0;

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
  pricing: ModelPricing | undefined
): number {
  if (!pricing) {
    return 0;
  }
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  const micros =
    (input * (pricing.inputPer1M ?? 0) + output * (pricing.outputPer1M ?? 0)) *
    CREDIT_MARGIN;
  return Math.max(0, Math.round(micros));
}
