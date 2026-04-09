import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateInternalKey } from '@/lib/internal-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/internal/onboarding-followup
 * Returns users who onboarded 24–48h ago and haven't received a follow-up yet.
 * Called by the t2000 ECS cron once daily at BRIEFING_UTC_HOUR.
 */
export async function GET(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  const users = await prisma.user.findMany({
    where: {
      onboardedAt: {
        gte: fortyEightHoursAgo,
        lte: twentyFourHoursAgo,
      },
      emailVerified: true,
      email: { not: null },
    },
    select: {
      id: true,
      email: true,
      suiAddress: true,
      timezoneOffset: true,
    },
  });

  // Filter out users who already received an onboarding_followup AppEvent
  const userIds = users.map((u) => u.id);
  const existingFollowups = userIds.length > 0
    ? await prisma.appEvent.findMany({
        where: {
          address: { in: users.map((u) => u.suiAddress) },
          type: 'onboarding_followup',
        },
        select: { address: true },
      })
    : [];
  const followedUp = new Set(existingFollowups.map((e) => e.address));

  const eligible = users
    .filter((u) => !followedUp.has(u.suiAddress))
    .map((u) => ({
      userId: u.id,
      email: u.email!,
      walletAddress: u.suiAddress,
      timezoneOffset: u.timezoneOffset,
    }));

  return NextResponse.json({ users: eligible });
}
