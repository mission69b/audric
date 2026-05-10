import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import { getSessionStore } from '@/lib/engine/engine-factory';
import { UpstashSessionStore } from '@/lib/engine/upstash-session-store';
import {
  SESSION_BOOTSTRAP_SENTINEL,
  stripLlmDirectives,
} from '@/lib/engine/strip-llm-directives';

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
  // [S18-F19, 2026-05-08 post-launch] Bumped 10 → 30 / 60s after the
  // showcase 48h window showed normal browsing patterns tripping the
  // limit. The sidebar history list is fetched by `ConvoHistoryList`
  // on every dashboard-shell mount; a user navigating dashboard →
  // /pay → back → /<handle> → back can re-mount 5+ times in a minute
  // without abuse intent. The endpoint is read-only (Upstash list +
  // per-id GETs); cheap. 30/min still rate-limits scripted scraping.
  const rl = rateLimit(`engine-sessions:${ip}`, 30, 60_000);
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
      //     "first message must be user" invariant,
      //   - user messages whose entire text is just LLM-only
      //     meta-directives (`<post_write_anchor>`, `<canonical_route>`,
      //     `<bundle_reverted>`) — those messages exist in the ledger
      //     because the engine needs them, but they're not user
      //     utterances. Today the first non-bootstrap user message is
      //     always a real prompt (no prefixes), so this defense-in-depth
      //     branch is unreachable in production. It's here so a future
      //     change can't regress preview cleanliness.
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
        if (textBlock.text === SESSION_BOOTSTRAP_SENTINEL) continue;
        const cleaned = stripLlmDirectives(textBlock.text);
        if (cleaned.length === 0) continue;
        preview = cleaned.slice(0, 80);
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
