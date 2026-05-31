/**
 * Stream text-part framing — the lazy `text-start` decision.
 *
 * Extracted from `app/api/chat/route.ts` (the streaming loop) so the
 * reasoning-before-text ordering invariant is unit-testable in isolation.
 *
 * ## Why this exists (the regression it guards)
 *
 * Audric drives a manual UIMessage stream (it can't use AI SDK's
 * `toUIMessageStream()` because of bundle markers, B2 dedup, PII
 * redaction, and swap-quote pairing — all needing chunk-level control).
 * The order parts land in `parts[]` is the order they're rendered in the
 * client.
 *
 * Pre-fix, the route emitted `text-start` EAGERLY at `start-step`, before
 * the model streamed anything. Anthropic always streams extended-thinking
 * (`reasoning-*`) chunks BEFORE prose, so the eager open meant the empty
 * `text` part occupied an earlier `parts[]` slot than the reasoning parts —
 * and the `<Reasoning>` accordion rendered BELOW the answer (after tools),
 * not at the top under the prompt. That's the "thinking accordion comes
 * last" bug.
 *
 * The fix: open the `text` part LAZILY — only when real prose (or an error)
 * first arrives. Any `reasoning-*` chunks that streamed earlier therefore
 * occupy earlier slots, so the accordion sits first (vercel/chatbot parity).
 *
 * `shouldEmitTextStart` is the single decision point. Keep it pure so the
 * test can replay a chunk sequence and assert the ordering holds.
 */

/** Minimal structural view of an AI SDK `fullStream` chunk. */
export type StreamFramingChunk = {
  type: string;
  text?: unknown;
};

/**
 * Decide whether to open the assistant `text` UIMessage part for this
 * chunk, given whether it's already open.
 *
 * Returns `true` only on the FIRST non-empty `text-delta` (real prose) or
 * an `error` chunk, and only while the part is still closed. Reasoning,
 * tool, lifecycle, and empty `text-delta` chunks never open it — so they
 * keep their earlier `parts[]` position and the reasoning accordion stays
 * on top.
 *
 * Mirrors `translateChunk`'s own empty-text skip so a zero-length delta
 * can't prematurely open the part.
 */
export function shouldEmitTextStart(
  chunk: StreamFramingChunk,
  alreadyStarted: boolean
): boolean {
  if (alreadyStarted) {
    return false;
  }
  if (chunk.type === "error") {
    return true;
  }
  return (
    chunk.type === "text-delta" &&
    typeof chunk.text === "string" &&
    chunk.text.length > 0
  );
}
