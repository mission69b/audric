import { NextRequest, NextResponse } from 'next/server';
import { validateInternalKey } from '@/lib/internal-auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/internal/autonomous-execution
 * Logs a ScheduledExecution record. Returns idempotency conflict if key exists.
 * Body: { scheduledActionId, idempotencyKey, amountUsd, status, txDigest?, skipReason? }
 */
export async function POST(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => null);
  if (!body?.scheduledActionId || !body?.idempotencyKey) {
    return NextResponse.json({ error: 'scheduledActionId and idempotencyKey required' }, { status: 400 });
  }

  const {
    scheduledActionId,
    idempotencyKey,
    amountUsd,
    status,
    txDigest,
    skipReason,
  } = body as {
    scheduledActionId: string;
    idempotencyKey: string;
    amountUsd: number;
    status: string;
    txDigest?: string;
    skipReason?: string;
  };

  const existing = await prisma.scheduledExecution.findUnique({
    where: { idempotencyKey },
  });

  if (existing) {
    if (existing.status === 'pending' && status && status !== 'pending') {
      const updated = await prisma.scheduledExecution.update({
        where: { idempotencyKey },
        data: {
          status,
          amountUsd: amountUsd ?? existing.amountUsd,
          txDigest: txDigest ?? existing.txDigest,
          skipReason: skipReason ?? existing.skipReason,
        },
      });
      return NextResponse.json({ execution: updated }, { status: 200 });
    }
    return NextResponse.json(
      { error: 'idempotency_conflict', existing: { id: existing.id, status: existing.status } },
      { status: 409 },
    );
  }

  const execution = await prisma.scheduledExecution.create({
    data: {
      scheduledActionId,
      idempotencyKey,
      amountUsd: amountUsd ?? 0,
      status: status ?? 'pending',
      txDigest: txDigest ?? null,
      skipReason: skipReason ?? null,
    },
  });

  return NextResponse.json({ execution }, { status: 201 });
}

/**
 * GET /api/internal/autonomous-execution?actionId=...&limit=10
 * Returns recent executions for a specific action (for circuit breaker checks).
 */
export async function GET(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  const actionId = request.nextUrl.searchParams.get('actionId');
  const limit = parseInt(request.nextUrl.searchParams.get('limit') ?? '10', 10);

  if (!actionId) {
    return NextResponse.json({ error: 'actionId required' }, { status: 400 });
  }

  const executions = await prisma.scheduledExecution.findMany({
    where: { scheduledActionId: actionId },
    orderBy: { executedAt: 'desc' },
    take: Math.min(limit, 50),
  });

  return NextResponse.json({ executions });
}
