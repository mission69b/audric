import { NextRequest } from 'next/server';
import { engineToSSE } from '@t2000/engine';
import type { PendingAction } from '@t2000/engine';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import { createEngine, getSessionStore } from '@/lib/engine/engine-factory';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface ResumeRequestBody {
  address: string;
  sessionId: string;
  action: PendingAction;
  approved: boolean;
  executionResult?: unknown;
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

  const { address, sessionId, action, approved, executionResult } = body;

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

  try {
    const engine = await createEngine(address, session, { pendingAction: action });

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let pendingAction: PendingAction | null = null;

        try {
          for await (const chunk of engineToSSE(
            engine.resumeWithToolResult(action, { approved, executionResult }),
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

          const updatedSession = {
            ...session,
            messages: [...engine.getMessages()],
            usage: engine.getUsage(),
            updatedAt: Date.now(),
            pendingAction,
          };

          await store.set(updatedSession);
        } catch (err) {
          const errorMsg =
            err instanceof Error ? err.message : 'Engine error';
          console.error('[engine/resume] stream error:', errorMsg);
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ type: 'error', message: errorMsg })}\n\n`,
            ),
          );
        } finally {
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
