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
 *   - When v0.7d Phase 6 deletes `apps/web-v2/lib/audric/moat-context.ts`'s
 *     legacy `buildMemoryContext` + the legacy `memoryBlock` field on
 *     `buildAudricSystemPrompt`, this file becomes the sole memory
 *     surface in the route. The eventual cleanup (Phase 6) just deletes
 *     the legacy pieces; this file stays.
 *
 * **Phase 1 co-existence with legacy `memoryBlock` (per
 * BENEFITS_SPEC_v07d §E-1 staging).** Phase 1 Day 1b adds MemWal
 * recall ALONGSIDE the legacy SQL-backed `UserMemory` pipeline (the
 * `buildMemoryContext(memoryRecords)` call in route.ts that feeds the
 * `## Remembered Context` section of `buildAudricSystemPrompt`).
 * BOTH inject into the system prompt during Phases 1-5; Phase 6
 * deletes the legacy. The LLM sees two memory sections (legacy
 * `## Remembered Context` + MemWal `<memory_recall>`) during the
 * comparison window — intentional, lets the founder smoke quality
 * before deletion.
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
    if (stepNumber === 0) {
      const userMessage = extractLatestUserMessage(messages);
      if (userMessage.length === 0) {
        memoryCache = { results: [] };
      } else {
        try {
          const records = await memoryStore.recall(userMessage, { topK });
          memoryCache = { results: records };
        } catch (err) {
          console.warn(
            "[web-v2 memwal-prepare-step] recall failed; continuing without memory:",
            err instanceof Error ? err.message : String(err)
          );
          memoryCache = { results: [] };
        }
      }
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
