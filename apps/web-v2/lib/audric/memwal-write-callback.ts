/**
 * MemWal write-side hook for web-v2's `Experimental_Agent` integration.
 *
 * **What this is.** A factory that returns an AI SDK `onFinish` callback
 * the chat route passes into `new Agent({ onFinish })`. The callback
 * fires AFTER all steps of the agent's tool-loop complete (i.e. after
 * the user has received the full response). It calls
 * `memwal.analyze(userMessageText, namespace)` to ingest the turn — a
 * server-side LLM extracts facts, embeds + encrypts them, and uploads
 * to Walrus indexed by namespace. The next turn's recall (via
 * `memwal-prepare-step.ts`) can match against those facts.
 *
 * --- WHY ANALYZE() AND NOT REMEMBER() ---
 *
 * The MemWal SDK exposes two write APIs:
 *
 *   - `remember(text, ns)` — stores `text` verbatim as a single vector
 *     record. Cheap (no LLM). Best when the host has already extracted
 *     the fact ("user has $100 USDC saved").
 *   - `analyze(text, ns)` — feeds `text` to MemWal's server-side LLM,
 *     which extracts multiple facts, then embeds + encrypts + uploads
 *     each. More expensive (LLM call). Best for conversational snippets
 *     where the host doesn't know what's worth remembering.
 *
 * For Phase 2 we pick `analyze()`:
 *   1. **Smallest LoC** — one call replaces what would otherwise be a
 *      host-side fact-extraction classifier (the D-7 by-fragility
 *      pattern from BENEFITS_SPEC_v07a — deferred to a later phase).
 *   2. **Better extraction** — MemWal's server LLM is purpose-built for
 *      chat-snippet fact extraction; rebuilding it host-side is
 *      structural noise we'd later delete.
 *   3. **Matches the reference integration** — Mysten's `withMemWal()`
 *      middleware (which we deliberately do NOT use, see
 *      `audric-build-tracker.md` S.215 architectural review) wraps
 *      models with the same `analyze(userMessage)` pattern on stream
 *      finish. We adopt the write half; we keep the recall half on our
 *      own `prepareStep` (5-layer prompt control).
 *   4. **Future-proof** — when v0.7d Phase 4+ ships a D-7 fragility
 *      classifier that picks specific facts to `remember()` (e.g. tool
 *      results, advice events, transaction confirmations), those calls
 *      LAYER on top of analyze() without replacing it.
 *
 * --- WHY waitUntil() ---
 *
 * D-3 lock (`BENEFITS_SPEC_v07d.md` L350): "fire-and-forget post-turn."
 * The user's response must NOT be blocked on the analyze() round-trip
 * (MemWal p95 ingest is ~25s — would wedge the stream).
 *
 * The naive pattern `void memwal.analyze(...).catch(...)` is broken on
 * Vercel serverless: the function terminates as soon as the response
 * stream closes, killing the in-flight analyze() promise before the
 * write commits. We've already seen this class of bug eat fire-and-
 * forget writes in apps/web's legacy memory-extraction cron.
 *
 * `waitUntil(promise)` (from `@vercel/functions`) is the canonical
 * Vercel pattern for "keep the function alive until this promise
 * resolves, but let the user's response finalize NOW." Net effect:
 *   - User sees the response stream close at normal latency
 *   - Function billing extends to cover the analyze() round-trip
 *   - Write is guaranteed to commit before the function terminates
 *
 * --- ERROR HANDLING ---
 *
 * Errors are caught + logged as `console.warn` (not console.error —
 * memory infra is fail-open per D-3: "memory infra outage doesn't
 * wedge the user"). The next turn's recall just returns empty until
 * MemWal is healthy again; user-facing chat continues normally.
 *
 * --- WHAT WE LOG ---
 *
 * PII-safe (shapes, not content). One line per chat turn at most:
 *   - `analyze ok: fact_count=N status=... query_chars=N` on success
 *   - `analyze failed: <error.message>` on failure
 *
 * What we DO NOT log: the user message text, extracted fact text, the
 * namespace beyond a 10-char prefix. Same posture as
 * `memwal-prepare-step.ts` — memory layer is high-PII surface.
 *
 * --- SSOT cross-references ---
 *   - Phase 2 spec → `spec/active/BENEFITS_SPEC_v07d.md` §"Phase 2"
 *     + G3 acceptance gate
 *   - D-3 fire-and-forget lock → same SPEC L350
 *   - MemWal SDK API → `@mysten-incubation/memwal/dist/memwal.d.ts`
 *     `analyze(text, namespace?) → Promise<AnalyzeResult>`
 *   - Recall counterpart → `lib/audric/memwal-prepare-step.ts`
 */

import type { MemWal } from "@mysten-incubation/memwal";
import { waitUntil } from "@vercel/functions";

export interface MemoryWriteCallbackOptions {
  /** The MemWal singleton client. `null` when env vars are unset →
   * returned callback is `undefined` (no-op). */
  memwal: MemWal | null;
  /** Per-user namespace, e.g. `audric:user:0x7f20...`. The same
   * namespace `memwal-prepare-step.ts` recalls from. */
  namespace: string;
  /** The latest user message text for this turn. Extracted by the
   * route via `extractLatestUserMessage` (re-exported from
   * `memwal-prepare-step.ts`). Empty string → returned callback is
   * `undefined` (no user turn to ingest, e.g. tool-result-only resume). */
  userMessageText: string;
}

/**
 * Build the `onFinish` callback for a single chat request. Returns
 * `undefined` when (a) no MemWal client is configured OR (b) the turn
 * has no user message text to ingest. Callers can pass the result
 * directly to `new Agent({ onFinish })` — AI SDK treats an undefined
 * `onFinish` as "no completion hook."
 *
 * The returned callback ignores its event argument; the user message
 * text is captured at factory-construction time (the `messages` array
 * passed to `agent.stream()` is immutable for the duration of the
 * stream, so closure capture is safe).
 */
export function buildMemoryWriteCallback(
  opts: MemoryWriteCallbackOptions
): ((event: unknown) => void) | undefined {
  if (!opts.memwal || opts.userMessageText.length === 0) {
    return;
  }
  const { memwal, namespace, userMessageText } = opts;

  return () => {
    waitUntil(
      memwal.analyze(userMessageText, namespace).then(
        (result) => {
          console.info(
            `[web-v2 memwal-write] analyze ok: fact_count=${result.fact_count} status=${result.status} query_chars=${userMessageText.length} namespace=${namespace.slice(0, 16)}...`
          );
        },
        (err: unknown) => {
          console.warn(
            "[web-v2 memwal-write] analyze failed:",
            err instanceof Error ? err.message : String(err)
          );
        }
      )
    );
  };
}
