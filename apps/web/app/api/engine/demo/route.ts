import { NextRequest } from 'next/server';
import { engineToSSE } from '@t2000/engine';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import {
  createDemoEngine,
  type DemoHistoryMessage,
} from '@/lib/engine/engine-factory';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_MESSAGE_LENGTH = 500;
const MAX_HISTORY_LENGTH = 12;

interface DemoRequestBody {
  message: string;
  history?: DemoHistoryMessage[];
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: NextRequest) {
  let body: DemoRequestBody;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const { message, history = [] } = body;

  if (!message?.trim()) {
    return jsonError('message is required', 400);
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return jsonError(`Message too long (max ${MAX_MESSAGE_LENGTH} chars)`, 400);
  }

  if (history.length > MAX_HISTORY_LENGTH) {
    return jsonError(`History too long (max ${MAX_HISTORY_LENGTH} messages)`, 400);
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = rateLimit(`demo:${ip}`, 30, 600_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  try {
    const engine = createDemoEngine(history);

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          for await (const chunk of engineToSSE(
            engine.submitMessage(message.trim()),
          )) {
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (err) {
          const errorMsg =
            err instanceof Error ? err.message : 'Engine error';
          console.error('[engine/demo] stream error:', errorMsg);
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
    const errorMsg = err instanceof Error ? err.message : 'Engine initialization failed';
    console.error('[engine/demo] init error:', errorMsg);
    return jsonError(errorMsg, 500);
  }
}
