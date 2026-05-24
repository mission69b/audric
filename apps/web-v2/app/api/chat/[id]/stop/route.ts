/**
 * # POST /api/chat/[id]/stop — SPEC_AUDRIC_STREAM_RESUME Phase 1 + 3
 *
 * Explicit-stop endpoint for the chat shell's stop button.
 *
 * ## Why this exists
 *
 * Per AI SDK doc (`chatbot-resume-streams`), once a chat is resumable,
 * the native `useChat.stop()` becomes a DISCONNECT signal, NOT a cancel
 * signal — closing the local SSE leaves the server-side producer
 * running until natural completion. To support an explicit stop
 * gesture, the host MUST provide a dedicated endpoint that:
 *
 *   1. Validates the request matches the chat's CURRENT active stream
 *      (guards against stale stop clicks landing after a newer turn
 *      started — the AI SDK doc emphasises this race).
 *   2. Clears `Chat.activeStreamId` so subsequent reconnect attempts
 *      get 204 instead of replaying a stopped stream.
 *   3. **Phase 3:** signals the producer instance to abort the in-flight
 *      `audricAgent.stream({ abortSignal })` call via cross-instance
 *      Redis pub/sub (see `lib/stream-abort.ts`). The producer's
 *      `AbortController.abort()` halts the LLM call AND any chained
 *      tool execution, stopping Anthropic token spend mid-turn.
 *
 * ## What this DOES NOT do (still — Phase 3 honest scope)
 *
 * - **Doesn't kill an `Experimental_Agent` call that's already past
 *   the final step.** If the LLM has already streamed its last token
 *   before stop arrives, the abort is a no-op (the natural completion
 *   already fired). User-visible: tap stop after the message visibly
 *   completes → nothing to cancel. Correct behavior.
 * - **Doesn't persist a partial assistant snapshot.** Earlier draft
 *   accepted a `body.assistantMessage` snapshot; removed in self-audit
 *   because (a) `Message.id` is globally unique with no compound FK
 *   on chatId — an upsert keyed on id alone lets a hostile client
 *   overwrite role/parts of any message they know the id of (security
 *   bug) — and (b) even if scoped correctly, the natural-completion
 *   `saveMessages` would re-upsert with the FULL message immediately
 *   after, making the partial dead before any client could read it.
 *   The clean Phase 2/3 design uses a `Chat.stoppedAt DateTime?`
 *   sentinel that `onFinish` checks before re-persisting — not in
 *   Phase 1 scope.
 * - **Doesn't run on `beforeunload` / `pagehide` / nav cleanup.** Per
 *   AI SDK doc, navigation is a disconnect, not a stop. Only explicit
 *   user gesture should hit this endpoint. Phase 2's chat shell
 *   wiring respects this.
 *
 * ## Request shape
 *
 * ```json
 * { "activeStreamId": "uuid-of-stream-client-thinks-is-active" }
 * ```
 *
 * The single optional field. When present, the stale-stop guard
 * compares against the chat's CURRENT activeStreamId before clearing —
 * a stop click whose streamId no longer matches (because a newer turn
 * started in between) is ignored. When absent, the guard is skipped:
 * "stop whatever is active right now."
 *
 * ## Response shape
 *
 * Always returns 200 JSON `{ success: true }` after auth check, even
 * when there's nothing to stop. Idempotent — calling stop on a chat
 * with no active stream is a no-op.
 *
 * Mirrors the AI SDK doc's reference stop endpoint shape so future
 * audric chat-shell rewrites can adopt the doc's example client code
 * with minimal changes.
 */

import { getCurrentUser } from "@/lib/audric-auth";
import { prisma } from "@/lib/prisma";
import { publishAbort } from "@/lib/stream-abort";

type StopRequest = {
  activeStreamId?: string | null;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentUser();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  const walletAddress = session.user.id;

  const { id: chatId } = await params;
  if (!chatId) {
    return Response.json({ success: true });
  }

  // Lookup current active stream + ownership in one query.
  const chat = await prisma.chat.findFirst({
    where: { id: chatId, userSuiAddress: walletAddress },
    select: { activeStreamId: true },
  });
  if (!chat) {
    // Either chat doesn't exist or caller doesn't own it. Don't leak
    // existence — return 200 success so the same response covers
    // "successfully stopped nothing" and "you can't stop someone else's
    // chat." Symmetric with GET stream's 204 fallback.
    return Response.json({ success: true });
  }

  const currentActiveStreamId = chat.activeStreamId;
  if (!currentActiveStreamId) {
    return Response.json({ success: true });
  }

  // Parse body; tolerate malformed JSON (treat as empty body).
  let body: StopRequest = {};
  try {
    body = (await request.json()) as StopRequest;
  } catch {
    // Empty / invalid body is fine — caller is asserting "stop active."
  }

  // Stale-stop guard: if the client passed an activeStreamId AND it
  // doesn't match the chat's current active stream, ignore the stop.
  // This covers the race where a user double-taps stop on a slow chat:
  // the first POST cleared activeStreamId, the route then started a new
  // turn (new activeStreamId set), and the second POST should NOT
  // cancel the new turn just because it carries the old id.
  if (
    body.activeStreamId != null &&
    body.activeStreamId !== currentActiveStreamId
  ) {
    return Response.json({ success: true });
  }

  // Clear activeStreamId — but ONLY if it still matches the value we
  // read at the start of this handler. Belt-and-suspenders against the
  // race where a new turn started between our findFirst() and now.
  // Without this check, the new turn would lose its activeStreamId
  // immediately and the user couldn't resume that turn either.
  await prisma.chat.updateMany({
    where: {
      id: chatId,
      userSuiAddress: walletAddress,
      activeStreamId: currentActiveStreamId,
    },
    data: { activeStreamId: null },
  });

  // Note: we intentionally don't call the `setActiveStreamId` helper
  // here because it uses a simple where-clause without the
  // activeStreamId compare. The inline updateMany above gives us the
  // race-safe clear (compare-and-set semantics). The helper still
  // exists for the POST /api/chat onFinish path where the race isn't
  // possible (only one writer per chatId during the natural completion
  // window).

  // [SPEC_AUDRIC_STREAM_RESUME Phase 3 — 2026-05-24] Fan out the abort
  // signal to whichever Vercel instance is running the producer.
  // `publishAbort` returns the receiver count (0 if no producer is
  // subscribed — common case when the stream already completed and
  // we're racing the onFinish handler; harmless). Logged for the
  // `stop_explicit_count` telemetry slot in the SPEC.
  //
  // Fire-and-forget — the response can return before the publish
  // round-trips. The DB clear above is the source of truth for "stop
  // happened"; the abort signal is best-effort cost optimisation
  // (LLM token spend stops faster on success but the chat is
  // already in a correct end state without it).
  publishAbort(currentActiveStreamId)
    .then((receivers) => {
      console.info(
        `[stream-abort] stop_explicit chatId=${chatId} streamId=${currentActiveStreamId} receivers=${receivers}`
      );
    })
    .catch((err: unknown) => {
      console.error(
        `[stream-abort] publishAbort failed chatId=${chatId} (non-fatal):`,
        err instanceof Error ? err.message : String(err)
      );
    });

  return Response.json({ success: true });
}
