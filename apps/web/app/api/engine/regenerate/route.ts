import { NextRequest } from 'next/server';
import {
  regenerateBundle,
  getTelemetrySink,
  type RegenerateResult,
  type RegenerateTimelineEvent,
  type PendingAction,
} from '@t2000/engine';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import { createEngine, getSessionStore } from '@/lib/engine/engine-factory';
import { prisma } from '@/lib/prisma';
import { emitQuoteRefreshFired } from '@/lib/engine/quote-refresh-metrics';

/**
 * SPEC 7 P2.4b — POST /api/engine/regenerate
 *
 * Synchronous JSON endpoint (NOT SSE). The chat stream that yielded
 * the bundled `pending_action` has already closed (`useEngine.ts`
 * flips `isStreaming: false` on `pending_action`); SSE re-open isn't
 * worth the overhead for a sub-second round-trip. Host calls this
 * endpoint, gets `{ success, newPendingAction, timelineEvents[] }`
 * back, pushes a "↻ Regenerated · Ns" group onto the timeline, and
 * swaps the PermissionCard payload to the fresh action.
 *
 * Request body — `address` extends the spec's `{ sessionId, attemptId }`
 * because the host's JWT validation flow keys on the wallet address
 * (matches `/api/engine/resume`). The engine factory needs it to
 * rebuild the same `ToolContext` (priceCache, portfolioCache,
 * permissionConfig) the original chat turn used.
 *
 * Failure modes (per spec line 707-711):
 *  - `pending_action_not_found` — session expired, attemptId
 *    mismatch, or action isn't a multi-step bundle.
 *  - `cannot_regenerate` — `canRegenerate` is false or
 *    `regenerateInput.toolUseIds` is empty.
 *  - `engine_error` — tool re-execution failed (BlockVision down,
 *    Cetus 5xx, etc.) or bundle composition rejected.
 */

export const runtime = 'nodejs';
export const maxDuration = 30;

interface RegenerateRequestBody {
  address: string;
  sessionId: string;
  attemptId: string;
}

interface RegenerateRouteResponse {
  success: true;
  newPendingAction: PendingAction;
  timelineEvents: RegenerateTimelineEvent[];
}

interface RegenerateRouteError {
  success: false;
  reason: 'pending_action_not_found' | 'cannot_regenerate' | 'engine_error';
  message: string;
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonResponse(
  body: RegenerateRouteResponse | RegenerateRouteError,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: NextRequest) {
  let body: RegenerateRequestBody;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }
  const { address, sessionId, attemptId } = body;
  if (!address || !sessionId || !attemptId) {
    return jsonError('address, sessionId, attemptId are required', 400);
  }
  if (!isValidSuiAddress(address)) {
    return jsonError('Invalid Sui address', 400);
  }

  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  // 30/min — regenerate is cheap (no LLM, no on-chain) so we allow more
  // headroom than `/api/engine/resume`'s 20/min cap. Spec line 804: "User
  // regenerates 5+ times in 30s — Allow it."
  const rl = rateLimit(`engine-regenerate:${ip}`, 30, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  // [SPEC 15 v0.6] Emit unified quote-refresh counter at click intent
  // (after auth + rate-limit, before doing work). This is the
  // top-of-funnel "user wanted a fresh quote" signal — separate from
  // the existing `audric.harness.regenerate_count{outcome}` which
  // counts round-trip outcomes. See `quote-refresh-metrics.ts` for
  // the cross-surface rationale.
  emitQuoteRefreshFired({ surface: 'permission_card' });

  const store = getSessionStore();
  const session = await store.get(sessionId);
  if (!session) {
    return jsonResponse(
      {
        success: false,
        reason: 'pending_action_not_found',
        message: 'Session not found or expired',
      },
      404,
    );
  }

  const persistedAction = session.pendingAction;
  if (!persistedAction) {
    return jsonResponse(
      {
        success: false,
        reason: 'pending_action_not_found',
        message: 'Session has no pending action',
      },
      404,
    );
  }
  if (persistedAction.attemptId !== attemptId) {
    return jsonResponse(
      {
        success: false,
        reason: 'pending_action_not_found',
        message: 'attemptId does not match the active pending action',
      },
      404,
    );
  }
  if (persistedAction.canRegenerate !== true) {
    return jsonResponse(
      {
        success: false,
        reason: 'cannot_regenerate',
        message: 'Action does not support regeneration',
      },
      400,
    );
  }

  // Pull contacts the same way the resume route does — needed so
  // `createEngine` rebuilds the same ToolContext (engine guards run
  // against contact list).
  const contacts = await prisma.userPreferences
    .findUnique({ where: { address }, select: { contacts: true } })
    .then((p) =>
      Array.isArray(p?.contacts)
        ? (p.contacts as Array<{ name: string; address: string }>)
        : [],
    )
    .catch(() => []);

  let engine;
  try {
    engine = await createEngine({ address, session, contacts, sessionId });
  } catch (err) {
    console.error('[engine/regenerate] engine init failed:', err);
    return jsonResponse(
      {
        success: false,
        reason: 'engine_error',
        message: 'Engine initialization failed',
      },
      500,
    );
  }

  const startedAt = Date.now();
  let result: RegenerateResult;
  try {
    result = await regenerateBundle(engine, persistedAction);
  } catch (err) {
    console.error('[engine/regenerate] regenerateBundle threw:', err);
    return jsonResponse(
      {
        success: false,
        reason: 'engine_error',
        message: err instanceof Error ? err.message : 'Regenerate failed',
      },
      500,
    );
  }
  const totalMs = Date.now() - startedAt;

  if (!result.success) {
    // Telemetry — even failed attempts are useful for spotting BlockVision /
    // Cetus outages. Outcome label distinguishes from happy-path counts.
    try {
      getTelemetrySink().counter('audric.harness.regenerate_count', {
        outcome: 'failed',
        reason: result.reason,
      });
    } catch {
      // Telemetry failures must never block the response.
    }
    return jsonResponse(result, result.reason === 'pending_action_not_found' ? 404 : 400);
  }

  // Persist updated session — engine.regenerateBundle appended synthetic
  // assistant + user blocks for the re-fired reads, so the LLM sees the
  // fresh data on resume. The new pending_action replaces the old one
  // verbatim.
  try {
    const messages = [...engine.getMessages()];
    await store.set({
      ...session,
      messages,
      pendingAction: result.newPendingAction,
      updatedAt: Date.now(),
    });
  } catch (saveErr) {
    console.error('[engine/regenerate] session save failed:', saveErr);
    // Non-fatal: client still gets the new action, but the next page
    // reload may show stale state. We surface as engine_error so the
    // client clears the regenerate spinner and the user can re-trigger.
    return jsonResponse(
      {
        success: false,
        reason: 'engine_error',
        message: 'Could not persist regenerated bundle',
      },
      500,
    );
  }

  // Mark the original `attemptId`'s TurnMetrics row as `'regenerated'`.
  // The eventual resume of the new pending_action will write its own
  // resume-phase row keyed on the new attemptId. Fire-and-forget — the
  // user's regenerated card is the load-bearing payload.
  prisma.turnMetrics
    .updateMany({
      where: { attemptId },
      data: { pendingActionOutcome: 'regenerated' },
    })
    .catch((err) =>
      console.warn(
        '[TurnMetrics] regenerate outcome update failed (non-fatal):',
        err,
      ),
    );

  // Telemetry — happy-path counter. Outcome `'success'` rolls up to the
  // dashboard segment that shows what fraction of attempts produced a
  // fresh card; downstream segments (`approved_after_regen`,
  // `denied_after_regen`, `regen_then_expired`) are stamped at resume
  // time when the user actually decides.
  try {
    const sink = getTelemetrySink();
    sink.counter('audric.harness.regenerate_count', { outcome: 'success' });
    sink.gauge('audric.harness.regenerate_duration_ms', totalMs);
  } catch {
    // Swallow.
  }

  const responseBody: RegenerateRouteResponse = {
    success: true,
    newPendingAction: result.newPendingAction,
    timelineEvents: result.timelineEvents,
  };
  return jsonResponse(responseBody);
}
