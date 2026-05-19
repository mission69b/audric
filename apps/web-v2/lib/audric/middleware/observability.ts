/**
 * Audric observability middleware (Phase 5.5 / D-17 / G8.5 — 2026-05-19).
 *
 * `wrapLanguageModel`-compatible LanguageModelV3Middleware that emits a
 * per-LLM-call telemetry line to console with PII redacted. Wraps both
 * `generate` (non-streaming) and `stream` paths so the same line shape
 * fires for any model invocation through this route.
 *
 * --- WHY THIS LIVES AT THE MODEL LAYER, NOT THE STREAM LAYER ---
 *
 * Three observability signals about LLM behaviour are useful per call:
 *   (a) inbound request size — prompt-tokens estimate (catches the
 *       "context blew up" failure mode)
 *   (b) outbound response latency — model wall time, distinct from
 *       full route time (catches "the LLM is slow today" vs "our
 *       post-processing is slow")
 *   (c) inbound user message text — for grep-debug of "why did the
 *       LLM do X here", PII-redacted so logs are safe under Vercel's
 *       multi-week retention.
 *
 * `experimental_telemetry` already streams OTel spans to the Vercel AI
 * Gateway dashboard, but the dashboard is per-call latency + per-step
 * tokens; the call IS observable there. What `experimental_telemetry`
 * does NOT give you is a printable per-call line you can `grep` for
 * in `vercel logs` (and one that's PII-safe). That's what this
 * middleware is for — the human-grep companion to the dashboard.
 *
 * --- WHAT THIS MIDDLEWARE DOES NOT DO ---
 *
 * Does NOT redact the prompt sent to the model. The user's own wallet
 * address (in the system prompt via `buildAudricDay2bSystemPrompt`)
 * and recipient addresses in user text are load-bearing for tool
 * intent extraction — redacting them would break the agent. The
 * model SEES addresses; we just don't LOG them.
 *
 * Does NOT short-circuit, cache, or transform the request/response.
 * Pure-observation middleware. Caching is the AI Gateway's job
 * (`providerOptions.gateway.caching: 'auto'`); retries are the gateway's
 * failover ladder; transformation isn't needed.
 *
 * --- ARCHITECTURAL NOTE ON D-17 ---
 *
 * The D-17 spec's "convert guards + preflight to middleware adapters"
 * framing matched legacy `apps/web`'s decorator-wrapped `streamText`.
 * web-v2 was forked onto engine helpers (`toAISDKTools` runs guards
 * inside `tool.execute()`, where the dispatched tool name is in scope —
 * model middleware runs BEFORE tool dispatch and doesn't have one).
 *
 * The correct architectural home for each D-17 concern in web-v2:
 *   - guards (14)        → engine `tool.execute()` via `toAISDKTools`
 *                          (activated this phase via guards: DEFAULT_GUARD_CONFIG)
 *   - preflight (12)     → engine `tool.execute()` (already active since Phase 3)
 *   - PII redaction      → logging layer (`lib/audric/log-redact.ts` adopted
 *                          at top-traffic call sites this phase)
 *   - LLM telemetry      → `experimental_telemetry` (Vercel dashboard, since Phase 2)
 *                          + this middleware (console-grep companion, this phase)
 *
 * The SPEC's "~400-600 LoC deletes" claim was sized against legacy
 * audric/web's decorator boilerplate; web-v2 sits on engine helpers
 * that already removed that boilerplate, so the delete-side is ~0.
 */

import type { LanguageModelV3Middleware } from "@ai-sdk/provider";
import { redactAddressesInText } from "../log-redact";

/**
 * Best-effort extraction of the last user-authored text from a
 * LanguageModelV3 prompt. Returns up to 120 characters with embedded
 * addresses redacted. Empty string if no user text is found.
 *
 * The shape walked here is `LanguageModelV3Message[]`:
 *   - user content is `Array<{type:'text', text:string} | {type:'file', ...}>`
 *   - we pull the last `text` part of the last `user` message.
 */
function extractLastUserText(prompt: unknown): string {
  if (!Array.isArray(prompt)) {
    return "";
  }
  for (let i = prompt.length - 1; i >= 0; i--) {
    const msg = prompt[i] as { role?: string; content?: unknown } | undefined;
    if (!msg || msg.role !== "user" || !Array.isArray(msg.content)) {
      continue;
    }
    const parts = msg.content as Array<{
      type?: string;
      text?: string;
    }>;
    for (let j = parts.length - 1; j >= 0; j--) {
      const part = parts[j];
      if (part?.type === "text" && typeof part.text === "string") {
        const text = part.text;
        const truncated = text.length > 120 ? `${text.slice(0, 117)}...` : text;
        return redactAddressesInText(truncated);
      }
    }
  }
  return "";
}

/**
 * Estimate prompt token count via the standard chars/4 heuristic. Coarse
 * but free — used for the "inbound size sanity" log only. Real token
 * counts come from `experimental_telemetry` after the model responds.
 */
const CHARS_PER_TOKEN_ESTIMATE = 4;
function estimatePromptTokens(prompt: unknown): number {
  if (!Array.isArray(prompt)) {
    return 0;
  }
  let chars = 0;
  for (const msg of prompt as Array<{
    role?: string;
    content?: unknown;
  }>) {
    if (typeof msg.content === "string") {
      chars += msg.content.length;
      continue;
    }
    if (Array.isArray(msg.content)) {
      for (const part of msg.content as Array<{
        type?: string;
        text?: string;
        input?: unknown;
      }>) {
        if (part.type === "text" && typeof part.text === "string") {
          chars += part.text.length;
        } else if (part.type === "tool-call" && part.input !== undefined) {
          chars += JSON.stringify(part.input).length;
        }
      }
    }
  }
  return Math.ceil(chars / CHARS_PER_TOKEN_ESTIMATE);
}

/**
 * The middleware itself. `wrapLanguageModel({ model, middleware: [audricObservabilityMiddleware] })`
 * threads every `generate` / `stream` call through these hooks.
 *
 * Identity by design — never mutates params, never short-circuits,
 * never replaces the response. Pure observation.
 */
export const audricObservabilityMiddleware: LanguageModelV3Middleware = {
  specificationVersion: "v3",

  wrapGenerate: async ({ doGenerate, params, model }) => {
    const startedAt = Date.now();
    const tokensIn = estimatePromptTokens(params.prompt);
    const lastUserText = extractLastUserText(params.prompt);
    console.log(
      `[audric-llm] generate start provider=${model.provider} model=${model.modelId} prompt~${tokensIn}tok lastUser="${lastUserText}"`
    );
    try {
      const result = await doGenerate();
      console.log(
        `[audric-llm] generate done provider=${model.provider} model=${model.modelId} dur=${Date.now() - startedAt}ms`
      );
      return result;
    } catch (err) {
      console.error(
        `[audric-llm] generate FAIL provider=${model.provider} model=${model.modelId} dur=${Date.now() - startedAt}ms err=${
          err instanceof Error ? err.message : String(err)
        }`
      );
      throw err;
    }
  },

  wrapStream: async ({ doStream, params, model }) => {
    const startedAt = Date.now();
    const tokensIn = estimatePromptTokens(params.prompt);
    const lastUserText = extractLastUserText(params.prompt);
    console.log(
      `[audric-llm] stream start provider=${model.provider} model=${model.modelId} prompt~${tokensIn}tok lastUser="${lastUserText}"`
    );
    try {
      const result = await doStream();
      // The stream itself is consumed downstream; we log "done" when
      // the upstream `doStream()` resolves (which is at first-byte,
      // not last-byte). Full-stream wall time is in the OTel span;
      // this line tells you when the LLM started responding.
      console.log(
        `[audric-llm] stream first-byte provider=${model.provider} model=${model.modelId} dur=${Date.now() - startedAt}ms`
      );
      return result;
    } catch (err) {
      console.error(
        `[audric-llm] stream FAIL provider=${model.provider} model=${model.modelId} dur=${Date.now() - startedAt}ms err=${
          err instanceof Error ? err.message : String(err)
        }`
      );
      throw err;
    }
  },
};
