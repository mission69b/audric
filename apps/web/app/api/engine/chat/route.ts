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
  type HistoryMessage,
} from '@/lib/engine/engine-factory';
import { UpstashSessionStore } from '@/lib/engine/upstash-session-store';
import { logSessionUsage } from '@/lib/engine/log-session-usage';
import { prisma } from '@/lib/prisma';

const AGENT_MODEL = process.env.AGENT_MODEL ?? 'claude-sonnet-4-20250514';
const SERVER_URL = process.env.SERVER_URL ?? 'https://api.t2000.ai';
const SPONSOR_INTERNAL_KEY = process.env.SPONSOR_INTERNAL_KEY ?? '';
const SESSION_CHARGE_AMOUNT = 10_000; // $0.01 USDC (6 decimals)
const SESSION_FEATURE = 4; // ALLOWANCE_FEATURES.SESSION

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

      const contacts = await prisma.userPreferences.findUnique({ where: { address }, select: { contacts: true } })
        .then((p) => (Array.isArray(p?.contacts) ? p.contacts as Array<{ name: string; address: string }> : []))
        .catch(() => []);

      if (!requestedSessionId) {
        chargeSession(address).catch((err) =>
          console.warn('[engine/chat] session charge fire-and-forget error:', err),
        );
      }

      engine = await createEngine(address, session, contacts);
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
      select: { limits: true },
    });

    const limits = prefs?.limits as Record<string, unknown> | null;
    const allowanceId = (limits?.allowanceId as string) ?? null;
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
