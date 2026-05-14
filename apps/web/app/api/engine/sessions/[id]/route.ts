import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { authenticateRequest } from '@/lib/auth';
import { getSessionStore } from '@/lib/engine/engine-factory';
import { UpstashSessionStore } from '@/lib/engine/upstash-session-store';
import { asHarnessVersion } from '@/lib/interactive-harness';
import {
  convertSessionMessages,
  type SessionMessage,
} from './route-helpers';

export const runtime = 'nodejs';

/**
 * [SPEC 30 Phase 1A.3] Resource-keyed binding for session-id routes.
 *
 * Sessions are keyed by an opaque id; the IDOR-relevant address is
 * stored in `session.metadata.address`. We deliberately collapse
 * "session not found" and "session not owned" into the same 404
 * response so an enumeration attacker cannot distinguish "session id
 * exists for someone else" from "session id doesn't exist anywhere"
 * (otherwise the response status would leak existence + ownership).
 */
function ownsSession(verifiedAddress: string, metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  const ownerAddress = (metadata as { address?: unknown }).address;
  return typeof ownerAddress === 'string' && ownerAddress === verifiedAddress;
}

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
  const auth = await authenticateRequest(request);
  if ('error' in auth) return auth.error;

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
  if (!data || !ownsSession(auth.verified.suiAddress, data.metadata)) {
    // [SPEC 30 Phase 1A.3] Collapse "not found" + "not owned" → 404 to
    // prevent session-id enumeration. Pre-Phase-1A this route returned
    // chat history for any session id the caller could guess; the
    // reporter PoC named this as the wallet-access leak vector.
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
  const auth = await authenticateRequest(request);
  if ('error' in auth) return auth.error;

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = rateLimit(`engine-session-del:${ip}`, 10, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  const store = getSessionStore();
  if (!(store instanceof UpstashSessionStore)) {
    return NextResponse.json({ error: 'Session store not available' }, { status: 501 });
  }

  const { id } = await params;
  // [SPEC 30 Phase 1A.3] Verify ownership BEFORE delete. Same 404
  // collapse rule as GET — don't leak existence to non-owners.
  const existing = await store.get(id);
  if (!existing || !ownsSession(auth.verified.suiAddress, existing.metadata)) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  await store.delete(id);

  return NextResponse.json({ deleted: true });
}
