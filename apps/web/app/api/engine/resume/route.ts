import { NextRequest } from 'next/server';
import { serializeSSE } from '@t2000/engine';
import type { PendingAction } from '@t2000/engine';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import { createEngine, getSessionStore, setConversationState } from '@/lib/engine/engine-factory';
import { logSessionUsage } from '@/lib/engine/log-session-usage';
import { getSessionSpend, incrementSessionSpend } from '@/lib/engine/session-spend';
import { applyModificationsToAction, resolveOutcome } from '@/lib/engine/apply-modifications';
import { sanitizeStreamErrorMessage } from '@/lib/engine/stream-errors';
import {
  resolveUsdValue,
  toolNameToOperation,
} from '@/lib/engine/permission-tiers-client';
import {
  TurnMetricsCollector,
  detectRefinement,
  detectTruncation,
} from '@/lib/engine/harness-metrics';
import { costRatesForModel } from '@/lib/engine/cost-rates';
import { isSyntheticSessionId } from '@/lib/engine/synthetic-sessions';
import { invalidateUserFinancialContext } from '@/lib/redis/user-financial-context';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';

const AGENT_MODEL = env.AGENT_MODEL ?? 'claude-sonnet-4-20250514';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface ResumeRequestBody {
  address: string;
  sessionId: string;
  action: PendingAction;
  approved: boolean;
  executionResult?: unknown;
  /**
   * [v1.4 Item 4] Coarse outcome stored on the originating
   * `TurnMetrics.pendingActionOutcome` row so analytics can compute
   * approve / decline / modify ratios per tool. Optional: defaults to
   * `approved` / `declined` from the boolean if omitted.
   */
  outcome?: 'approved' | 'declined' | 'modified';
  /**
   * [v1.4 Item 6] Subset of `action.input` keys the user edited via the
   * permission card's modifiable-field controls. Overlaid onto
   * `action.input` before reconstructing the turn so the recorded history
   * matches what was actually approved.
   */
  modifications?: Record<string, unknown>;
  /**
   * [v1.4.2 — Day 3 / Day 4 / Spec Item 3] Wall-clock ms the client
   * spent executing the approved write tool — i.e. the round-trip from
   * approval click through signing, broadcast, and indexer-lag
   * absorption. Day-3 added the column on `TurnMetrics`; Day-4 wires
   * the UI to actually populate this field via
   * `useEngine.ts:resolveAction`. When omitted (legacy clients in the
   * deploy window) the field updates to `null`, which is the same as
   * untouched for the resume row's purposes.
   */
  executionDurationMs?: number;
  /**
   * [SPEC 7 P2.4 Layer 3] Per-step results for a multi-write Payment
   * Stream resume. When set, the engine emits N `tool_result` blocks
   * (one per step's `toolUseId`) back to the LLM with each step's
   * `result` / `isError`. Mutually exclusive with `executionResult` —
   * the host populates one or the other based on `action.steps`.
   *
   * Atomic semantics: on bundle revert, every step carries the same
   * `_bundleReverted: true` flag with `isError: true` so the LLM
   * narrates "the stream reverted; nothing executed" coherently.
   */
  stepResults?: Array<{
    toolUseId: string;
    attemptId: string;
    result: unknown;
    isError: boolean;
  }>;
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: NextRequest) {
  let body: ResumeRequestBody;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const { address, sessionId, action: rawAction, approved, executionResult, outcome, modifications, executionDurationMs, stepResults } = body;

  // [v1.4 Item 6] Overlay user modifications on top of action.input so the
  // engine reconstructs the turn with the approved values. The shared helper
  // also handles the no-modifications case as identity for ref-equality.
  const action: PendingAction = applyModificationsToAction(rawAction, modifications);
  const resolvedOutcome = resolveOutcome(approved, modifications, outcome);

  if (!address || !sessionId || !action?.toolUseId) {
    return jsonError('address, sessionId, and action are required', 400);
  }

  if (!isValidSuiAddress(address)) {
    return jsonError('Invalid Sui address', 400);
  }

  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = rateLimit(`engine-resume:${ip}`, 20, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  const store = getSessionStore();
  const session = await store.get(sessionId);

  if (!session) {
    return jsonError('Session not found', 404);
  }

  const contacts = await prisma.userPreferences.findUnique({ where: { address }, select: { contacts: true } })
    .then((p) => (Array.isArray(p?.contacts) ? p.contacts as Array<{ name: string; address: string }> : []))
    .catch(() => []);

  try {
    // [v1.4] Forward cumulative session spend so the resumed turn enforces
    // the daily autonomous cap on any subsequent auto-tier write tools.
    const sessionSpendUsd = await getSessionSpend(sessionId);

    // [v1.4.2 — Day 4 / Spec Edit 4] `TurnMetricsCollector` is constructed
    // BEFORE `createEngine` so the engine factory's `onGuardFired`
    // callback can write into it directly (mirrors chat/route.ts:212).
    const collector = new TurnMetricsCollector();
    let engineMeta: { effortLevel: string; modelUsed: string } | undefined;

    const engine = await createEngine({
      address,
      session,
      contacts,
      sessionSpendUsd,
      sessionId,
      // [v1.4.2 — Day 4 / Spec M3] Capture routing decisions for the
      // resume-row's effortLevel/modelUsed columns. Fired exactly once
      // after engine construction.
      onMeta: (meta) => { engineMeta = meta; },
      // [v1.4.2 — Day 4 / Spec Item 4] Forward guard verdicts to the
      // resume row so dashboards see post-confirmation guard activity
      // (rare but real — chained writes in a resume turn re-trigger
      // the same guard chain as the initial turn).
      onGuardFired: (guard) => collector.onGuardFired(guard),
    });
    const priorMsgCount = engine.getMessages().length;

    // [SPEC 8 v0.5.1 audit polish] Mirror chat/route.ts:303 server-side
    // cleanliness flag. Resume streams that close without `turn_complete`
    // (server crash / serverless timeout / unhandled exception during
    // narration) are interruptions — persist a `lastInterruption` marker
    // so the next page load surfaces `<RetryInterruptedTurn>` on the
    // resume turn's assistant message, same UX as an interrupted chat
    // turn. A resume that yielded another `pending_action` (chained
    // write) is intentionally paused, NOT interrupted.
    let turnCompleteSeen = false;

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let pendingAction: PendingAction | null = null;

        try {
          // [v1.4.2 — Day 4 / Spec G3] Switch from `engineToSSE` (which
          // returns serialized strings, hiding raw event shape) to raw
          // event iteration so `TurnMetricsCollector` can tap each event
          // and `serializeSSE` is called per-event. Mirrors chat/route.ts.
          // [SPEC 7 P2.4] Bundle vs single-write resume. The engine's
          // `PermissionResponse` accepts either `executionResult` (single)
          // or `stepResults` (bundle). Host populates one based on
          // whether the approved pending_action carried `steps`.
          const permissionResponse = stepResults && stepResults.length > 0
            ? { approved, stepResults }
            : { approved, executionResult };
          for await (const event of engine.resumeWithToolResult(action, permissionResponse)) {
            switch (event.type) {
              case 'compaction':
                collector.onCompaction();
                continue;
              case 'text_delta':
                collector.onFirstTextDelta();
                break;
              case 'tool_start':
                collector.onToolStart(event.toolUseId);
                break;
              case 'turn_complete':
                turnCompleteSeen = true;
                break;
              case 'tool_result':
                if (event.toolName === '__deduped__') {
                  // Engine-internal microcompact dedup marker — flip the
                  // flag on the prior tool row instead of recording a new
                  // one (same behaviour as chat/route.ts:447-460).
                  collector.markToolResultDeduped(event.toolUseId);
                } else {
                  collector.onToolResult(event.toolUseId, event.toolName, event.result, {
                    wasTruncated: detectTruncation(event.result),
                    wasEarlyDispatched: event.wasEarlyDispatched ?? false,
                    resultDeduped: event.resultDeduped ?? false,
                    returnedRefinement: detectRefinement(event.result),
                  });
                }
                break;
              case 'usage':
                collector.onUsage(event);
                break;
              case 'pending_action':
                // [v1.3.1 — G13] Capture for the existing finally-block
                // setConversationState transition + session store write
                // — replaces the regex-extraction path used pre-Day-4.
                collector.onPendingAction(event.action.attemptId);
                pendingAction = event.action;
                break;
              default:
                break;
            }

            if (event.type === 'error') {
              controller.enqueue(
                encoder.encode(
                  serializeSSE({
                    type: 'error',
                    message: sanitizeStreamErrorMessage(event.error.message),
                  }),
                ),
              );
            } else if (event.type === 'tool_result' && event.toolName === '__deduped__') {
              // Engine-internal marker; never serialize to the client.
            } else {
              controller.enqueue(encoder.encode(serializeSSE(event)));
            }
          }
        } catch (err) {
          const rawMsg = err instanceof Error ? err.message : 'Engine error';
          const errorMsg = sanitizeStreamErrorMessage(rawMsg);
          console.error('[engine/resume] stream error:', rawMsg);
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ type: 'error', message: errorMsg })}\n\n`,
            ),
          );
        } finally {
          const messages = [...engine.getMessages()];
          const usage = engine.getUsage();

          try {
            // [SPEC 8 v0.5.1 audit polish] Compute interruption marker
            // BEFORE building the metadata payload. Mirrors
            // chat/route.ts:674. A resume turn that yielded a fresh
            // pending_action (chained write) is intentionally paused,
            // not interrupted. On a clean resume turn, we explicitly
            // override any prior marker (the spread above carries the
            // chat-turn's `lastInterruption` forward; an explicit
            // `undefined` clears it).
            const wasInterrupted = !turnCompleteSeen && !pendingAction;
            if (wasInterrupted) {
              collector.markInterrupted();
            }
            // Resume-turn assistant message is the next assistant index in
            // the persisted history. Same convention as the session-load
            // route: matches the Nth assistant message on rehydrate.
            const resumeTurnIndex = messages.filter((m) => m.role === 'assistant').length - 1;
            // Walk back through messages for the last user-text block —
            // that's the chat message that originated this resume turn.
            // Engine `Message.content` is always `ContentBlock[]`; user
            // messages carry either `[{type:'text', text}]` (the chat
            // message we want) or `[{type:'tool_result', ...}]` (the
            // synthetic block engine inserts for `resumeWithToolResult`).
            // We pick the most-recent message that has a non-empty text
            // block.
            let replayText: string | undefined;
            for (let i = messages.length - 1; i >= 0; i--) {
              const m = messages[i];
              if (m.role !== 'user') continue;
              const textBlock = m.content.find(
                (b): b is { type: 'text'; text: string } => b.type === 'text',
              );
              if (textBlock && textBlock.text.trim().length > 0) {
                replayText = textBlock.text.trim();
                break;
              }
            }
            const lastInterruption = wasInterrupted && replayText
              ? {
                  turnIndex: Math.max(0, resumeTurnIndex),
                  replayText,
                  interruptedAt: Date.now(),
                }
              : undefined;
            const updatedSession = {
              ...session,
              messages,
              usage,
              updatedAt: Date.now(),
              pendingAction,
              metadata: {
                ...(session.metadata ?? {}),
                // Explicit `undefined` overrides the spread when this
                // resume turn was clean — clears any chat-turn marker.
                lastInterruption,
              },
            };
            await store.set(updatedSession);
          } catch (saveErr) {
            console.error('[engine/resume] session save failed:', saveErr);
          }

          // F4: Update conversation state — if resume produced a new
          // pending action (chained write), transition to awaiting_confirmation;
          // otherwise reset to idle.
          if (pendingAction) {
            setConversationState(sessionId, {
              type: 'awaiting_confirmation',
              action: pendingAction.toolName,
              amount: typeof (pendingAction.input as Record<string, unknown>)?.amount === 'number'
                ? (pendingAction.input as Record<string, unknown>).amount as number
                : undefined,
              proposedAt: Date.now(),
              expiresAt: Date.now() + 5 * 60_000,
            }).catch((err) =>
              console.error('[engine/resume] state transition failed:', err),
            );
          } else {
            setConversationState(sessionId, { type: 'idle' }).catch((err) =>
              console.error('[engine/resume] state transition failed:', err),
            );
          }

          logSessionUsage(address, sessionId, usage, messages, AGENT_MODEL, priorMsgCount).catch((err) =>
            console.error('[engine/resume] session usage log failed:', err),
          );

          // [v1.4.2 — Day 3 / Spec Item 3] Update the originating
          // `TurnMetrics` row with the resolved outcome (approved /
          // declined / modified). Switched from `(sessionId, turnIndex)`
          // keying to `attemptId` keying — the pair-based update could
          // collide on resumed sessions where the same turn yielded a
          // second pending action (modifiable-field re-yield), causing
          // the *wrong* row's outcome to be overwritten. attemptId is
          // unique per yield by construction.
          //
          // Defensive fallback: pre-v1.4.2 sessions (or pre-Day-5
          // pre-engine-republish sessions where audric/apps/web is
          // still consuming engine 0.46.16) rehydrate `PendingAction`
          // without an `attemptId`. In that case we keep the legacy
          // pair-keyed update so existing in-flight pending actions
          // don't lose their outcome telemetry. Branch becomes dead
          // code after Day 5 republish + 24h session TTL rotation.
          if (action.attemptId) {
            prisma.turnMetrics
              .updateMany({
                where: { attemptId: action.attemptId },
                data: {
                  pendingActionOutcome: resolvedOutcome,
                  writeToolDurationMs: executionDurationMs ?? null,
                },
              })
              .catch((err) =>
                console.warn('[TurnMetrics] attemptId update failed (non-fatal):', err),
              );
          } else {
            prisma.turnMetrics
              .updateMany({
                where: { sessionId, turnIndex: action.turnIndex },
                data: { pendingActionOutcome: resolvedOutcome },
              })
              .catch((err) =>
                console.warn('[TurnMetrics] pendingActionOutcome update failed (non-fatal, legacy keying):', err),
              );
          }

          // [v1.4.2 — Day 4 / Spec Edit 4] Write a NEW TurnMetrics row
          // for the resume turn itself. The `updateMany` above patches
          // the *initial* row's outcome; this row captures the
          // post-confirmation portion of the turn (narration latency,
          // tokens, any chained tool calls). Q5 / Q6 dashboards filter
          // `WHERE turnPhase = 'initial'` for cold-start metrics and
          // `WHERE turnPhase = 'resume'` for confirm-tier tail latency.
          // Failure is fire-and-forget; instrumentation must never
          // block the chat response.
          try {
            const modelUsed = engineMeta?.modelUsed ?? AGENT_MODEL;
            const effortLevel = engineMeta?.effortLevel ?? 'medium';
            const rates = costRatesForModel(modelUsed);
            const estimatedCostUsd =
              (usage.inputTokens ?? 0) * rates.input +
              (usage.outputTokens ?? 0) * rates.output +
              (usage.cacheReadTokens ?? 0) * rates.cacheRead +
              (usage.cacheWriteTokens ?? 0) * rates.cacheWrite;

            const built = collector.build({
              sessionId,
              userId: address,
              // [v1.4.2 — Day 4 / Spec Edit 4 line 1066] Resume row
              // shares `turnIndex` with the originating chat row so
              // `(sessionId, turnIndex)` joins return both phases of
              // the same turn. `action.turnIndex` was stamped by the
              // engine at the *original* `pending_action` yield (see
              // engine.ts:1158: `messages.filter(m =>
              // m.role === 'assistant').length`) which is the same
              // assistant-message-count convention chat/route.ts:225
              // uses for its own row. Distinguished from the chat row
              // by `turnPhase`. Crucially, `action.turnIndex` is NOT
              // the same as `priorMsgCount`: the latter is total
              // message count (incl. user messages and persisted
              // tool_use blocks); only one of these two values is the
              // correct turn id for joining rows.
              turnIndex: action.turnIndex,
              effortLevel,
              modelUsed,
              // [v1.4.1 — C1] Aligns with chat/route.ts:607 — total
              // `engine.getMessages().length` immediately after
              // `createEngine`, before this turn's stream begins.
              // Naming is "messages-prior-to-this-turn" not "tokens";
              // see the v1.4.1 — C1 naming note in the spec body.
              contextTokensStart: priorMsgCount,
              estimatedCostUsd,
              sessionSpendUsd,
              // [v1.4.2 — Day 3] Same derivation as chat route via the
              // shared `synthetic-sessions` module — both phases of a
              // turn must agree on the bit so dashboards `WHERE
              // synthetic = false` don't mis-pair them.
              synthetic: isSyntheticSessionId(sessionId),
              turnPhase: 'resume',
            });
            const payload = {
              ...built,
              toolsCalled: JSON.parse(JSON.stringify(built.toolsCalled)),
              guardsFired: JSON.parse(JSON.stringify(built.guardsFired)),
            };
            prisma.turnMetrics
              .create({ data: payload })
              .catch((err) =>
                console.error('[TurnMetrics] resume row write failed (non-fatal):', err),
              );
          } catch (buildErr) {
            console.error('[TurnMetrics] resume row build failed (non-fatal):', buildErr);
          }

          // [v1.4 hotfix] Audric signs writes client-side, so the
          // engine's `onAutoExecuted → incrementSessionSpend` callback
          // never fires (the engine yields a pending_action and the
          // client executes). To make the v1.4 daily autonomous cap
          // real we increment the Redis counter here, on every approved
          // client-executed write that didn't error. USDC/USDT writes
          // are valued at amount; non-stable writes need a price cache
          // — that's only available inside the engine, so we pass an
          // empty cache and let `resolveUsdValue` fall through to
          // Infinity, which the next-turn permission resolver treats
          // as "definitely confirm" (failing safe).
          //
          // [SPEC 7 P2.4 Layer 3] Bundle accounting — when the host
          // forwards `stepResults`, derive success from atomic
          // semantics (every step succeeded ⇔ bundle succeeded) and
          // sum USD across every step (not just steps[0], which is
          // what action.toolName/input mirror for backward-compat).
          if (
            resolvedOutcome === 'approved' || resolvedOutcome === 'modified'
          ) {
            const isBundle = stepResults && stepResults.length > 0 && Array.isArray(action.steps) && action.steps.length > 0;

            const looksSuccessful = isBundle
              ? stepResults!.every((s) => !s.isError)
              : (executionResult == null ||
                !(
                  typeof executionResult === 'object' &&
                  executionResult !== null &&
                  ('success' in executionResult
                    ? (executionResult as { success?: unknown }).success === false
                    : false)
                ));

            if (looksSuccessful) {
              const stableCache = new Map<string, number>([['USDC', 1], ['USDT', 1]]);
              let totalUsd = 0;

              if (isBundle && action.steps) {
                for (const step of action.steps) {
                  const op = toolNameToOperation(step.toolName);
                  if (!op) continue;
                  const usd = resolveUsdValue(
                    step.toolName,
                    (step.input as Record<string, unknown>) ?? {},
                    stableCache,
                  );
                  if (Number.isFinite(usd) && usd > 0) totalUsd += usd;
                }
              } else {
                const op = toolNameToOperation(action.toolName);
                if (op) {
                  const usd = resolveUsdValue(
                    action.toolName,
                    (action.input as Record<string, unknown>) ?? {},
                    stableCache,
                  );
                  if (Number.isFinite(usd) && usd > 0) totalUsd = usd;
                }
              }

              if (totalUsd > 0) {
                incrementSessionSpend(sessionId, totalUsd).catch((err) =>
                  console.warn('[session-spend] increment failed (non-fatal):', err),
                );

                // [v1.4 — B1] Drop the cached `UserFinancialContext`
                // snapshot for this address. Confirm-tier writes never
                // fire engine.onAutoExecuted, so the daily-cron snapshot
                // would otherwise stay stale until 02:00 UTC the next
                // day. The very next chat then re-hydrates the cache
                // from fresh on-chain state instead of inferring from a
                // 24h-old snapshot. Cache key is `address`, not `userId`
                // — universally available without a DB lookup.
                invalidateUserFinancialContext(address).catch((err) =>
                  console.warn('[fin_ctx] resume invalidation failed (non-fatal):', err),
                );
              }
            }
          }

          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Engine resume failed';
    console.error('[engine/resume] init error:', errorMsg);
    return jsonError(errorMsg, 500);
  }
}
