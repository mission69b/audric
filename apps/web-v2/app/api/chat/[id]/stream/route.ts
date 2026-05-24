/**
 * # GET /api/chat/[id]/stream — SPEC_AUDRIC_STREAM_RESUME Phase 1
 *
 * Resumable-stream reconnect endpoint. `useChat({ resume: true })` (Phase
 * 2) calls this on mount; the handler decides between:
 *
 *   - 204 (No Content) — no active stream for this chat. Client renders
 *     the persisted message history and waits for user input.
 *   - 200 (text/event-stream) — active stream exists. Reconnect via
 *     `resumable-stream`'s pub/sub layer; the producer (started by the
 *     POST /api/chat handler's `consumeSseStream` callback) is still
 *     running on a (possibly different) Vercel instance, and we wire
 *     its buffered + future chunks into this response.
 *   - 401 (Unauthorized) — no session.
 *   - (implicit 204) — chat not found OR caller doesn't own the chat.
 *     Both leak nothing; treated identically to "no active stream" per
 *     `getActiveStreamId`'s ownership-gated select.
 *
 * Per the AI SDK doc (`chatbot-resume-streams`), 204 is the canonical
 * "nothing to resume" response and `useChat` handles it by skipping
 * reconnection. We don't return 404 because that would leak chat
 * existence to non-owners.
 *
 * ## Why no body validation
 *
 * GET — no body. The chat id is in the URL path, validated via
 * `params.id`. The caller's identity is the session.
 *
 * ## Feature flag short-circuit
 *
 * When `getResumableStreamContext()` returns null (flag off OR Redis
 * unavailable), this route returns 204 unconditionally. That matches
 * the v0.7e behavior the client expects pre-feature-enable and avoids
 * confusing 500s during the soak window.
 */

import { UI_MESSAGE_STREAM_HEADERS } from "ai";

import { getActiveStreamId } from "@/lib/audric/chat-persistence";
import { getCurrentUser } from "@/lib/audric-auth";
import { getResumableStreamContext } from "@/lib/resumable-stream";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentUser();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const { id: chatId } = await params;
  if (!chatId) {
    return new Response(null, { status: 204 });
  }

  const streamContext = getResumableStreamContext();
  if (!streamContext) {
    // Feature disabled OR Redis unavailable — degrade to "no active
    // stream" so the client mount path works identically to pre-feature.
    return new Response(null, { status: 204 });
  }

  // [SPEC_AUDRIC_STREAM_RESUME Phase 3 telemetry — 2026-05-24] Every
  // call to this route is a `resume_attempt`. We log it before the
  // DB read so the count includes lookups that fall through to 204
  // (the bulk of traffic — mount on a chat with no active stream).
  // Production log aggregation can count these to derive
  // `resume_attempt_count` without per-line parsing of the success log
  // (which has more context but is rarer).
  console.info(
    `[stream-resume] resume_attempt chatId=${chatId} userSuiAddress=${session.user.id}`
  );

  const activeStreamId = await getActiveStreamId({
    chatId,
    userSuiAddress: session.user.id,
  });
  if (!activeStreamId) {
    return new Response(null, { status: 204 });
  }

  try {
    const stream = await streamContext.resumeExistingStream(activeStreamId);
    if (!stream) {
      // Library returns null when the producer has finished AND TTL'd
      // OR undefined when no such streamId exists in Redis. Either way,
      // there's nothing to resume — fall back to 204 so the client
      // renders the persisted messages.
      return new Response(null, { status: 204 });
    }
    // [SPEC_AUDRIC_STREAM_RESUME Phase 3 telemetry] Successful resume
    // — producer was alive AND the stream is reconnected. This is the
    // load-bearing metric for the SPEC: every emission of this log
    // proves the feature did its job for that user (page reload
    // mid-stream → live continuation).
    console.info(
      `[stream-resume] resume_success chatId=${chatId} streamId=${activeStreamId}`
    );
    return new Response(stream, { headers: UI_MESSAGE_STREAM_HEADERS });
  } catch (err) {
    console.error(
      `[web-v2 audric-chat-stream] resumeExistingStream failed for chatId=${chatId} streamId=${activeStreamId}:`,
      err
    );
    // Same fallback as null — don't surface internal Redis errors to
    // the user; the chat history is still readable via the page render.
    return new Response(null, { status: 204 });
  }
}
