import { NextRequest } from 'next/server';
import { engineToSSE } from '@t2000/engine';
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
import { prisma } from '@/lib/prisma';

const AGENT_MODEL = process.env.AGENT_MODEL ?? 'claude-sonnet-4-6';
const SERVER_URL = process.env.SERVER_URL ?? 'https://api.t2000.ai';
const SPONSOR_INTERNAL_KEY = process.env.SPONSOR_INTERNAL_KEY ?? '';
const SESSION_CHARGE_AMOUNT = 10_000; // $0.01 USDC (6 decimals)
const SESSION_FEATURE = 4; // ALLOWANCE_FEATURES.SESSION
const FREE_SESSION_LIMIT = 20;

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

    if (isAuth) {
      const store = getSessionStore();
      sessionId = requestedSessionId || generateSessionId();
      session = requestedSessionId ? await store.get(requestedSessionId) : null;
      saveSession = true;

      const prefs = await prisma.userPreferences.findUnique({
        where: { address },
        select: { contacts: true, allowanceId: true },
      }).catch(() => null);

      const contacts = Array.isArray(prefs?.contacts) ? prefs.contacts as Array<{ name: string; address: string }> : [];
      const hasAllowance = !!prefs?.allowanceId;

      if (!requestedSessionId) {
        if (hasAllowance) {
          chargeSession(address).catch((err) =>
            console.warn('[engine/chat] session charge fire-and-forget error:', err),
          );
        } else {
          const sessionCount = await prisma.sessionUsage.groupBy({
            by: ['sessionId'],
            where: { address },
          }).then((rows) => rows.length).catch(() => 0);

          if (sessionCount >= FREE_SESSION_LIMIT) {
            return jsonError(
              'Free sessions used up. Set up your allowance to continue — it takes 30 seconds.',
              402,
            );
          }
        }
      }

      const conversationState = sessionId ? await getConversationState(sessionId).catch(() => undefined) : undefined;

      engine = await createEngine({
        address,
        session,
        contacts,
        message: message.trim(),
        conversationState,
      });
    } else {
      engine = await createUnauthEngine(history);
    }

    const priorMsgCount = engine.getMessages().length;

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

          for await (const chunk of engineToSSE(
            engine.submitMessage(message.trim()),
          )) {
            controller.enqueue(encoder.encode(chunk));

            if (chunk.includes('"type":"pending_action"')) {
              try {
                const match = chunk.match(/data: (.+)/);
                if (match) {
                  const parsed = JSON.parse(match[1]);
                  if (parsed.type === 'pending_action') {
                    pendingAction = parsed.action;
                  }
                }
              } catch { /* best effort */ }
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

function defaultFollowUpDays(type: string): number {
  const map: Record<string, number> = {
    save: 2, repay: 1, borrow: 7, swap: 7, goal: 7, rate: 7, general: 14,
  };
  return map[type] ?? 7;
}

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
    const followUpDays = advice.followUpDays ?? defaultFollowUpDays(advice.adviceType);
    await prisma.adviceLog.create({
      data: {
        userId: user.id,
        sessionId,
        adviceText: advice.adviceText.slice(0, 500),
        adviceType: advice.adviceType,
        targetAmount: advice.targetAmount ?? null,
        goalId: advice.goalId ?? null,
        followUpDue: new Date(Date.now() + followUpDays * 86_400_000),
      },
    });
  }
}

async function chargeSession(address: string): Promise<string | null> {
  try {
    const prefs = await prisma.userPreferences.findUnique({
      where: { address },
      select: { allowanceId: true },
    });

    const allowanceId = prefs?.allowanceId ?? null;
    if (!allowanceId) return null;

    const res = await fetch(`${SERVER_URL}/api/internal/charge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': SPONSOR_INTERNAL_KEY,
      },
      body: JSON.stringify({
        allowanceId,
        amount: SESSION_CHARGE_AMOUNT,
        feature: SESSION_FEATURE,
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => 'unknown');
      console.warn(`[engine/chat] session charge failed (${res.status}):`, err);
      return null;
    }

    const data = (await res.json()) as { digest?: string };
    return data.digest ?? null;
  } catch (err) {
    console.warn('[engine/chat] session charge error:', err instanceof Error ? err.message : err);
    return null;
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
