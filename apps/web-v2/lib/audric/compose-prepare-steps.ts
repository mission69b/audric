/**
 * Compose multiple AI SDK `prepareStep` callbacks into one.
 *
 * [SPEC_AI_SDK_HARDENING P3.1 — 2026-05-24]
 *
 * ## Why this exists
 *
 * AI SDK's `Experimental_Agent` accepts a single `prepareStep` callback.
 * Web-v2 needs two:
 *
 *   1. `buildMemoryPrepareStep` — injects `<memory_recall>` into the
 *      step's system prompt via the `system` return field.
 *   2. `buildActiveToolsPrepareStep` — narrows the agent's tool surface
 *      per turn via the `activeTools` return field.
 *
 * The two callbacks set DIFFERENT return fields (`system` vs
 * `activeTools`) so a shallow merge is sufficient. This module hides
 * the merge and parallelization boilerplate behind a one-liner the
 * route calls at agent-construction time.
 *
 * ## Execution model
 *
 * The composer runs the inner callbacks in PARALLEL via `Promise.all`.
 * Each AI SDK step boundary fires `prepareStep` once; if memwal recall
 * takes ~500ms and the active-tools classifier takes <1ms, the
 * effective latency is whichever is slower (~500ms). No serial
 * latency penalty.
 *
 * ## Result merge
 *
 * Shallow `Object.assign({}, ...results)` semantics: later callbacks
 * override earlier ones for the same field. Today no two callbacks set
 * the same field, but if a future callback ALSO returns `system`,
 * declare it intentionally and document the precedence at the call
 * site (composer order is the precedence order).
 *
 * `model` overrides (model-switching per step) work the same way — last
 * non-undefined wins. Not used today; documented for the future.
 *
 * ## undefined handling
 *
 * `undefined` callbacks are filtered out, so callers can pass
 * `buildXPrepareStep()`'s `undefined`-on-degenerate-input return value
 * directly without unwrapping. Returns `undefined` itself when ALL
 * inputs are undefined (matches AI SDK's "no prepareStep" sentinel —
 * the agent's outer config passes through).
 */

import type { LanguageModel, ModelMessage } from "ai";

/**
 * Shape of an AI SDK PrepareStep argument we care about. Mirrors the
 * `PrepareStepArg` type in each individual prepareStep module — the
 * real `PrepareStepFunction<TOOLS>` from `ai` carries `steps`, `model`,
 * `experimental_context` which the composer ignores (it just forwards
 * args verbatim to each inner callback).
 */
export type PrepareStepArg = {
  stepNumber: number;
  messages: ModelMessage[];
};

/**
 * Shape of an AI SDK PrepareStep return. All fields optional; returning
 * `{}` is the documented "no overrides for this step" sentinel.
 *
 * Composer-relevant fields:
 *   - `system?` — per-step system prompt override (memwal owns this)
 *   - `activeTools?` — per-step tool subset (active-tools owns this)
 *   - `model?` — per-step model swap (no consumer today; preserved for forward-compat)
 */
export type PrepareStepReturn = {
  activeTools?: string[];
  system?: string;
  /** Per-step model override. Composer is structural — it never
   * inspects the value, just forwards it through to the AI SDK
   * config that ultimately consumes the merged return. */
  model?: LanguageModel;
};

export type PrepareStepFn = (
  args: PrepareStepArg
) => Promise<PrepareStepReturn> | PrepareStepReturn;

/**
 * Compose N prepareStep callbacks into one. Undefined entries are
 * filtered. Returns `undefined` if every input is `undefined` so
 * callers can pass the result straight into `new Agent({ prepareStep })`.
 */
export function composePrepareSteps(
  ...fns: Array<PrepareStepFn | undefined>
): PrepareStepFn | undefined {
  const live = fns.filter((f): f is PrepareStepFn => f !== undefined);
  if (live.length === 0) {
    return;
  }
  if (live.length === 1) {
    return live[0];
  }

  return async (args) => {
    const results = await Promise.all(live.map((f) => f(args)));
    const merged: PrepareStepReturn = {};
    for (const result of results) {
      if (result.system !== undefined) {
        merged.system = result.system;
      }
      if (result.activeTools !== undefined) {
        merged.activeTools = result.activeTools;
      }
      if (result.model !== undefined) {
        merged.model = result.model;
      }
    }
    return merged;
  };
}
