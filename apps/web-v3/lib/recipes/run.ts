/**
 * Client-side Recipe runner (SPEC_AUDRIC_V3 §9 Phase 4b). Runs a recipe's paid
 * steps in sequence on the zkLogin Passport session key (via `payService` — the
 * proven client-sign x402 bridge), collecting each service's response.
 *
 * Per-call settlement is "settle-then-serve": a failed upstream is auto-refunded
 * and NEVER charged (so we never blind-retry). Steps are independent, so one
 * failure doesn't abort the run — we collect what we can and report the rest as
 * partial, charging only for what actually returned.
 */

import { payService } from "@/lib/wallet/pay";
import { normalizeInputs, type Recipe, recipePriceUsd } from "./catalog";

export type RecipeStepResult = {
  key: string;
  label: string;
  service: string;
  ok: boolean;
  data?: unknown;
  error?: string;
  reference?: string;
  cost?: number;
};

export type RecipeRunResult = {
  recipeId: string;
  recipeName: string;
  /** Collected response bodies keyed by step.key (only successful steps). */
  data: Record<string, unknown>;
  steps: RecipeStepResult[];
  paidUsd: number;
  quotedUsd: number;
  partial: boolean;
  /** What the agent should produce from `data` (drives createDocument). */
  instruction: string;
};

export type StepStatus = "running" | "done" | "error";

export async function runRecipe(
  recipe: Recipe,
  rawInputs: Record<string, string>,
  onProgress?: (key: string, status: StepStatus) => void
): Promise<RecipeRunResult> {
  const inputs = normalizeInputs(recipe, rawInputs);
  const steps: RecipeStepResult[] = [];
  const data: Record<string, unknown> = {};
  let paidUsd = 0;

  for (const step of recipe.steps) {
    onProgress?.(step.key, "running");
    try {
      const res = await payService({
        url: step.url,
        method: step.method,
        body: JSON.stringify(step.body(inputs)),
        maxPrice: step.priceUsd,
      });
      data[step.key] = res.body;
      paidUsd += res.cost ?? step.priceUsd;
      steps.push({
        key: step.key,
        label: step.label,
        service: step.service,
        ok: true,
        data: res.body,
        reference: res.receipt?.reference,
        cost: res.cost ?? step.priceUsd,
      });
      onProgress?.(step.key, "done");
    } catch (e) {
      steps.push({
        key: step.key,
        label: step.label,
        service: step.service,
        ok: false,
        error: (e as Error).message,
      });
      onProgress?.(step.key, "error");
    }
  }

  return {
    recipeId: recipe.id,
    recipeName: recipe.name,
    data,
    steps,
    paidUsd: Math.round(paidUsd * 1_000_000) / 1_000_000,
    quotedUsd: recipePriceUsd(recipe),
    partial: steps.some((s) => !s.ok),
    instruction: recipe.synthesisInstruction(inputs),
  };
}
