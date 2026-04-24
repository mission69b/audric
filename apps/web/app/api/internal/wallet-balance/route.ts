import { NextRequest, NextResponse } from 'next/server';
import { validateInternalKey } from '@/lib/internal-auth';
import { isValidSuiAddress } from '@/lib/auth';
import { fetchWalletCoins, fetchTokenPrices } from '@t2000/engine';
import { getSuiRpcUrl } from '@/lib/sui-rpc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUI_RPC_URL = getSuiRpcUrl();

/**
 * GET /api/internal/wallet-balance?address=0x...&asset=USDC
 * Returns the USD-denominated balance of a specific asset in the wallet.
 */
export async function GET(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  const address = request.nextUrl.searchParams.get('address');
  const asset = request.nextUrl.searchParams.get('asset') ?? 'USDC';

  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  try {
    const coins = await fetchWalletCoins(address, SUI_RPC_URL);
    const match = coins.find((c) => c.symbol.toUpperCase() === asset.toUpperCase());
    if (!match) {
      return NextResponse.json({ balance: 0 });
    }

    const amount = Number(match.totalBalance) / 10 ** match.decimals;

    if (asset.toUpperCase() === 'USDC' || asset.toUpperCase() === 'USDT') {
      return NextResponse.json({ balance: amount });
    }

    const prices = await fetchTokenPrices([match.coinType]);
    const price = prices[match.coinType] ?? 0;

    return NextResponse.json({ balance: amount * price });
  } catch (err) {
    console.error('[wallet-balance] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch balance' }, { status: 502 });
  }
}
