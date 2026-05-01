import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { validateJwt } from '@/lib/auth';
import { getSessionStore } from '@/lib/engine/engine-factory';
import { UpstashSessionStore } from '@/lib/engine/upstash-session-store';
import { asHarnessVersion } from '@/lib/interactive-harness';

export const runtime = 'nodejs';

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  id?: string;
  toolUseId?: string;
  input?: unknown;
  content?: string;
  isError?: boolean;
}

interface SessionMessage {
  role: 'user' | 'assistant';
  content: ContentBlock[];
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  tools?: {
    toolName: string;
    toolUseId: string;
    input: unknown;
    status: 'done' | 'error';
    result?: unknown;
    isError?: boolean;
  }[];
  // [B3.4 / Gap J] Optional interruption flag — set on the LAST
  // assistant message when `metadata.lastInterruption` matches its
  // turn index. Powers the `<RetryInterruptedTurn>` pill on rehydrate.
  interrupted?: boolean;
  interruptedReplayText?: string;
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

function convertSessionMessages(messages: SessionMessage[], createdAt: number): ChatMessage[] {
  const result: ChatMessage[] = [];
  let idx = 0;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === 'user') {
      const textBlocks = msg.content.filter((b) => b.type === 'text');
      if (textBlocks.length === 0) continue;

      result.push({
        id: `hist_${idx++}`,
        role: 'user',
        content: textBlocks.map((b) => b.text ?? '').join('\n'),
        timestamp: createdAt + i * 1000,
      });
    } else if (msg.role === 'assistant') {
      const textParts = msg.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '');

      const thinkingParts = msg.content
        .filter((b) => b.type === 'thinking')
        .map((b) => (b as unknown as { thinking: string }).thinking ?? '');
      const thinking = thinkingParts.length > 0 ? thinkingParts.join('\n') : undefined;

      const toolUses = msg.content.filter((b) => b.type === 'tool_use');
      const nextMsg = messages[i + 1];
      const toolResultMap = new Map<string, ContentBlock>();

      if (nextMsg?.role === 'user') {
        for (const b of nextMsg.content) {
          if (b.type === 'tool_result' && b.toolUseId) {
            toolResultMap.set(b.toolUseId, b);
          }
        }
      }

      const tools = toolUses.map((tu) => {
        const resultBlock = toolResultMap.get(tu.id!);
        return {
          toolName: tu.name!,
          toolUseId: tu.id!,
          input: tu.input,
          status: (resultBlock?.isError ? 'error' : 'done') as 'done' | 'error',
          result: resultBlock?.content ? tryParseJson(resultBlock.content) : undefined,
          isError: resultBlock?.isError,
        };
      });

      result.push({
        id: `hist_${idx++}`,
        role: 'assistant',
        content: textParts.join('\n'),
        timestamp: createdAt + i * 1000,
        ...(tools.length > 0 ? { tools } : {}),
        ...(thinking ? { thinking } : {}),
      });
    }
  }

  return result;
}

function tryParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
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

  // [B3.3 / G4] Surface the pinned harness version so the client can
  // gate <ChatMessage> on a stable per-session value when re-loading
  // an existing session (instead of re-evaluating the env var, which
  // could mid-rollout differ from the value the session was opened
  // under). Pre-B3.3 sessions return `undefined`; the client falls
  // back to the env-var read in that case.
  const harnessVersion = asHarnessVersion(data.metadata?.harnessVersion);

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
