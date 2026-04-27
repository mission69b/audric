import { NextRequest } from 'next/server';
import { serializeSSE } from '@t2000/engine';
import type { PendingAction, ContentBlock, EngineEvent } from '@t2000/engine';
import {
  classifyReadIntents,
  makeAutoDispatchId,
  intentDiscriminator,
  type ReadIntent,
} from '@/lib/engine/intent-dispatcher';
import { buildDispatchIntents } from '@/lib/engine/dispatch-intents';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import {
  createEngine,
  createUnauthEngine,
  getSessionStore,
  generateSessionId,
  getConversationState,
  setConversationState,
  type HistoryMessage,
} from '@/lib/engine/engine-factory';
import { UpstashSessionStore } from '@/lib/engine/upstash-session-store';
import { logSessionUsage } from '@/lib/engine/log-session-usage';
import { getSessionSpend } from '@/lib/engine/session-spend';
import {
  TurnMetricsCollector,
  detectRefinement,
  detectTruncation,
  detectNarrationTableDump,
} from '@/lib/engine/harness-metrics';
import { costRatesForModel } from '@/lib/engine/cost-rates';
import { isSyntheticSessionId } from '@/lib/engine/synthetic-sessions';
import { prisma, withPrismaRetry } from '@/lib/prisma';
import {
  SESSION_LIMIT_VERIFIED,
  SESSION_WINDOW_MS,
  sessionLimitFor,
} from '@/lib/billing';

import { sanitizeStreamErrorMessage } from '@/lib/engine/stream-errors';

const AGENT_MODEL = process.env.AGENT_MODEL ?? 'claude-sonnet-4-6';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_HISTORY = 12;
const MAX_MSG_LEN = 500;

/**
 * [v1.4 — Item 2] Synthetic read intents pre-fetched on the first user
 * turn of a *resumed* auth session. New sessions are already covered by
 * `engine-factory.ts:buildSyntheticPrefetch`, which preloads
 * `balance_check` + `savings_info` `tool_use`/`tool_result` blocks into
 * the engine's message ledger before the agent loop runs.
 *
 * The baseline metric this targets is "Returning user 2 → 0 tool calls":
 * when a user resumes an existing session with a free-form message ("hey",
 * "what should I do"), the LLM's freshness heuristic skipped tool calls
 * because nothing in the prompt explicitly asked for new data — leaving
 * the user without any rich balance/savings card.
 *
 * The two intents below collide with `READ_INTENT_RULES` in
 * `intent-dispatcher.ts` (specifically the no-arg `balance_check` rules);
 * the dedup loop below uses `argsFingerprint` so a single classified
 * `balance_check` doesn't fire twice. Both tools are excluded from
 * `createUnauthEngine`'s tool set (engine-factory.ts:616–623) — the
 * `isReturningSession` gate blocks pre-fetch on cold landing-page hits.
 */
const RESUMED_SESSION_INTENTS: readonly ReadIntent[] = [
  { toolName: 'balance_check', args: {}, label: 'resumed-session pre-fetch (balance)' },
  { toolName: 'savings_info', args: {}, label: 'resumed-session pre-fetch (savings)' },
];

interface ChatRequestBody {
  message: string;
  address?: string;
  sessionId?: string;
  history?: HistoryMessage[];
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: NextRequest) {
  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const { message, address, sessionId: requestedSessionId, history = [] } = body;

  if (!message?.trim()) {
    return jsonError('message is required', 400);
  }

  const jwt = request.headers.get('x-zklogin-jwt');
  const isAuth = !!jwt && !!address;

  if (isAuth) {
    if (!isValidSuiAddress(address)) {
      return jsonError('Invalid Sui address', 400);
    }
    const jwtResult = validateJwt(jwt);
    if ('error' in jwtResult) return jwtResult.error;
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  if (isAuth) {
    const rl = rateLimit(`engine:${ip}`, 20, 60_000);
    if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);
  } else {
    if (message.length > MAX_MSG_LEN) return jsonError(`Message too long (max ${MAX_MSG_LEN})`, 400);
    if (history.length > MAX_HISTORY) return jsonError(`History too long (max ${MAX_HISTORY})`, 400);
    const rl = rateLimit(`demo:${ip}`, 30, 600_000);
    if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);
  }

  try {
    let engine;
    let sessionId: string | undefined;
    let session = null;
    let saveSession = false;
    let engineMeta: { effortLevel: string; modelUsed: string } | undefined;
    let sessionSpendUsdAtStart = 0;
    // Constructed early so the engine factory can pipe `onGuardFired`
    // directly into the collector before the agent loop starts.
    const collector = new TurnMetricsCollector();

    if (isAuth) {
      const store = getSessionStore();
      sessionId = requestedSessionId || generateSessionId();
      session = requestedSessionId ? await store.get(requestedSessionId) : null;
      saveSession = true;

      // [SIMPLIFICATION DAY 4] Central usage billing.
      // Fetch user (verification tier), prefs (contacts), and the rolling-24h
      // distinct-session list in parallel. SessionUsage logs every TURN, so we
      // groupBy `sessionId` to count distinct sessions, not turns.
      const [userRow, prefs, recentSessions] = await Promise.all([
        prisma.user.findUnique({
          where: { suiAddress: address },
          select: { emailVerified: true },
        }).catch(() => null),
        prisma.userPreferences.findUnique({
          where: { address },
          select: { contacts: true },
        }).catch(() => null),
        prisma.sessionUsage.groupBy({
          by: ['sessionId'],
          where: {
            address,
            createdAt: { gte: new Date(Date.now() - SESSION_WINDOW_MS) },
          },
        }).catch(() => [] as Array<{ sessionId: string }>),
      ]);

      const contacts = Array.isArray(prefs?.contacts) ? prefs.contacts as Array<{ name: string; address: string }> : [];

      // Continuing an existing session (already counted toward the user's
      // window) must never be blocked mid-conversation — only NEW sessions
      // beyond the limit get a 429. Without this guard, a user could be
      // cut off in the middle of a back-and-forth at the exact moment they
      // crossed the threshold.
      const recentSessionIds = new Set(recentSessions.map((r) => r.sessionId));
      const continuingExistingSession = !!requestedSessionId && recentSessionIds.has(requestedSessionId);
      const emailVerified = userRow?.emailVerified ?? false;
      const limit = sessionLimitFor(emailVerified);

      if (recentSessions.length >= limit && !continuingExistingSession) {
        const message = emailVerified
          ? `You've used ${limit} sessions in the last 24 hours. More sessions unlock as the 24h window rolls forward.`
          : `You've used ${limit} of ${limit} sessions today. Verify your email to unlock ${SESSION_LIMIT_VERIFIED} sessions every 24 hours — it's free.`;
        return new Response(
          JSON.stringify({
            error: message,
            code: 'SESSION_LIMIT',
            tier: emailVerified ? 'verified' : 'unverified',
            limit,
            windowHours: 24,
          }),
          {
            status: 429,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      const conversationState = sessionId ? await getConversationState(sessionId).catch(() => undefined) : undefined;

      // [v1.4] Read accumulated session spend so the engine can enforce
      // `autonomousDailyLimit` for the next auto-tier check.
      sessionSpendUsdAtStart = sessionId ? await getSessionSpend(sessionId) : 0;

      engine = await createEngine({
        address,
        session,
        contacts,
        message: message.trim(),
        conversationState,
        sessionSpendUsd: sessionSpendUsdAtStart,
        sessionId,
        onMeta: (meta) => { engineMeta = meta; },
        onGuardFired: (guard) => collector.onGuardFired(guard),
      });
    } else {
      engine = await createUnauthEngine(history);
    }

    const priorMsgCount = engine.getMessages().length;
    /**
     * [v1.4 Item 4] turnIndex = number of assistant messages BEFORE this
     * turn's response is added. Stable across resume because each
     * tool_result + assistant continuation lives in the same session
     * message ledger.
     */
    const turnIndex = engine.getMessages().filter((m) => m.role === 'assistant').length;

    /**
     * [v1.4 — Item 2] Trigger resumed-session pre-fetch ONLY when an
     * authenticated user is reopening a session that already has prior
     * messages. New auth sessions are covered upstream by
     * `engine-factory.ts:buildSyntheticPrefetch`; unauth sessions don't
     * have access to `balance_check` / `savings_info` and would just log
     * "tool not found" warnings on every cold landing-page hit.
     */
    const isReturningSession = isAuth && !!(session?.messages?.length);

    const toolNamesByUseId = new Map<string, string>();
    // [v0.46.6] Accumulate text deltas so we can run the markdown-table-
    // dump detector once the turn closes. Pure observation — never blocks
    // the stream, never modifies the response.
    const narrationParts: string[] = [];
    const calledToolNames: string[] = [];

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let pendingAction: PendingAction | null = null;

        try {
          if (sessionId) {
            controller.enqueue(
              encoder.encode(
                `event: session\ndata: ${JSON.stringify({ sessionId })}\n\n`,
              ),
            );
          }

          // [v0.46.7] Intent-driven pre-dispatch.
          //
          // For direct read questions ("what's my net worth", "am I at risk
          // of liquidation", "show available MPP services") we deterministically
          // run the corresponding read tool BEFORE invoking the LLM. This
          // closes the long-tail gap where the model skipped tool calls based
          // on its own efficiency heuristic ("data is fresh enough from earlier
          // turn"), leaving the user without a rich card.
          //
          // Mechanism mirrors the existing prefetch convention in
          // `buildSyntheticPrefetch`: append assistant(tool_use) + user(tool_result)
          // ContentBlocks to the message ledger, then let `submitMessage` push
          // the user's text and run the agent loop. The LLM sees the fresh
          // result in context and narrates around it without re-calling.
          // SSE events for the synthetic tool calls are streamed BEFORE the
          // LLM's stream so cards render immediately and metrics row is complete.
          const trimmedMessage = message.trim();

          /**
           * [v1.4 — Item 2] Build the dispatch list as
           *   RESUMED_SESSION_INTENTS (auth + resumed only)  +  classifier output
           * with `argsFingerprint`-keyed dedup. Implementation lives in
           * `lib/engine/dispatch-intents.ts` so the merge semantics can be
           * unit-tested without booting the full SSE handler.
           */
          const intents = buildDispatchIntents({
            classified: classifyReadIntents(trimmedMessage),
            isReturningSession,
            resumedIntents: RESUMED_SESSION_INTENTS,
          });

          // [Bug A trace] Always log a one-liner with intent classification
          // + dispatch outcome. When users report "this prompt didn't render
          // a card", we can grep this trace to see whether (a) classification
          // matched, (b) invokeReadTool ran, (c) what it returned. Cheap
          // (one log line per turn) and avoids the previous black box where
          // a missed card looked identical to "no rule matched".
          const messagePreview =
            trimmedMessage.length > 80
              ? `${trimmedMessage.slice(0, 80)}…`
              : trimmedMessage;
          console.info('[intent-dispatch] classified', {
            sessionId: sessionId ?? null,
            turnIndex,
            messagePreview,
            intentCount: intents.length,
            intents: intents.map((i) => ({
              tool: i.toolName,
              label: i.label,
              args: i.args,
            })),
          });

          if (intents.length > 0) {
            const priorMessages = engine.getMessages();
            const syntheticToolUses: ContentBlock[] = [];
            const syntheticToolResults: ContentBlock[] = [];

            for (const intent of intents) {
              // [v0.46.9] Discriminator avoids ID collisions when one turn
              // dispatches the same tool twice with different args (e.g.
              // transaction_history { date: today } AND { date: yesterday }
              // from a compound prompt). Empty discriminator preserves the
              // pre-existing `auto_<turn>_<tool>` ID for no-arg intents so
              // metrics and tests stay stable.
              const callId = makeAutoDispatchId(
                turnIndex,
                intent.toolName,
                intentDiscriminator(intent),
              );

              let result: { data: unknown; isError: boolean };
              try {
                result = await engine.invokeReadTool(
                  intent.toolName,
                  intent.args,
                );
              } catch (dispatchErr) {
                console.warn(
                  '[intent-dispatch] invokeReadTool threw — falling back to LLM flow',
                  {
                    sessionId: sessionId ?? null,
                    toolName: intent.toolName,
                    label: intent.label,
                    error:
                      dispatchErr instanceof Error
                        ? dispatchErr.message
                        : String(dispatchErr),
                  },
                );
                continue;
              }

              if (result.isError) {
                console.warn(
                  '[intent-dispatch] tool returned isError — falling back to LLM flow',
                  {
                    sessionId: sessionId ?? null,
                    toolName: intent.toolName,
                    label: intent.label,
                  },
                );
                continue;
              }

              syntheticToolUses.push({
                type: 'tool_use',
                id: callId,
                name: intent.toolName,
                input: intent.args,
              });
              syntheticToolResults.push({
                type: 'tool_result',
                toolUseId: callId,
                content: JSON.stringify({ data: result.data }),
              });

              const startEvent: EngineEvent = {
                type: 'tool_start',
                toolName: intent.toolName,
                toolUseId: callId,
                input: intent.args,
              };
              const resultEvent: EngineEvent = {
                type: 'tool_result',
                toolName: intent.toolName,
                toolUseId: callId,
                result: { data: result.data },
                isError: false,
                wasEarlyDispatched: true,
              };

              controller.enqueue(encoder.encode(serializeSSE(startEvent)));
              controller.enqueue(encoder.encode(serializeSSE(resultEvent)));

              toolNamesByUseId.set(callId, intent.toolName);
              calledToolNames.push(intent.toolName);
              collector.onToolStart(callId);
              collector.onToolResult(
                callId,
                intent.toolName,
                { data: result.data },
                {
                  wasTruncated: false,
                  wasEarlyDispatched: true,
                  resultDeduped: false,
                  returnedRefinement: false,
                },
              );

              // [Bug A trace] Confirm SSE events were enqueued. Pairs with
              // the [intent-dispatch] classified log above so a failed
              // reproduction shows whether dispatch reached this point.
              console.info('[intent-dispatch] dispatched', {
                sessionId: sessionId ?? null,
                turnIndex,
                callId,
                tool: intent.toolName,
                label: intent.label,
              });
            }

            if (syntheticToolUses.length > 0) {
              engine.loadMessages([
                ...priorMessages,
                { role: 'assistant', content: syntheticToolUses },
                { role: 'user', content: syntheticToolResults },
              ]);
            }
          }

          // [v1.4 Item 4] Tap raw EngineEvents for metrics BEFORE
          // serializing — the SSE adapter is lossy for our needs (`error`
          // events lose the Error type, and we want refinement detection
          // on the original `result` object).
          for await (const event of engine.submitMessage(trimmedMessage)) {
            switch (event.type) {
              case 'compaction':
                collector.onCompaction();
                continue; // don't pollute the SSE stream
              case 'text_delta':
                collector.onFirstTextDelta();
                if (typeof event.text === 'string') narrationParts.push(event.text);
                break;
              case 'tool_start':
                toolNamesByUseId.set(event.toolUseId, event.toolName);
                calledToolNames.push(event.toolName);
                collector.onToolStart(event.toolUseId);
                break;
              case 'tool_result':
                if (event.toolName === '__deduped__') {
                  // Engine-internal marker for microcompact dedup hits.
                  // Don't record a separate ToolMetric — flip the flag
                  // on the prior matching row so analytics see the saving.
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
                // [v1.4.2 — Day 3 / Spec Item 3] Pass the engine-stamped
                // `attemptId` so the resulting `TurnMetrics` row carries
                // it, and the resume route can `updateMany where {
                // attemptId }` to write the per-attempt outcome onto the
                // exact row this turn produced (instead of the ambiguous
                // `(sessionId, turnIndex)` pair that v1.3 used).
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
              // Engine-internal marker; skip serialization.
            } else {
              controller.enqueue(encoder.encode(serializeSSE(event)));
            }
          }
        } catch (err) {
          const rawMsg = err instanceof Error ? err.message : 'Engine error';
          const errorMsg = sanitizeStreamErrorMessage(rawMsg);
          // Always log the raw message server-side for debugging.
          console.error('[engine/chat] stream error:', rawMsg);
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ type: 'error', message: errorMsg })}\n\n`,
            ),
          );
        } finally {
          const messages = [...engine.getMessages()];
          const usage = engine.getUsage();

          // [v0.46.6] Card-tool + markdown-table-in-narration detector.
          // Pure observation — logs to the server only, never alters the
          // response. Tracks the rate at which Audric duplicates rich-card
          // data as a markdown table in chat (a v0.46.6 contract violation
          // per "Never duplicate card data in chat text").
          try {
            const narration = narrationParts.join('');
            const dump = detectNarrationTableDump(narration, calledToolNames);
            if (dump.violated) {
              console.warn(
                '[narration-dump] markdown table emitted alongside card-rendering tool',
                {
                  sessionId: sessionId ?? null,
                  cardTool: dump.cardTool,
                  toolsCalled: calledToolNames,
                  narrationPreview: narration.slice(0, 280),
                },
              );
            }
          } catch (dumpErr) {
            console.error('[narration-dump] detector failed (non-fatal):', dumpErr);
          }

          if (saveSession && sessionId && address) {
            try {
              const store = getSessionStore();
              const updatedSession = {
                id: sessionId,
                messages,
                usage,
                createdAt: session?.createdAt ?? Date.now(),
                updatedAt: Date.now(),
                pendingAction,
                metadata: { address },
              };
              await store.set(updatedSession);

              if (!requestedSessionId && store instanceof UpstashSessionStore) {
                await store.addToUserIndex(address, sessionId);
              }

              logConversationTurn(address, sessionId, messages, usage, engineMeta?.modelUsed).catch((err) =>
                console.error('[engine/chat] conversation log failed:', err),
              );
            } catch (saveErr) {
              console.error('[engine/chat] session save failed:', saveErr);
            }
          }

          if (saveSession && sessionId && address) {
            handleAdviceResults(address, sessionId, messages).catch((err) =>
              console.error('[engine/chat] advice log failed:', err),
            );
          }

          // F4: Update conversation state based on turn outcome
          if (saveSession && sessionId) {
            updateConversationState(sessionId, pendingAction, messages).catch((err) =>
              console.error('[engine/chat] state transition failed:', err),
            );
          }

          logSessionUsage(
            address ?? 'anonymous',
            sessionId ?? 'demo',
            usage,
            messages,
            AGENT_MODEL,
            priorMsgCount,
          ).catch((err) => console.error('[engine/chat] session usage log failed:', err));

          // [v1.4 Item 4] Fire-and-forget TurnMetrics row at turn close.
          // Wrapped in try/catch and `.catch()` to ensure analytics
          // failures NEVER surface to the user — the response is already
          // closed by `controller.close()` below regardless.
          if (saveSession && sessionId && address && engineMeta) {
            try {
              const inputTokens = usage.inputTokens ?? 0;
              const outputTokens = usage.outputTokens ?? 0;
              const cacheReadTokens = usage.cacheReadTokens ?? 0;
              const cacheWriteTokens = usage.cacheWriteTokens ?? 0;
              // [v0.47] Use per-model rates instead of hardcoded Sonnet
              // ($3/$15 per MTok). Pre-fix, Haiku turns were charged at
              // Sonnet rates in this metric, making them look 2–3x more
              // expensive than reality and muddying the effort-classifier
              // cost analysis. Also: include cache read/write rates so
              // cached turns aren't reported at full input cost.
              const rates = costRatesForModel(engineMeta.modelUsed);
              const estimatedCostUsd =
                inputTokens * rates.input +
                outputTokens * rates.output +
                cacheReadTokens * rates.cacheRead +
                cacheWriteTokens * rates.cacheWrite;
              const built = collector.build({
                sessionId,
                userId: address,
                turnIndex,
                effortLevel: engineMeta.effortLevel,
                modelUsed: engineMeta.modelUsed,
                contextTokensStart: priorMsgCount,
                estimatedCostUsd,
                sessionSpendUsd: sessionSpendUsdAtStart,
                // [v1.4.2 — Day 3 / Spec Item 3] Mark the row synthetic
                // when `sessionId` matches a prefix in
                // `SYNTHETIC_SESSION_PREFIXES`. The chat route is
                // user-prompt-driven for human traffic, but bot/test
                // harnesses (e.g. the `s_1777047351366…` load tester
                // backfilled in the v1.4.2 deploy SQL) drive it the
                // same way — so the *route* can't decide the bit on
                // its own; the sessionId prefix is the canonical
                // signal. This MUST stay aligned with the resume
                // route's identical derivation so a turn's `initial`
                // and `resume` rows agree on `synthetic` and don't
                // mis-pair under `WHERE synthetic = false` filters.
                synthetic: isSyntheticSessionId(sessionId),
                // [v1.4.2 — Day 3] Initial chat-route close. The resume
                // route writes a separate row with `turnPhase: 'resume'`
                // when the user resolves a pending action.
                turnPhase: 'initial',
              });
              // Prisma's JSON columns demand `InputJsonValue` shapes —
              // round-trip through JSON to strip class-y types and satisfy
              // both the runtime serialiser and the static typing.
              const payload = {
                ...built,
                toolsCalled: JSON.parse(JSON.stringify(built.toolsCalled)),
                guardsFired: JSON.parse(JSON.stringify(built.guardsFired)),
              };
              prisma.turnMetrics
                .create({ data: payload })
                .catch((err) =>
                  console.error('[TurnMetrics] write failed (non-fatal):', err),
                );
            } catch (metricsErr) {
              console.error('[TurnMetrics] build failed (non-fatal):', metricsErr);
            }
          }

          controller.close();
        }
      },
    });

    const headers: Record<string, string> = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    };
    if (sessionId) headers['X-Session-Id'] = sessionId;

    return new Response(stream, { headers });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Engine initialization failed';
    console.error('[engine/chat] init error:', errorMsg);
    return jsonError(errorMsg, 500);
  }
}

interface MessageLike {
  role: string;
  content?: unknown;
}

// [v1.3 — G11] Sonnet rates retained as defaults for the legacy
// `Message` / `ConversationLog` row writer below, where we don't have
// model context. The TurnMetrics path uses the per-model
// `costRatesForModel` helper imported from `@/lib/engine/cost-rates`.
const COST_PER_INPUT_TOKEN = 3 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 15 / 1_000_000;

function extractToolCalls(content: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(content)) return undefined;
  const calls = content.filter(
    (b: unknown): b is Record<string, unknown> =>
      typeof b === 'object' && b !== null && (b as Record<string, unknown>).type === 'tool_use',
  );
  return calls.length > 0 ? calls : undefined;
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return JSON.stringify(content ?? '');
  const texts = content
    .filter((b: unknown) => typeof b === 'object' && b !== null && (b as Record<string, unknown>).type === 'text')
    .map((b: unknown) => (b as Record<string, unknown>).text ?? '');
  return texts.join('\n') || JSON.stringify(content);
}

// [SIMPLIFICATION DAY 5] defaultFollowUpDays + AdviceItem.followUpDays
// retired with the follow-up cron stack. AdviceItem keeps the tool's input
// shape (followUpDays still parsed from record_advice payloads for
// backwards-compat) but the value is ignored on insert.
interface AdviceItem {
  adviceType: string;
  adviceText: string;
  targetAmount?: number;
  goalId?: string;
  followUpDays?: number;
}

async function handleAdviceResults(
  address: string,
  sessionId: string,
  messages: MessageLike[],
): Promise<void> {
  const user = await withPrismaRetry(
    () => prisma.user.findUnique({
      where: { suiAddress: address },
      select: { id: true },
    }),
    { label: 'handleAdviceResults:userFind' },
  );
  if (!user) return;

  const adviceItems: AdviceItem[] = [];

  for (const msg of messages) {
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;
    for (const block of msg.content) {
      const b = block as Record<string, unknown>;
      if (b.type !== 'tool_use' || b.name !== 'record_advice') continue;
      const input = b.input as { advice?: AdviceItem[] } | undefined;
      if (input?.advice) {
        adviceItems.push(...input.advice);
      }
    }
  }

  if (adviceItems.length === 0) return;

  for (const advice of adviceItems) {
    // [SIMPLIFICATION DAY 5] followUpDue dropped from AdviceLog along with
    // the follow-up cron stack. record_advice now logs pure history; advice
    // context surfaces it via buildAdviceContext without scheduling a check.
    await withPrismaRetry(
      () => prisma.adviceLog.create({
        data: {
          userId: user.id,
          sessionId,
          adviceText: advice.adviceText.slice(0, 500),
          adviceType: advice.adviceType,
          targetAmount: advice.targetAmount ?? null,
          goalId: advice.goalId ?? null,
        },
      }),
      { label: 'handleAdviceResults:create' },
    );
  }
}

async function logConversationTurn(
  address: string,
  sessionId: string,
  messages: MessageLike[],
  usage: { inputTokens?: number; outputTokens?: number },
  modelUsed?: string,
) {
  // [v0.49] Wrap fire-and-forget Prisma writes in withPrismaRetry to
  // smooth over transient Vercel / Neon driver hiccups. Without this
  // the lambda log fills with `DriverAdapterError: server conn crashed`
  // every time a freeze/thaw cycle kills the underlying socket.
  const user = await withPrismaRetry(
    () => prisma.user.upsert({
      where: { suiAddress: address },
      create: { suiAddress: address },
      update: {},
      select: { id: true },
    }),
    { label: 'logConversationTurn:userUpsert' },
  );

  const lastTwo = messages.slice(-2);
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  // [v0.47] Per-model rates so Haiku turns aren't reported at Sonnet prices.
  // Falls back to Sonnet defaults when modelUsed is unknown (e.g. unauth turns).
  const rates = modelUsed ? costRatesForModel(modelUsed) : { input: COST_PER_INPUT_TOKEN, output: COST_PER_OUTPUT_TOKEN };
  const costUsd = inputTokens * rates.input + outputTokens * rates.output;

  const rows = lastTwo.map((m) => {
    const tc = extractToolCalls(m.content);
    return {
      userId: user.id,
      sessionId,
      role: m.role,
      content: extractText(m.content),
      toolCalls: tc ? (JSON.parse(JSON.stringify(tc)) as object) : undefined,
      tokensUsed: m.role === 'assistant' ? outputTokens : inputTokens,
      costUsd: m.role === 'assistant' ? costUsd : 0,
    };
  });

  await withPrismaRetry(
    () => prisma.conversationLog.createMany({ data: rows }),
    { label: 'logConversationTurn:createMany' },
  );
}

async function updateConversationState(
  sessionId: string,
  pendingAction: PendingAction | null,
  messages: MessageLike[],
): Promise<void> {
  if (pendingAction) {
    await setConversationState(sessionId, {
      type: 'awaiting_confirmation',
      action: pendingAction.toolName,
      amount: typeof (pendingAction.input as Record<string, unknown>)?.amount === 'number'
        ? (pendingAction.input as Record<string, unknown>).amount as number
        : undefined,
      recipient: typeof (pendingAction.input as Record<string, unknown>)?.recipient === 'string'
        ? (pendingAction.input as Record<string, unknown>).recipient as string
        : undefined,
      proposedAt: Date.now(),
      expiresAt: Date.now() + 5 * 60_000,
    });
    return;
  }

  // tool_result blocks live in USER messages (the engine auto-creates them),
  // so scan user messages — not assistant messages — for errors.
  const userMessages = messages.filter((m) => m.role === 'user' && Array.isArray(m.content));
  const lastUserWithResults = [...userMessages].reverse().find((m) =>
    (m.content as Record<string, unknown>[]).some((b) => b.type === 'tool_result'),
  );

  if (lastUserWithResults && Array.isArray(lastUserWithResults.content)) {
    const blocks = lastUserWithResults.content as Record<string, unknown>[];
    const errorBlock = blocks.find((b) => b.type === 'tool_result' && b.isError === true);

    if (errorBlock) {
      // Find the corresponding tool_use in the preceding assistant message
      const userIdx = messages.indexOf(lastUserWithResults);
      const precedingAssistant = userIdx > 0 ? messages[userIdx - 1] : null;
      const failedTool = Array.isArray(precedingAssistant?.content)
        ? (precedingAssistant!.content as Record<string, unknown>[]).find((b) => b.type === 'tool_use')
        : undefined;

      await setConversationState(sessionId, {
        type: 'post_error',
        failedAction: (failedTool?.name as string) ?? 'unknown',
        errorMessage: typeof errorBlock.content === 'string' ? errorBlock.content.slice(0, 200) : 'Unknown error',
        occurredAt: Date.now(),
      });
      return;
    }
  }

  // Successful turn — reset to idle
  await setConversationState(sessionId, { type: 'idle' });
}
