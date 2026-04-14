import { NextRequest, NextResponse } from 'next/server';
import { isValidSuiAddress } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { fetchPortfolio, type PortfolioSnapshot } from '@/lib/portfolio-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface WalletPortfolio extends PortfolioSnapshot {
  netWorth: number;
  address: string;
  label: string | null;
  isPrimary: boolean;
}

/**
 * GET /api/analytics/portfolio-multi
 * Header: x-sui-address (primary wallet for auth)
 *
 * Returns portfolio data for all linked wallets + the primary wallet.
 */
export async function GET(request: NextRequest) {
  const address = request.headers.get('x-sui-address');
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { suiAddress: address },
    select: {
      id: true,
      suiAddress: true,
      linkedWallets: {
        select: { suiAddress: true, label: true, isPrimary: true },
        orderBy: { addedAt: 'asc' },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const wallets: { address: string; label: string | null; isPrimary: boolean }[] = [
    { address: user.suiAddress, label: 'Primary', isPrimary: true },
    ...user.linkedWallets
      .filter((w) => w.suiAddress !== user.suiAddress)
      .map((w) => ({ address: w.suiAddress, label: w.label, isPrimary: w.isPrimary })),
  ];

  const results = await Promise.allSettled(
    wallets.map(async (w): Promise<WalletPortfolio> => {
      const portfolio = await fetchPortfolio(w.address);
      return { ...portfolio, netWorth: portfolio.netWorthUsd, address: w.address, label: w.label, isPrimary: w.isPrimary };
    }),
  );

  const portfolios: WalletPortfolio[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') portfolios.push(r.value);
  }

  const aggregated = {
    netWorthUsd: portfolios.reduce((s, p) => s + p.netWorthUsd, 0),
    walletUsd: portfolios.reduce((s, p) => s + p.wallet.totalUsd, 0),
    savingsUsd: portfolios.reduce((s, p) => s + p.positions.savings, 0),
    debtUsd: portfolios.reduce((s, p) => s + p.positions.borrows, 0),
    estimatedDailyYield: portfolios.reduce((s, p) => s + p.estimatedDailyYield, 0),
  };

  return NextResponse.json({ aggregated, wallets: portfolios });
}
