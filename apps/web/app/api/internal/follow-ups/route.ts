import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateInternalKey } from '@/lib/internal-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/internal/follow-ups?userId=...
 * Returns delivered follow-ups for a user (sentAt is not null).
 * Used by the dashboard to display follow-up history cards.
 */
export async function GET(request: NextRequest) {
  const authResult = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in authResult) return authResult.error;

  const userId = request.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const entries = await prisma.followUpQueue.findMany({
    where: {
      userId,
      sentAt: { not: null },
      scheduledFor: { lte: new Date() },
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    take: 10,
  });

  return NextResponse.json({ followUps: entries });
}
