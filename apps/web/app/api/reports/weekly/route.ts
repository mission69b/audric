import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * GET /api/reports/weekly
 *
 * Returns income breakdown for the current week:
 *   paymentsReceived — sum of paid Payment amounts
 *   yieldEarned — from PortfolioSnapshot yieldEarnedUsd
 *   totalIncome — sum of above
 *
 * Auth: x-zklogin-jwt + x-sui-address (same as /api/payments)
 */
export async function GET(request: NextRequest) {
  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  const address = request.headers.get('x-sui-address');
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Missing or invalid address' }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { suiAddress: address },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const weekAgo = new Date(Date.now() - 7 * 86_400_000);

    const [paidPayments, snapshots] = await Promise.all([
      prisma.payment.findMany({
        where: {
          userId: user.id,
          status: 'paid',
          paidAt: { gte: weekAgo },
        },
        select: { amount: true },
      }),
      prisma.portfolioSnapshot.findMany({
        where: {
          userId: user.id,
          date: { gte: weekAgo },
        },
        select: { yieldEarnedUsd: true },
      }),
    ]);

    const paymentsReceived = paidPayments.reduce((sum, p) => sum + (p.amount ?? 0), 0);
    const yieldEarned = snapshots.reduce((sum, s) => sum + (s.yieldEarnedUsd ?? 0), 0);
    const totalIncome = paymentsReceived + yieldEarned;

    return NextResponse.json({
      paymentsReceived: Math.floor(paymentsReceived * 100) / 100,
      yieldEarned: Math.floor(yieldEarned * 100) / 100,
      totalIncome: Math.floor(totalIncome * 100) / 100,
    });
  } catch (err) {
    console.error('[reports/weekly] Error:', err);
    return NextResponse.json({
      paymentsReceived: 0,
      yieldEarned: 0,
      totalIncome: 0,
    });
  }
}
