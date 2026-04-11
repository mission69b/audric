import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateInternalKey } from '@/lib/internal-auth';

export const runtime = 'nodejs';

/**
 * POST /api/internal/follow-up-queue
 * Body: { userId, triggerType, adviceLogId?, outcomeCheckId?, message, ctaType?, ctaAmount?, priority?, deliveryMethod?, scheduledFor? }
 * Queues a follow-up message for delivery.
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

  const {
    userId, triggerType, adviceLogId, outcomeCheckId,
    message, ctaType, ctaAmount, priority, deliveryMethod, scheduledFor,
  } = body as {
    userId: string;
    triggerType: string;
    adviceLogId?: string;
    outcomeCheckId?: string;
    message: string;
    ctaType?: string;
    ctaAmount?: number;
    priority?: string;
    deliveryMethod?: string;
    scheduledFor?: string;
  };

  if (!userId || !triggerType || !message) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const entry = await prisma.followUpQueue.create({
    data: {
      userId,
      triggerType,
      adviceLogId: adviceLogId ?? null,
      outcomeCheckId: outcomeCheckId ?? null,
      message,
      ctaType: ctaType ?? null,
      ctaAmount: ctaAmount ?? null,
      priority: priority ?? 'normal',
      deliveryMethod: deliveryMethod ?? 'in_app',
      scheduledFor: scheduledFor ? new Date(scheduledFor) : new Date(),
    },
  });

  return NextResponse.json({ entry: { id: entry.id } }, { status: 201 });
}

/**
 * GET /api/internal/follow-up-queue?userId=&pending=true
 * Returns pending follow-ups ready for delivery.
 */
export async function GET(request: NextRequest) {
  const authResult = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in authResult) return authResult.error;

  const pending = request.nextUrl.searchParams.get('pending') === 'true';

  const where: Record<string, unknown> = {};
  if (pending) {
    where.sentAt = null;
    where.scheduledFor = { lte: new Date() };
  }

  const entries = await prisma.followUpQueue.findMany({
    where,
    orderBy: [{ priority: 'desc' }, { scheduledFor: 'asc' }],
    take: 50,
  });

  return NextResponse.json({ entries });
}
