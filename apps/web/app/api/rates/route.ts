import { NextResponse } from 'next/server';
import { getRates } from '@/lib/rates';

export const runtime = 'nodejs';

/**
 * GET /api/rates
 *
 * Returns current USDC lending rates (save/borrow APY) per protocol.
 * Thin adapter around `getRates()` — returns the legacy wire shape
 * (only USDC rates surface here for backwards-compat).
 */
export async function GET() {
  try {
    const summary = await getRates();
    return NextResponse.json({
      rates: summary.usdcRates,
      bestSaveRate: summary.bestSaveRate,
    });
  } catch {
    return NextResponse.json({ rates: [], bestSaveRate: null });
  }
}
