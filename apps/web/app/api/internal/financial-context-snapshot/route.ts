import { NextRequest, NextResponse } from 'next/server';
import { validateInternalKey } from '@/lib/internal-auth';
import { runFinancialContextSnapshotJob } from '@/lib/jobs/financial-context-snapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/internal/financial-context-snapshot
 *
 * Legacy ECS cron entrypoint. Calls into the extracted
 * `runFinancialContextSnapshotJob()` helper in `lib/jobs/`. The new
 * Vercel cron path (`/api/cron/financial-context-snapshot`,
 * CRON_SECRET auth) shares the same helper. Both paths exist during
 * the Block B dual-write window; this route retires alongside
 * AUDRIC_INTERNAL_KEY in Block C.
 *
 * Headers: `x-internal-key` validated against `T2000_INTERNAL_KEY`.
 *
 * Query params: `?shard=i&total=N` — see `lib/jobs/...` for the
 * sharding contract (each address is deterministically assigned to
 * one shard so the union of all shards covers every address exactly
 * once).
 */
export async function POST(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const shard = Number.parseInt(searchParams.get('shard') ?? '0', 10) || 0;
  const total = Number.parseInt(searchParams.get('total') ?? '1', 10) || 1;

  const result = await runFinancialContextSnapshotJob({ shard, total });
  return NextResponse.json(result);
}
