import { NextRequest, NextResponse } from 'next/server';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

/**
 * GET /api/user/status?address=0x...
 * Returns onboarding + ToS acceptance state for the current user.
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
      select: { onboardedAt: true, tosAcceptedAt: true },
    }),
    prisma.sessionUsage.groupBy({
      by: ['sessionId'],
      where: { address },
    }).then((rows) => rows.length).catch(() => 0),
  ]);

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({
    onboarded: user.onboardedAt !== null,
    tosAccepted: user.tosAcceptedAt !== null,
    sessionsUsed: sessionCount,
  });
}
