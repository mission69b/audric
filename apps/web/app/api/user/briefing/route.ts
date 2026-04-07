import { NextRequest, NextResponse } from 'next/server';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

/**
 * GET /api/user/briefing?address=0x...
 * Returns today's briefing for the user (if not dismissed).
 * Uses the user's timezoneOffset to determine "today".
 */
export async function GET(request: NextRequest) {
  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  const address = request.nextUrl.searchParams.get('address');
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { suiAddress: address },
    select: { id: true, timezoneOffset: true },
  });

  if (!user) {
    return NextResponse.json({ briefing: null });
  }

  const localDate = getUserLocalDate(user.timezoneOffset);

  const briefing = await prisma.dailyBriefing.findUnique({
    where: { userId_date: { userId: user.id, date: localDate } },
    select: {
      date: true,
      content: true,
      dismissedAt: true,
      createdAt: true,
    },
  });

  if (!briefing || briefing.dismissedAt) {
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

function getUserLocalDate(timezoneOffset: number): string {
  const now = new Date();
  const localMs = now.getTime() - timezoneOffset * 60 * 1000;
  return new Date(localMs).toISOString().slice(0, 10);
}
