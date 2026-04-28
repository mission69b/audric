import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

/**
 * Validate the x-internal-key header against T2000_INTERNAL_KEY.
 * Used by internal API routes called by the t2000 ECS cron/indexer.
 *
 * `env.T2000_INTERNAL_KEY` is required by the env schema, so the
 * "not configured" branch can no longer fire at runtime — boot would
 * have failed first. Kept the invariant explicit because Next runs
 * code paths during build/type-check where the proxy could in theory
 * miss a key.
 */
export function validateInternalKey(
  headerValue: string | null,
): { valid: true } | { error: NextResponse } {
  const expected = env.T2000_INTERNAL_KEY;

  if (!headerValue || headerValue !== expected) {
    return {
      error: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 },
      ),
    };
  }

  return { valid: true };
}
