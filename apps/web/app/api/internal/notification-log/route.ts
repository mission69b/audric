import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateInternalKey } from '@/lib/internal-auth';

export const runtime = 'nodejs';

interface JobResult {
  job: string;
  processed: number;
  sent: number;
  errors: number;
}

/**
 * POST /api/internal/notification-log
 * Called by the t2000 ECS cron after processing notifications.
 * Stores batch-level results for audit trail.
 */
export async function POST(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  let body: { results: JobResult[]; reportedAt: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!Array.isArray(body.results)) {
    return NextResponse.json({ error: 'results must be an array' }, { status: 400 });
  }

  const reportedAt = new Date(body.reportedAt ?? Date.now());

  await prisma.notificationLog.createMany({
    data: body.results
      .filter((r) => r.sent > 0 || r.errors > 0)
      .map((r) => ({
        job: r.job,
        processed: r.processed,
        sent: r.sent,
        errors: r.errors,
        reportedAt,
      })),
  });

  return NextResponse.json({ ok: true });
}
