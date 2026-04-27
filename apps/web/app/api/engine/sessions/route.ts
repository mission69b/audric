import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import { getSessionStore } from '@/lib/engine/engine-factory';
import { UpstashSessionStore } from '@/lib/engine/upstash-session-store';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  const address = request.nextUrl.searchParams.get('address');
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Valid address required' }, { status: 400 });
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = rateLimit(`engine-sessions:${ip}`, 10, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  const store = getSessionStore();
  if (!(store instanceof UpstashSessionStore)) {
    return NextResponse.json({ sessions: [] });
  }

  const limit = Math.min(
    parseInt(request.nextUrl.searchParams.get('limit') ?? '20', 10) || 20,
    50,
  );

  const sessionIds = await store.listByUser(address, limit);

  const sessions = await Promise.all(
    sessionIds.map(async (id) => {
      const data = await store.get(id);
      if (!data) return null;
      // Walk all user messages to find the first real text utterance.
      // We must skip:
      //   - user messages with no text block (e.g. tool_result envelopes
      //     emitted by buildSyntheticPrefetch and runtime tool execution),
      //   - the `[session bootstrap]` sentinel inserted by
      //     buildSyntheticPrefetch to satisfy Anthropic's
      //     "first message must be user" invariant.
      let preview = 'Conversation';
      const userMessages =
        data.messages?.filter((m) => m.role === 'user') ?? [];
      for (const m of userMessages) {
        const textBlock = (
          m.content as Array<{ type: string; text?: string }>
        ).find((b) => b.type === 'text' && typeof b.text === 'string') as
          | { type: 'text'; text: string }
          | undefined;
        if (!textBlock?.text) continue;
        if (textBlock.text === '[session bootstrap]') continue;
        preview = textBlock.text.slice(0, 80);
        break;
      }
      return {
        id: data.id,
        preview,
        messageCount: data.messages?.length ?? 0,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    }),
  );

  return NextResponse.json({
    sessions: sessions.filter(Boolean),
  });
}
