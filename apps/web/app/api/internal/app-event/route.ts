import { NextRequest, NextResponse } from 'next/server';
import type { InputJsonValue } from '@/lib/generated/prisma/internal/prismaNamespace';
import { prisma } from '@/lib/prisma';
import { validateInternalKey } from '@/lib/internal-auth';

export const runtime = 'nodejs';

/**
 * POST /api/internal/app-event
 * Body: { address, type, title, details?, digest? }
 * Creates an AppEvent record. Used by the ECS cron for event tracking.
 */
export async function POST(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  let body: { address?: string; type?: string; title?: string; details?: unknown; digest?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { address, type, title, details, digest } = body;
  if (!address || !type || !title) {
    return NextResponse.json({ error: 'Missing address, type, or title' }, { status: 400 });
  }

  const event = await prisma.appEvent.create({
    data: {
      address,
      type,
      title,
      details: details !== undefined ? (details as InputJsonValue) : undefined,
      digest: digest ?? undefined,
    },
  });

  return NextResponse.json({ id: event.id });
}
