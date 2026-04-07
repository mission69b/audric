import { NextRequest, NextResponse } from 'next/server';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

/**
 * POST /api/user/briefing/dismiss
 * Body: { address }
 * Sets dismissedAt on today's briefing.
 */
export async function POST(request: NextRequest) {
  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  let body: { address?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { address } = body;
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { suiAddress: address },
    select: { id: true, timezoneOffset: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const localDate = getUserLocalDate(user.timezoneOffset);

  await prisma.dailyBriefing.updateMany({
    where: {
      userId: user.id,
      date: localDate,
      dismissedAt: null,
    },
    data: { dismissedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}

function getUserLocalDate(timezoneOffset: number): string {
  const now = new Date();
  const localMs = now.getTime() - timezoneOffset * 60 * 1000;
  return new Date(localMs).toISOString().slice(0, 10);
}
