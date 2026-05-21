import { NextRequest, NextResponse } from 'next/server';
import { validateInternalKey } from '@/lib/internal-auth';
import { runPortfolioSnapshotJob } from '@/lib/jobs/portfolio-snapshot';

export const runtime = 'nodejs';

/**
 * POST /api/internal/portfolio-snapshot
 *
 * Legacy ECS cron entrypoint. Calls into the extracted
 * `runPortfolioSnapshotJob()` helper in `lib/jobs/`. The new
 * Vercel cron path (`/api/cron/portfolio-snapshot`, CRON_SECRET
 * auth) shares the same helper. Both paths exist during the
 * Block B dual-write window; this route retires alongside
 * AUDRIC_INTERNAL_KEY in Block C.
 *
 * Headers: x-internal-key
 *
 * Behavior: see `lib/jobs/portfolio-snapshot.ts` for the full
 * job contract (idempotency, error handling, BACKFIX notes).
 */
export async function POST(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  const result = await runPortfolioSnapshotJob();
  return NextResponse.json(result);
}
