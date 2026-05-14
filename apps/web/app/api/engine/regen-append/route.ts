/**
 * SPEC 23B-MPP6-fastpath / 2026-05-12 — Regen append endpoint.
 *
 * Persists a client-driven `pay_api` regeneration into the session
 * message ledger so:
 *   1. The new tool block survives a page refresh (rehydration finds
 *      it in `session.messages` and re-renders the rich card).
 *   2. The next LLM turn sees the regenerated content in context (the
 *      LLM is told "you're seeing two image previews — the user
 *      regenerated; pick the latest if asked which one to use").
 *   3. Cumulative spend tracking remains accurate (the regen cost
 *      counts against `sessionSpend`, same as the original call).
 *
 * Flow (the client-driven half lives in `dashboard-content.tsx`
 * `handleRegenerateToolCall`):
 *   1. User clicks <ReviewCard>'s Regenerate button.
 *   2. Hook re-resolves permission tier client-side.
 *   3. Hook calls `executeToolAction(sdk, 'pay_api', { url, body })`
 *      directly — bypassing the engine LLM round-trip.
 *   4. Hook POSTs the result to THIS endpoint to persist.
 *
 * Append strategy — preserves Claude's strict user/assistant alternation:
 *   Find the assistant message containing `tool_use:originalToolUseId`.
 *   Append `tool_use:newRegen` to the SAME assistant message's content.
 *   Find the immediately-following user message (which contains the
 *   matching `tool_result:original`). Append `tool_result:newRegen` to
 *   the SAME user message's content. This mirrors Claude's native
 *   parallel-tool-call shape and avoids inserting new messages that
 *   would break alternation when the user types their next chat turn.
 *
 * Why no streaming: regen-append doesn't call the LLM and doesn't emit
 * narration. The client already has the result (from the local
 * `executeToolAction.pay_api` call) and applied it optimistically to
 * the timeline via `engine.upsertToolBlock`. This endpoint is a thin
 * REST CRUD operation — load → mutate → save → 200.
 *
 * Why no engine instance: same reason. We never touch the LLM, never
 * resolve tools server-side, never run guards. The guards already ran
 * on the original `pay_api` dispatch (server-side via the engine in
 * `/api/engine/chat`); regen re-uses the same input that already passed.
 *
 * Auth: x-zklogin-jwt header (mirrors /api/engine/resume).
 * Rate limit: 30 req/min/IP (regen is rare per session; cap = abuse).
 * Telemetry: structured log on success + failure for ops dashboards.
 */

import { NextRequest } from 'next/server';
import type { SessionData } from '@t2000/engine';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { authenticateRequest, assertOwns, isValidSuiAddress } from '@/lib/auth';
import { getSessionStore } from '@/lib/engine/engine-factory';
import { incrementSessionSpend } from '@/lib/engine/session-spend';
import { appendRegenToMessages } from './helper';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface RegenAppendBody {
  address: string;
  sessionId: string;
  /**
   * The tool_use_id of the ORIGINAL pay_api call that the user is
   * regenerating. Used to locate the correct assistant + user message
   * pair in `session.messages`.
   */
  originalToolUseId: string;
  /**
   * Fresh UUID v4 generated client-side for the regenerated tool block.
   * Must NOT collide with any existing tool_use_id in the session
   * (collision check enforced server-side; collision = 409).
   */
  newToolUseId: string;
  /**
   * Fresh UUID v4 generated client-side for telemetry / audit. Optional
   * — when omitted, regen is logged without an attemptId (analytics
   * dashboards bucket as 'no-attempt-id'). Mirrors the v1.4.2 spec for
   * the original pay_api dispatch.
   */
  newAttemptId?: string;
  /**
   * The pay_api input that was re-dispatched. Same shape as the
   * engine's `pay_api` tool: `{ url, body? }`. Persisted verbatim into
   * the new `tool_use` block so future rehydration recovers it.
   */
  input: { url: string; body?: string };
  /**
   * The full result object from `executeToolAction.pay_api`. This is
   * the wrapped envelope `{ success, data: { ... } }` that pay_api
   * returns; persisted as the `tool_result.content` (JSON-stringified)
   * so rehydration's `synthesizeTimelineFromMessage` reconstructs the
   * MppServiceRenderer card correctly.
   */
  result: unknown;
  /**
   * True when the regen dispatch errored (gateway 4xx/5xx, sdk crash,
   * etc.). Mirrors the `tool_result.isError` field. Failed regens are
   * STILL persisted so the user's history accurately reflects what
   * happened — and so the next LLM turn knows the regen failed if the
   * user asks about it.
   */
  isError: boolean;
  /**
   * USD value of the regen call (e.g. 0.05 for DALL-E). Used to
   * increment session spend. Optional — when omitted, defaults to the
   * estimated cost from `lib/engine/pay-api-pricing.ts`. v1 doesn't
   * implement the lookup helper; client always sends.
   */
  costUsd?: number;
}

function jsonError(message: string, status: number, extra?: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonOk(payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: NextRequest) {
  let body: RegenAppendBody;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const {
    address,
    sessionId,
    originalToolUseId,
    newToolUseId,
    newAttemptId,
    input,
    result,
    isError,
    costUsd,
  } = body;

  if (!address || !sessionId || !originalToolUseId || !newToolUseId || !input?.url) {
    return jsonError('address, sessionId, originalToolUseId, newToolUseId, and input.url are required', 400);
  }

  if (!isValidSuiAddress(address)) {
    return jsonError('Invalid Sui address', 400);
  }

  // [SPEC 30 Phase 1A.3] Verify JWT signature AND bind to body.address.
  // Same IDOR class as engine/chat — append-after-regenerate writes to
  // the victim's session if address is spoofed.
  const auth = await authenticateRequest(request);
  if ('error' in auth) return auth.error;
  const ownership = assertOwns(auth.verified, address);
  if (ownership) return ownership;

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = rateLimit(`engine-regen-append:${ip}`, 30, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  const store = getSessionStore();
  const session = await store.get(sessionId);
  if (!session) {
    return jsonError('Session not found', 404);
  }

  const result_or_error = appendRegenToMessages(session.messages, {
    originalToolUseId,
    newToolUseId,
    input,
    payApiResult: result,
    isError,
  });

  if ('error' in result_or_error) {
    return jsonError(result_or_error.error, result_or_error.status, {
      originalToolUseId,
      newToolUseId,
    });
  }

  const updatedSession: SessionData = {
    ...session,
    messages: result_or_error.messages,
    updatedAt: Date.now(),
  };

  try {
    await store.set(updatedSession);
  } catch (err) {
    console.error('[engine/regen-append] session save failed:', err);
    return jsonError('Failed to persist regen to session', 500);
  }

  // Increment cumulative session spend. Fail-open if the upstash call
  // errors — the regen already happened on-chain and the user got their
  // result; spend tracking lag for one regen is recoverable on the next
  // /api/engine/chat call which re-reads the spend from upstash.
  if (typeof costUsd === 'number' && costUsd > 0 && !isError) {
    incrementSessionSpend(sessionId, costUsd).catch((err) =>
      console.error('[engine/regen-append] incrementSessionSpend failed:', err),
    );
  }

  console.log(
    JSON.stringify({
      kind: 'regen_append',
      sessionId,
      originalToolUseId,
      newToolUseId,
      newAttemptId,
      isError,
      costUsd,
      messageCount: updatedSession.messages.length,
    }),
  );

  return jsonOk({
    success: true,
    newToolUseId,
    newAttemptId,
    messageCount: updatedSession.messages.length,
  });
}

// Pure helper — see ./helper.ts (extracted because Next.js 15 App
// Router forbids any non-HTTP-method export from a route file).
