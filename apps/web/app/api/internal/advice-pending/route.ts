import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateInternalKey } from '@/lib/internal-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/internal/advice-pending
 * Returns AdviceLogs where outcomeStatus in [pending, off_track] and followUpDue <= now.
 * Called by the outcome checker cron job.
 */
export async function GET(request: NextRequest) {
  const authResult = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in authResult) return authResult.error;

  const now = new Date();

  const adviceLogs = await prisma.adviceLog.findMany({
    where: {
      outcomeStatus: { in: ['pending', 'off_track'] },
      followUpDue: { lte: now },
    },
    include: {
      user: {
        select: {
          id: true,
          suiAddress: true,
          preferences: { select: { allowanceId: true } },
        },
      },
      goal: {
        select: {
          id: true,
          name: true,
          emoji: true,
          targetAmount: true,
          deadline: true,
          status: true,
          deposits: { select: { amountUsdc: true } },
        },
      },
    },
    orderBy: { followUpDue: 'asc' },
    take: 100,
  });

  const result = adviceLogs.map((a) => ({
    id: a.id,
    userId: a.userId,
    sessionId: a.sessionId,
    adviceText: a.adviceText,
    adviceType: a.adviceType,
    targetAmount: a.targetAmount,
    goalId: a.goalId,
    actionTaken: a.actionTaken,
    followUpDue: a.followUpDue?.toISOString() ?? null,
    followUpSent: a.followUpSent,
    outcomeStatus: a.outcomeStatus,
    createdAt: a.createdAt.toISOString(),
    walletAddress: a.user.suiAddress,
    allowanceId: a.user.preferences?.allowanceId ?? null,
    goal: a.goal ? {
      id: a.goal.id,
      name: a.goal.name,
      emoji: a.goal.emoji,
      targetAmount: a.goal.targetAmount,
      deadline: a.goal.deadline?.toISOString() ?? null,
      status: a.goal.status,
      totalDeposited: a.goal.deposits.reduce((s, d) => s + d.amountUsdc, 0),
    } : null,
  }));

  return NextResponse.json({ adviceLogs: result });
}
