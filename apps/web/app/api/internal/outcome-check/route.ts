import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateInternalKey } from '@/lib/internal-auth';

export const runtime = 'nodejs';

/**
 * POST /api/internal/outcome-check
 * Body: { adviceLogId, checkType, expectedValue?, actualValue?, deltaUsdc?, onTrack?, outcomeStatus, followUpSent? }
 * Creates an OutcomeCheck and updates the AdviceLog status.
 */
export async function POST(request: NextRequest) {
  const authResult = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in authResult) return authResult.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { adviceLogId, checkType, expectedValue, actualValue, deltaUsdc, onTrack, outcomeStatus, followUpSent } = body as {
    adviceLogId: string;
    checkType: string;
    expectedValue?: number;
    actualValue?: number;
    deltaUsdc?: number;
    onTrack?: boolean;
    outcomeStatus: string;
    followUpSent?: boolean;
  };

  if (!adviceLogId || !checkType || !outcomeStatus) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const advice = await prisma.adviceLog.findUnique({
    where: { id: adviceLogId },
    select: { userId: true },
  });

  if (!advice) {
    return NextResponse.json({ error: 'AdviceLog not found' }, { status: 404 });
  }

  const [check] = await prisma.$transaction([
    prisma.outcomeCheck.create({
      data: {
        userId: advice.userId,
        adviceLogId,
        checkType,
        expectedValue: expectedValue ?? null,
        actualValue: actualValue ?? null,
        deltaUsdc: deltaUsdc ?? null,
        onTrack: onTrack ?? null,
        suiQueryAt: new Date(),
      },
    }),
    prisma.adviceLog.update({
      where: { id: adviceLogId },
      data: {
        outcomeStatus,
        ...(followUpSent !== undefined ? { followUpSent } : {}),
      },
    }),
  ]);

  return NextResponse.json({ check: { id: check.id } }, { status: 201 });
}
