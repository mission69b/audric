import { NextRequest, NextResponse } from 'next/server';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  SESSION_WINDOW_MS,
  sessionLimitFor,
} from '@/lib/billing';

export const runtime = 'nodejs';

/**
 * GET /api/user/status?address=0x...
 *
 * Returns ToS state plus the current session-usage tier (rolling 24h
 * window, distinct sessions). Consumers can use `sessionsUsed`,
 * `sessionLimit`, and `emailVerified` to render a pre-emptive
 * "X of N sessions today" UI without waiting for the chat route to 429.
 *
 * [SIMPLIFICATION DAY 5] `onboarded` removed from the response — the
 * `onboardedAt` column was dropped along with the /setup wizard. The hook
 * keeps an `onboarded: true` default for any consumers reading it during
 * the deprecation window (chat-first means everyone is "onboarded" the
 * moment they sign in).
 */
export async function GET(request: NextRequest) {
  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  const address = request.nextUrl.searchParams.get('address');
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const [user, sessionCount] = await Promise.all([
    prisma.user.findUnique({
      where: { suiAddress: address },
      select: {
        tosAcceptedAt: true,
        emailVerified: true,
      },
    }),
    prisma.sessionUsage.groupBy({
      by: ['sessionId'],
      where: {
        address,
        createdAt: { gte: new Date(Date.now() - SESSION_WINDOW_MS) },
      },
    }).then((rows) => rows.length).catch(() => 0),
  ]);

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const emailVerified = user.emailVerified;
  const sessionLimit = sessionLimitFor(emailVerified);

  return NextResponse.json({
    tosAccepted: user.tosAcceptedAt !== null,
    emailVerified,
    sessionsUsed: sessionCount,
    sessionLimit,
    sessionWindowHours: 24,
  });
}
