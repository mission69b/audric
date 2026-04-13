import { NextRequest, NextResponse } from 'next/server';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/user/autonomous-executions?address=0x...&actionId=...
 * Returns recent executions for the trust dashboard.
 */
export async function GET(request: NextRequest) {
  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  const address = request.nextUrl.searchParams.get('address');
  const actionId = request.nextUrl.searchParams.get('actionId');

  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { suiAddress: address },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const where: Record<string, unknown> = {
    scheduledAction: {
      userId: user.id,
      source: 'behavior_detected',
    },
  };

  if (actionId) {
    where.scheduledActionId = actionId;
  }

  const executions = await prisma.scheduledExecution.findMany({
    where,
    orderBy: { executedAt: 'desc' },
    take: 20,
    select: {
      id: true,
      scheduledActionId: true,
      txDigest: true,
      amountUsd: true,
      status: true,
      skipReason: true,
      executedAt: true,
    },
  });

  // Daily autonomous spend
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const todayExecutions = await prisma.scheduledExecution.findMany({
    where: {
      scheduledAction: { userId: user.id, source: 'behavior_detected' },
      status: 'success',
      executedAt: { gte: startOfDay },
    },
    select: { amountUsd: true },
  });

  const dailySpend = todayExecutions.reduce((sum, e) => sum + e.amountUsd, 0);

  return NextResponse.json({ executions, dailySpend, dailyLimit: 200 });
}
