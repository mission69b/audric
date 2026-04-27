import { NextRequest, NextResponse } from 'next/server';
import { validateInternalKey } from '@/lib/internal-auth';
import { isValidSuiAddress } from '@/lib/auth';
import { getPortfolio } from '@/lib/portfolio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/internal/health-factor?address=0x...
 *
 * Internal endpoint: returns the user's current NAVI health factor.
 * Thin adapter around `getPortfolio()` — pulls the canonical positions
 * slice and surfaces the `healthFactor` field only.
 */
export async function GET(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  const address = request.nextUrl.searchParams.get('address');

  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  try {
    const { positions } = await getPortfolio(address);
    return NextResponse.json({ healthFactor: positions.healthFactor ?? null });
  } catch (err) {
    console.error('[health-factor] Error:', err);
    return NextResponse.json({ healthFactor: null });
  }
}
