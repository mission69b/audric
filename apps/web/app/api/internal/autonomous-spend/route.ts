import { NextRequest, NextResponse } from 'next/server';
import { validateInternalKey } from '@/lib/internal-auth';
import { isValidSuiAddress } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/internal/autonomous-spend?address=0x...
 * Returns total USD spent by autonomous actions today for this user.
 */
export async function GET(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  const address = request.nextUrl.searchParams.get('address');

  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { suiAddress: address },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ totalUsd: 0 });
    }

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const executions = await prisma.scheduledExecution.findMany({
      where: {
        scheduledAction: {
          userId: user.id,
          source: 'behavior_detected',
        },
        status: 'success',
        executedAt: { gte: startOfDay },
      },
      select: { amountUsd: true },
    });

    const totalUsd = executions.reduce((sum, e) => sum + e.amountUsd, 0);
    return NextResponse.json({ totalUsd });
  } catch (err) {
    console.error('[autonomous-spend] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch autonomous spend' }, { status: 502 });
  }
}
