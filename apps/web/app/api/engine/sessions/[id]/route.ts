import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { validateJwt } from '@/lib/auth';
import { getSessionStore } from '@/lib/engine/engine-factory';
import { UpstashSessionStore } from '@/lib/engine/upstash-session-store';
import { asHarnessVersion } from '@/lib/interactive-harness';
import {
  convertSessionMessages,
  type SessionMessage,
} from './route-helpers';

export const runtime = 'nodejs';

interface LastInterruption {
  turnIndex: number;
  replayText: string;
  interruptedAt: number;
}

function isLastInterruption(v: unknown): v is LastInterruption {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.turnIndex === 'number' &&
    typeof r.replayText === 'string' &&
    typeof r.interruptedAt === 'number'
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = rateLimit(`engine-session:${ip}`, 20, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  const store = getSessionStore();
  if (!(store instanceof UpstashSessionStore)) {
    return NextResponse.json({ error: 'Session store not available' }, { status: 501 });
  }

  const { id } = await params;
  const data = await store.get(id);
  if (!data) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const messages = convertSessionMessages(
    data.messages as SessionMessage[],
    data.createdAt,
  );

  // [B3.4 / Gap J] Attach the interruption marker to the matching
  // assistant message (the one whose response was cut off) so the
  // client renders `<RetryInterruptedTurn>` on rehydrate. We compare
  // by `turnIndex` (number of assistant messages BEFORE the
  // interrupted one) against the position of each assistant in the
  // returned `messages` array. The match is loose-by-position rather
  // than by id — `convertSessionMessages` synthesises ids, and the
  // server doesn't carry stable ids across reloads.
  const lastInterruption = isLastInterruption(data.metadata?.lastInterruption)
    ? data.metadata.lastInterruption
    : undefined;
  if (lastInterruption) {
    let assistantSeen = 0;
    for (const m of messages) {
      if (m.role !== 'assistant') continue;
      if (assistantSeen === lastInterruption.turnIndex) {
        m.interrupted = true;
        m.interruptedReplayText = lastInterruption.replayText;
        break;
      }
      assistantSeen++;
    }
  }

  // [SPEC 23A-P0, 2026-05-11] Surface the pinned harness version on
  // session reload. Post-rip only `'v2'` is reachable in production;
  // the defensive auto-flip guard below ensures any stale `'legacy'`
  // pin (e.g. from a restored backup or manual store edit during the
  // deprecation cycle) deserialises as `'v2'` so the client never
  // tries to render a non-existent renderer.
  const rawPin = asHarnessVersion(data.metadata?.harnessVersion);
  const harnessVersion = rawPin === 'legacy' ? 'v2' : rawPin;

  return NextResponse.json({
    id: data.id,
    messages,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    harnessVersion,
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = rateLimit(`engine-session-del:${ip}`, 10, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  const store = getSessionStore();
  if (!(store instanceof UpstashSessionStore)) {
    return NextResponse.json({ error: 'Session store not available' }, { status: 501 });
  }

  const { id } = await params;
  await store.delete(id);

  return NextResponse.json({ deleted: true });
}
