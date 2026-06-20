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
  error?: string;
  reference?: string;
  cost?: number;
};

/**
 * Bound a service response for synthesis. The raw multi-service blob (Brave web
 * + Exa + Brave news + Perplexity) is huge — a single Brave web response alone
 * is ~150KB of mostly-irrelevant nested metadata (`mixed`/`discussions`/`faq`,
 * per-result `meta_url`/`profile`/`thumbnail`/`extra_snippets`). Replayed in
 * full as the tool result it overran the upstream provider's request-size limit
 * → the Gateway 400'd ("Invalid arguments passed to the model") and synthesis
 * failed AFTER the user had paid. We cap array length + string length (which
 * kills the noise) while preserving the prose + citations synthesis needs.
 * Model-agnostic and generic (no per-API coupling).
 */
const MAX_STR = 4000;
const MAX_ARR = 10;
const MAX_DEPTH = 10;
function compactForSynthesis(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    return value.length > MAX_STR
      ? `${value.slice(0, MAX_STR)}…[+${value.length - MAX_STR}]`
      : value;
  }
  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) {
      return `[array(${value.length})]`;
    }
    const out = value
      .slice(0, MAX_ARR)
      .map((v) => compactForSynthesis(v, depth + 1));
    if (value.length > MAX_ARR) {
      out.push(`…[+${value.length - MAX_ARR} more]`);
    }
    return out;
  }
  if (value && typeof value === "object") {
    if (depth >= MAX_DEPTH) {
      return "[object]";
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = compactForSynthesis(v, depth + 1);
    }
    return out;
  }
  return value;
}

export type RecipeRunResult = {
  recipeId: string;
  recipeName: string;
  /** Collected response bodies keyed by step.key (only successful steps). */
  data: Record<string, unknown>;
  steps: RecipeStepResult[];
  paidUsd: number;
  quotedUsd: number;
  partial: boolean;
  /** What the agent should produce from `data` (synthesized inline). */
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
      // Compact each response (the model synthesizes from `data`). NOT stored on
      // the step too — that duplicated every response in the replayed tool
      // result (~440KB → over the provider request-size cap). The step row only
      // needs label/ok/cost for the UI + receipt.
      data[step.key] = compactForSynthesis(res.body);
      paidUsd += res.cost ?? step.priceUsd;
      steps.push({
        key: step.key,
        label: step.label,
        service: step.service,
        ok: true,
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
