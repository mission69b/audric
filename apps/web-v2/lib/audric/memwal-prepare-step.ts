/**
 * MemWal `prepareStep` hook for web-v2's `Experimental_Agent` integration.
 *
 * **What this is.** A factory that returns an AI SDK `PrepareStepFunction`
 * callback the chat route passes into `new Agent({ prepareStep })`. The
 * callback:
 *
 *   1. At `stepNumber === 0` ONLY, calls `memoryStore.recall(latestUserMessage)`
 *      and caches the result in a closure for subsequent steps in the
 *      same turn. The engine's `MemoryStore` contract guarantees recall
 *      is the expensive operation (p95 470-675ms single via MemWal); per-
 *      step caching is load-bearing (multi-step turns under `stepCountIs`
 *      would otherwise recall N times — adapter spec `memory/store.ts`
 *      L80-84).
 *
 *   2. Renders the cached records into a `<memory_recall>` XML block and
 *      injects it as the system prompt for THIS step by returning
 *      `{ system: instructions + '\n\n' + block }`. Subsequent steps
 *      re-inject from the SAME cache (no recall, no extra latency).
 *
 *   3. Degrades gracefully on recall failure — logs a warning, populates
 *      the cache with `[]` so subsequent steps see no memory block, lets
 *      the turn proceed. Mirrors the engine's "memory infra outage
 *      doesn't wedge the user" contract (`v2/engine.ts` L1677-1684).
 *
 * **Why a helper file and not inlined in route.ts?**
 *
 *   - The `extractLatestUserMessage` + `buildMemoryRecallBlock` shapes
 *     duplicate the engine's `packages/engine/src/memory/{extract-user-
 *     message,build-memory-block}.ts` (both engine-internal, not yet
 *     exported from `@t2000/engine`). Localizing them here keeps the
 *     duplication boundary single-file and makes the format diff
 *     greppable when Phase 6 cleanup consolidates.
 *
 *   - The stateful `memoryCache` closure is per-request (one per
 *     `submitMessage`/`agent.stream` invocation). Wrapping it in a
 *     factory makes the lifecycle explicit at the call site (one
 *     factory call per request → one cache instance).
 *
 *   - This file is now the SOLE memory surface in the route. The
 *     legacy `buildMemoryContext` + `memoryBlock` field on
 *     `buildAudricSystemPrompt` were deleted in v0.7d Phase 6 Block A
 *     (S.221, 2026-05-21) alongside the `UserMemory` Prisma table.
 *
 * **Historical context (v0.7d Phase 1 staging — now retired).** Phase
 * 1 Day 1b initially wired MemWal recall ALONGSIDE the SQL-backed
 * `UserMemory` pipeline as a comparison window. Phase 6 Block A
 * deleted the legacy pipeline + Prisma table; from 2026-05-21 onward
 * MemWal is the only memory surface.
 *
 * **SSOT cross-references:**
 *   - Engine pattern this mirrors: `packages/engine/src/v2/engine.ts`
 *     `buildPrepareStepHook` (L1635-1700).
 *   - Format SSOT: `packages/engine/src/memory/build-memory-block.ts`
 *     (identical output shape).
 *   - Query extraction SSOT: `packages/engine/src/memory/extract-user-
 *     message.ts` (identical extraction semantics).
 */

import type { MemoryRecord } from "@t2000/engine";
import type { ModelMessage } from "ai";

import type { MemWalMemoryStore } from "./memwal-memory-store";

/**
 * Pull the latest USER message text from an AI SDK `ModelMessage[]`.
 * Returns `''` if no user message exists. Mirrors
 * `packages/engine/src/memory/extract-user-message.ts` exactly.
 */
function extractLatestUserMessage(messages: ModelMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "user") {
      continue;
    }
    return userContentToText(msg.content);
  }
  return "";
}

function userContentToText(content: ModelMessage["content"]): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .filter(
      (p): p is { type: "text"; text: string } =>
        typeof p === "object" && p !== null && "type" in p && p.type === "text"
    )
    .map((p) => p.text)
    .join(" ")
    .trim();
}

/**
 * Render top-K memory records into the `<memory_recall>` XML block.
 * Returns `''` for empty input so callers can skip the layer entirely.
 * Mirrors `packages/engine/src/memory/build-memory-block.ts` exactly.
 */
function buildMemoryRecallBlock(records: MemoryRecord[]): string {
  if (records.length === 0) {
    return "";
  }
  const items = records.map((r, i) => `  ${i + 1}. ${r.text}`).join("\n");
  return `<memory_recall>\n${items}\n</memory_recall>`;
}

export interface MemoryPrepareStepOptions {
  /** The MemWal store wrapped over the singleton client. `null` when
   * env vars are unset → returned prepareStep is a no-op. */
  memoryStore: MemWalMemoryStore | null;
  /** The full system prompt built by `buildAudricSystemPrompt`. Per-
   * step override prepends `<memory_recall>` to this string. */
  systemInstructions: string;
  /** Optional `topK` override. Default matches engine: 5. */
  topK?: number;
}

/**
 * The narrowest shape of the AI SDK `PrepareStepFunction` argument we
 * actually consume. The real type is `PrepareStepFunction<TOOLS>` in
 * `ai/dist/index.d.ts` and carries `steps`, `model`, `experimental_
 * context` — we ignore those, so a structural subtype is enough.
 */
type PrepareStepArg = {
  stepNumber: number;
  messages: ModelMessage[];
};

/**
 * Return type matches AI SDK's `PrepareStepResult` (all fields
 * optional). We only ever set `system`; returning `{}` is the documented
 * "no overrides for this step" sentinel.
 */
type PrepareStepReturn = { system?: string };

/**
 * Build the `prepareStep` callback for a single chat request. Returns
 * `undefined` when no memory store is configured (callers can pass the
 * result directly to `new Agent({ prepareStep })` — AI SDK treats an
 * undefined `prepareStep` as "use the agent's outer instructions
 * unchanged").
 *
 * When a memory store IS configured, the returned closure ALWAYS
 * returns a `{ system }` override on every step (per-step caching means
 * step 1+ still injects the cached recall without re-firing it). Empty
 * recall → bare `systemInstructions` (no `<memory_recall>` appended),
 * still returned as an explicit override to keep the type contract
 * uniform.
 *
 * The returned closure owns per-request state (`memoryCache`); each
 * call to this factory produces a fresh cache. Do not reuse the
 * callback across requests.
 */
export function buildMemoryPrepareStep(
  opts: MemoryPrepareStepOptions
): ((args: PrepareStepArg) => Promise<PrepareStepReturn>) | undefined {
  if (!opts.memoryStore) {
    return;
  }

  let memoryCache: { results: MemoryRecord[] } | null = null;
  const topK = opts.topK ?? 5;
  const { memoryStore, systemInstructions } = opts;

  return async ({ stepNumber, messages }) => {
    // [S.215 follow-on / 2026-05-21] Always-on diagnostic. Same lesson
    // we learned from S.213a — a safety net that only logs on the
    // unhappy path is unverifiable in production. Without this line we
    // could not distinguish "memwal client null (env vars unset)" from
    // "recall succeeded with empty results (cold start)" from "recall
    // threw and we swallowed it." Now every prepareStep invocation
    // emits one line; G2 acceptance is "this line appears in Vercel
    // logs after a chat turn."
    //
    // What we log:
    //   - `step=N` — which step of the AI SDK tool-loop fired (0 = first)
    //   - `query_chars=N` — length of the recall query (NOT the content,
    //     PII-safe). 0 means no user message extracted (turn 0 only).
    //   - `outcome=fresh|cached|empty-query|recall-failed` — provenance
    //     of the records the prompt got
    //   - `record_count=N` — number of memory records in the cache after
    //     this step's recall
    //   - `block_chars=N` — character length of the rendered
    //     `<memory_recall>` block (0 means no block was appended →
    //     systemInstructions passed through bare)
    //
    // What we DO NOT log: query text, record text, system prompt
    // content. Per env-validation-gate + general privacy hygiene —
    // memory layer is high-PII surface; we observe SHAPE not CONTENT.
    if (stepNumber === 0) {
      const userMessage = extractLatestUserMessage(messages);
      let outcome: "fresh" | "empty-query" | "recall-failed";
      if (userMessage.length === 0) {
        memoryCache = { results: [] };
        outcome = "empty-query";
      } else {
        try {
          const records = await memoryStore.recall(userMessage, { topK });
          memoryCache = { results: records };
          outcome = "fresh";
        } catch (err) {
          console.warn(
            "[web-v2 memwal-prepare-step] recall failed; continuing without memory:",
            err instanceof Error ? err.message : String(err)
          );
          memoryCache = { results: [] };
          outcome = "recall-failed";
        }
      }
      const records = memoryCache?.results ?? [];
      const block = buildMemoryRecallBlock(records);
      console.info(
        `[web-v2 memwal-prepare-step] step=${stepNumber} query_chars=${userMessage.length} outcome=${outcome} record_count=${records.length} block_chars=${block.length}`
      );
    } else {
      // Subsequent steps just re-inject from cache; logged at lower
      // detail since the recall already happened. Still emit a line so
      // the multi-step turn surfaces in logs (helps debug "did step 1
      // get the same memory layer as step 0?").
      const records = memoryCache?.results ?? [];
      const block = buildMemoryRecallBlock(records);
      console.info(
        `[web-v2 memwal-prepare-step] step=${stepNumber} outcome=cached record_count=${records.length} block_chars=${block.length}`
      );
    }

    const records = memoryCache?.results ?? [];
    const block = buildMemoryRecallBlock(records);
    return {
      system:
        block.length > 0
          ? `${systemInstructions}\n\n${block}`
          : systemInstructions,
    };
  };
}
