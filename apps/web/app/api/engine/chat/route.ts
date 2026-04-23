import { NextRequest } from 'next/server';
import { serializeSSE } from '@t2000/engine';
import type { PendingAction } from '@t2000/engine';
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
} from '@/lib/engine/harness-metrics';
import { prisma } from '@/lib/prisma';
import {
  SESSION_LIMIT_VERIFIED,
  SESSION_WINDOW_MS,
  sessionLimitFor,
} from '@/lib/billing';

const AGENT_MODEL = process.env.AGENT_MODEL ?? 'claude-sonnet-4-6';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_HISTORY = 12;
const MAX_MSG_LEN = 500;

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

    const toolNamesByUseId = new Map<string, string>();

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

          // [v1.4 Item 4] Tap raw EngineEvents for metrics BEFORE
          // serializing — the SSE adapter is lossy for our needs (`error`
          // events lose the Error type, and we want refinement detection
          // on the original `result` object).
          for await (const event of engine.submitMessage(message.trim())) {
            switch (event.type) {
              case 'compaction':
                collector.onCompaction();
                continue; // don't pollute the SSE stream
              case 'text_delta':
                collector.onFirstTextDelta();
                break;
              case 'tool_start':
                toolNamesByUseId.set(event.toolUseId, event.toolName);
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
                collector.onPendingAction();
                pendingAction = event.action;
                break;
              default:
                break;
            }

            if (event.type === 'error') {
              controller.enqueue(
                encoder.encode(serializeSSE({ type: 'error', message: event.error.message })),
              );
            } else if (event.type === 'tool_result' && event.toolName === '__deduped__') {
              // Engine-internal marker; skip serialization.
            } else {
              controller.enqueue(encoder.encode(serializeSSE(event)));
            }
          }
        } catch (err) {
          const errorMsg =
            err instanceof Error ? err.message : 'Engine error';
          console.error('[engine/chat] stream error:', errorMsg);
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ type: 'error', message: errorMsg })}\n\n`,
            ),
          );
        } finally {
          const messages = [...engine.getMessages()];
          const usage = engine.getUsage();

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

              logConversationTurn(address, sessionId, messages, usage).catch((err) =>
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
              const estimatedCostUsd =
                inputTokens * COST_PER_INPUT_TOKEN + outputTokens * COST_PER_OUTPUT_TOKEN;
              const built = collector.build({
                sessionId,
                userId: address,
                turnIndex,
                effortLevel: engineMeta.effortLevel,
                modelUsed: engineMeta.modelUsed,
                contextTokensStart: priorMsgCount,
                estimatedCostUsd,
                sessionSpendUsd: sessionSpendUsdAtStart,
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
  const user = await prisma.user.findUnique({
    where: { suiAddress: address },
    select: { id: true },
  });
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
    await prisma.adviceLog.create({
      data: {
        userId: user.id,
        sessionId,
        adviceText: advice.adviceText.slice(0, 500),
        adviceType: advice.adviceType,
        targetAmount: advice.targetAmount ?? null,
        goalId: advice.goalId ?? null,
      },
    });
  }
}

async function logConversationTurn(
  address: string,
  sessionId: string,
  messages: MessageLike[],
  usage: { inputTokens?: number; outputTokens?: number },
) {
  const user = await prisma.user.upsert({
    where: { suiAddress: address },
    create: { suiAddress: address },
    update: {},
    select: { id: true },
  });

  const lastTwo = messages.slice(-2);
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const costUsd = inputTokens * COST_PER_INPUT_TOKEN + outputTokens * COST_PER_OUTPUT_TOKEN;

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

  await prisma.conversationLog.createMany({ data: rows });
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
