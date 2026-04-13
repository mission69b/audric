import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateInternalKey } from '@/lib/internal-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/internal/scheduled-actions/due
 * Called by the t2000 ECS cron to fetch actions ready to execute.
 * Returns actions where nextRunAt <= now and enabled = true, along with user info.
 */
export async function GET(request: NextRequest) {
  const authResult = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in authResult) return authResult.error;

  const now = new Date();
  const window = request.nextUrl.searchParams.get('window');

  // window=24h returns actions in the next 24 hours (for reminders)
  // default returns past-due actions (for execution)
  const nextRunFilter = window === '24h'
    ? { gt: now, lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) }
    : { lte: now };

  const actions = await prisma.scheduledAction.findMany({
    where: {
      enabled: true,
      pausedAt: null,
      stage: { gte: 2 },
      nextRunAt: nextRunFilter,
    },
    include: {
      user: {
        select: {
          id: true,
          suiAddress: true,
          email: true,
          preferences: {
            select: { allowanceId: true },
          },
        },
      },
    },
    orderBy: { nextRunAt: 'asc' },
    take: 100,
  });

  const result = actions.map((a) => ({
    id: a.id,
    userId: a.userId,
    actionType: a.actionType,
    amount: a.amount,
    asset: a.asset,
    targetAsset: a.targetAsset,
    cronExpr: a.cronExpr,
    nextRunAt: a.nextRunAt.toISOString(),
    confirmationsRequired: a.confirmationsRequired,
    confirmationsCompleted: a.confirmationsCompleted,
    totalExecutions: a.totalExecutions,
    isAutonomous: a.confirmationsCompleted >= a.confirmationsRequired,
    walletAddress: a.user.suiAddress,
    email: a.user.email,
    allowanceId: a.user.preferences?.allowanceId ?? null,
    source: a.source,
    stage: a.stage,
    patternType: a.patternType,
    pausedAt: a.pausedAt?.toISOString() ?? null,
  }));

  return NextResponse.json({ actions: result });
}
