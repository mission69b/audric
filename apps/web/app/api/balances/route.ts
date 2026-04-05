import { NextRequest, NextResponse } from 'next/server';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { COIN_REGISTRY, USDC_TYPE } from '@t2000/sdk';

export const runtime = 'nodejs';

const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(SUI_NETWORK), network: SUI_NETWORK });

const USDC_DECIMALS = 6;
const MIST_PER_SUI = 1_000_000_000;

const TRADEABLE_COINS: Record<string, { type: string; decimals: number }> = {
  USDT: { type: COIN_REGISTRY.USDT.type, decimals: COIN_REGISTRY.USDT.decimals },
  BTC: { type: COIN_REGISTRY.wBTC.type, decimals: COIN_REGISTRY.wBTC.decimals },
  ETH: { type: COIN_REGISTRY.ETH.type, decimals: COIN_REGISTRY.ETH.decimals },
  GOLD: { type: COIN_REGISTRY.GOLD.type, decimals: COIN_REGISTRY.GOLD.decimals },
};

/**
 * GET /api/balances?address=0x...
 *
 * Returns raw token balances for SUI, USDC, and tradeable assets.
 * Used by the agent tool executor for get_balance / get_portfolio.
 */
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address');
  if (!address || !address.startsWith('0x')) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  try {
    const tradeableEntries = Object.entries(TRADEABLE_COINS);

    const [suiBal, usdcBal, ...tradeableBals] = await Promise.all([
      client.getBalance({ owner: address, coinType: '0x2::sui::SUI' }),
      client.getBalance({ owner: address, coinType: USDC_TYPE }).catch(() => ({ totalBalance: '0' })),
      ...tradeableEntries.map(([, info]) =>
        client.getBalance({ owner: address, coinType: info.type }).catch(() => ({ totalBalance: '0' })),
      ),
    ]);

    const sui = Number(suiBal.totalBalance) / MIST_PER_SUI;
    const usdc = Number(usdcBal.totalBalance) / (10 ** USDC_DECIMALS);

    const assets: Record<string, number> = {};
    tradeableEntries.forEach(([symbol, info], idx) => {
      assets[symbol] = Number(tradeableBals[idx].totalBalance) / 10 ** info.decimals;
    });

    return NextResponse.json({
      SUI: Math.round(sui * 1e4) / 1e4,
      USDC: Math.round(usdc * 100) / 100,
      ...Object.fromEntries(
        Object.entries(assets).map(([k, v]) => [k, Math.round(v * 1e8) / 1e8]),
      ),
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' },
    });
  } catch (err) {
    console.error('[balances] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Failed to fetch balances' }, { status: 500 });
  }
}
