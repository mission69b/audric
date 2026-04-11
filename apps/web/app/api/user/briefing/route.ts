import { NextRequest, NextResponse } from 'next/server';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

/**
 * GET /api/user/briefing?address=0x...
 * Returns today's briefing for the user (if not dismissed).
 * Uses UTC date to match the cron's dedup key.
 * Auto-syncs timezoneOffset from X-Timezone-Offset header if present.
 */
export async function GET(request: NextRequest) {
  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  const address = request.nextUrl.searchParams.get('address');
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  // Auto-sync timezone offset if client sends it (handles travelers).
  const clientOffset = request.headers.get('x-timezone-offset');
  const parsedOffset = clientOffset !== null ? parseInt(clientOffset, 10) : null;
  const shouldSyncOffset = parsedOffset !== null && Number.isFinite(parsedOffset)
    && parsedOffset >= -720 && parsedOffset <= 840;

  const user = await prisma.user.findUnique({
    where: { suiAddress: address },
    select: { id: true, timezoneOffset: true },
  });

  if (!user) {
    return NextResponse.json({ briefing: null });
  }

  if (shouldSyncOffset && parsedOffset !== user.timezoneOffset) {
    await prisma.user.update({
      where: { suiAddress: address },
      data: { timezoneOffset: parsedOffset! },
    });
  }

  const now = new Date();
  const todayUtc = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);

  // Check today first, then yesterday — covers the gap between midnight UTC
  // and when the cron creates today's briefing at 13:00 UTC.
  const briefing = await prisma.dailyBriefing.findFirst({
    where: {
      userId: user.id,
      date: { in: [todayUtc, yesterday] },
      dismissedAt: null,
    },
    orderBy: { date: 'desc' },
    select: {
      date: true,
      content: true,
      dismissedAt: true,
      createdAt: true,
    },
  });

  if (!briefing) {
    return NextResponse.json({ briefing: null });
  }

  return NextResponse.json({
    briefing: {
      date: briefing.date,
      content: briefing.content,
      createdAt: briefing.createdAt.toISOString(),
    },
  });
}
