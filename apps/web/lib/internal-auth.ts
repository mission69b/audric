import { NextResponse } from 'next/server';

/**
 * Validate the x-internal-key header against T2000_INTERNAL_KEY.
 * Used by internal API routes called by the t2000 ECS cron/indexer.
 */
export function validateInternalKey(
  headerValue: string | null,
): { valid: true } | { error: NextResponse } {
  const expected = process.env.T2000_INTERNAL_KEY;

  if (!expected) {
    console.error('[internal-auth] T2000_INTERNAL_KEY not configured');
    return {
      error: NextResponse.json(
        { error: 'Internal API not configured' },
        { status: 503 },
      ),
    };
  }

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
