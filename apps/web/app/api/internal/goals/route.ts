import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateInternalKey } from '@/lib/internal-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/internal/goals?address=0x...
 * Returns active savings goals for a wallet address.
 * Used by the t2000 ECS cron for briefing + milestone detection.
 */
export async function GET(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  const address = request.nextUrl.searchParams.get('address');
  if (!address) {
    return NextResponse.json({ error: 'Missing address' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { suiAddress: address },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ goals: [] });
  }

  const goals = await prisma.savingsGoal.findMany({
    where: { userId: user.id, status: 'active' },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      emoji: true,
      targetAmount: true,
      deadline: true,
      currentMilestone: true,
      status: true,
    },
  });

  return NextResponse.json({ goals });
}

/**
 * PATCH /api/internal/goals
 * Body: { goalId, currentMilestone?, status? }
 * Used by the cron to update milestone progress.
 */
export async function PATCH(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  let body: { goalId?: string; currentMilestone?: number; status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { goalId, currentMilestone, status } = body;
  if (!goalId) {
    return NextResponse.json({ error: 'Missing goalId' }, { status: 400 });
  }

  const goal = await prisma.savingsGoal.findUnique({ where: { id: goalId } });
  if (!goal) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (currentMilestone !== undefined) data.currentMilestone = currentMilestone;
  if (status !== undefined) data.status = status;

  await prisma.savingsGoal.update({
    where: { id: goalId },
    data,
  });

  return NextResponse.json({ ok: true });
}
