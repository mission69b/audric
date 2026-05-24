/**
 * AI SDK v6 `experimental_repairToolCall` callback for the audric chat
 * Agent (`Experimental_Agent` in `app/api/chat/route.ts`).
 *
 * [SPEC_AI_SDK_HARDENING P3.2 — 2026-05-24]
 *
 * Two error classes flow through this seam:
 *
 *   - NoSuchToolError       — model picked a tool that doesn't exist.
 *                             We can't repair the NAME, so we return
 *                             null and let the agent's natural re-plan
 *                             loop handle it on the next step. (Saves
 *                             a phantom repair attempt and the LLM
 *                             tokens that come with it.)
 *
 *   - InvalidToolInputError — model called a real tool with bad input
 *                             (missing required field, wrong type,
 *                             constraint violation, etc.). We re-prompt
 *                             the same model with the tool's JSON
 *                             Schema + the validation error message
 *                             and ask it to emit corrected input.
 *                             Cheaper than the natural "error →
 *                             re-plan from scratch" turn because the
 *                             repair call is a single structured-output
 *                             call with no tools attached (the model
 *                             only has to think about the JSON shape,
 *                             not which tool to call).
 *
 * Returning `null` from this function defers to the SDK's default
 * behavior: the tool-input error is surfaced to the LLM as a normal
 * tool error, the LLM re-plans on the next step. This is the safe
 * fallback whenever the repair attempt itself fails (provider outage,
 * still-invalid output after repair, etc.).
 *
 * Cost shape: ~1 extra LLM round-trip per malformed call. Roughly
 * equivalent to the natural re-plan it replaces (both call the model
 * once). The win is UX — no glitchy "tool error → retry" sequence
 * visible to the user; the call just works on attempt #2 invisibly.
 *
 * Observability: every repair attempt emits a console line tagged
 * `[audric-chat] tool-call-repair:` so we can see in production logs
 * (a) how often repair fires, (b) what tools trip it, (c) whether the
 * secondary call succeeds. Pair with the existing tracker S.300 line
 * to spot rollout regressions.
 *
 * Not yet wired (follow-up): swap the BundleBuffer cap-overrun
 * synthesize-tool-error (Option A from P7.1) to route the overrun
 * through repair (Option B) — see `app/api/chat/route.ts` around the
 * `MAX_BUNDLE_OPS` enforcement block. P3.2 enables the seam; the swap
 * is its own change so the diffs stay surgical.
 */

import {
  generateText,
  jsonSchema,
  type LanguageModel,
  NoSuchToolError,
  Output,
  type ToolCallRepairFunction,
  type ToolSet,
} from "ai";
import { redactAddressesInText } from "./log-redact";

/**
 * Build the repair callback. Bind once per request and pass to
 * `new Experimental_Agent({ experimental_repairToolCall: ... })`.
 *
 * The `model` arg is the same `LanguageModel` the agent uses for the
 * primary turn — sharing the model keeps the repair call inside the
 * same provider / caching / observability middleware chain
 * (`defaultSettingsMiddleware` + `audricObservabilityMiddleware`).
 */
export function buildToolCallRepair<TOOLS extends ToolSet>(opts: {
  model: LanguageModel;
}): ToolCallRepairFunction<TOOLS> {
  const { model } = opts;

  return async ({ toolCall, error, inputSchema }) => {
    if (NoSuchToolError.isInstance(error)) {
      console.warn(
        `[audric-chat] tool-call-repair: NoSuchToolError for "${toolCall.toolName}" — returning null (model will re-plan on next step)`
      );
      return null;
    }

    // Anything else is treated as InvalidToolInputError (the only other
    // type the SDK passes here per ToolCallRepairFunction's contract).
    // The try/catch ensures a repair-side failure (provider outage,
    // still-invalid output after generateText's own retries, etc.)
    // falls back to the null path so the user always gets a turn out.
    try {
      const schema = await inputSchema({ toolName: toolCall.toolName });
      // Per `LanguageModelV3ToolCall.input` type, `input` is a
      // stringified JSON payload. Try to parse + pretty-print it so
      // the repair model sees a friendly object literal instead of an
      // escaped string. If the payload is unparseable (which is itself
      // a valid reason for schema failure), fall back to the raw
      // string so the model still has SOMETHING to fix.
      let badInputDisplay: string;
      try {
        badInputDisplay = JSON.stringify(JSON.parse(toolCall.input), null, 2);
      } catch {
        badInputDisplay = String(toolCall.input);
      }
      const result = await generateText({
        model,
        output: Output.object({ schema: jsonSchema(schema) }),
        prompt: [
          `A tool call to "${toolCall.toolName}" failed schema validation.`,
          "",
          "Invalid input:",
          badInputDisplay,
          "",
          `Validation error: ${error.message}`,
          "",
          "Return the corrected input as a JSON object that matches the schema. Do NOT include any other text.",
        ].join("\n"),
      });
      console.info(
        `[audric-chat] tool-call-repair: repaired "${toolCall.toolName}" (id=${toolCall.toolCallId})`
      );
      return { ...toolCall, input: JSON.stringify(result.output) };
    } catch (repairErr) {
      const msg =
        repairErr instanceof Error ? repairErr.message : String(repairErr);
      console.warn(
        `[audric-chat] tool-call-repair: secondary call failed for "${toolCall.toolName}" — returning null. error=${redactAddressesInText(msg)}`
      );
      return null;
    }
  };
}
