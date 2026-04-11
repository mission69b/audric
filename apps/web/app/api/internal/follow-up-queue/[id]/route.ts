import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateInternalKey } from '@/lib/internal-auth';

export const runtime = 'nodejs';

/**
 * PATCH /api/internal/follow-up-queue/[id]
 * Body: { sentAt }
 * Marks a follow-up queue entry as sent.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in authResult) return authResult.error;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { sentAt } = body as { sentAt?: string };

  try {
    await prisma.followUpQueue.update({
      where: { id },
      data: { sentAt: sentAt ? new Date(sentAt) : new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Follow-up not found' }, { status: 404 });
  }
}
