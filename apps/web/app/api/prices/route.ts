import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const DEFILLAMA_URL = 'https://coins.llama.fi/prices/current';

const CG_FALLBACK: Record<string, string> = {
  '0x0041f9f9344cac094454cd574e333c4fdb132d7bcc9379bcd4aab485b2a63942::wbtc::WBTC': 'coingecko:bitcoin',
  '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS': 'coingecko:cetus-protocol',
  '0x9d297676e7a4b771ab023291377b2adfaa4938fb9080b8d12430e4b108b836a9::xaum::XAUM': 'coingecko:tether-gold',
  '0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH': 'coingecko:ethereum',
  '0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX': 'coingecko:navi-protocol',
  '0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL': 'coingecko:walrus-2',
  '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP': 'coingecko:deepbook-protocol',
};

interface PriceCache {
  prices: Record<string, number>;
  expiresAt: number;
}

const CACHE_TTL = 30_000;
let cache: PriceCache | null = null;

const HEADERS = { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' };

/**
 * GET /api/prices?coins=0x2::sui::SUI,0x...::usdc::USDC,...
 *
 * Returns USD prices for Sui coin types via DefiLlama.
 * Falls back to CoinGecko IDs (still via DefiLlama) for tokens not indexed by Sui coin type.
 */
export async function GET(request: NextRequest) {
  try {
    const coinsParam = request.nextUrl.searchParams.get('coins');

    const coinTypes = coinsParam
      ? coinsParam.split(',').filter(Boolean)
      : [
          '0x2::sui::SUI',
          '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
          '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT',
        ];

    if (cache && cache.expiresAt > Date.now()) {
      const allHit = coinTypes.every((ct) => ct in cache!.prices);
      if (allHit) {
        return NextResponse.json({ prices: cache.prices, decimals: {} }, { headers: HEADERS });
      }
    }

    const llamaCoins = coinTypes.map((ct) => `sui:${ct}`).join(',');
    const res = await fetch(`${DEFILLAMA_URL}/${encodeURIComponent(llamaCoins)}`, {
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) throw new Error(`DefiLlama ${res.status}`);

    const json = (await res.json()) as {
      coins?: Record<string, { price: number; symbol?: string; decimals?: number }>;
    };

    const prices: Record<string, number> = { USDC: 1, USDT: 1 };
    const decimalsMap: Record<string, number> = {};

    if (json.coins) {
      for (const [key, val] of Object.entries(json.coins)) {
        const coinType = key.replace(/^sui:/, '');
        prices[coinType] = val.price;
        if (val.symbol) {
          prices[val.symbol] = val.price;
        }
        if ('decimals' in val && typeof val.decimals === 'number') {
          decimalsMap[coinType] = val.decimals;
        }
      }
    }

    const missing = coinTypes.filter((ct) => !(ct in prices) && ct in CG_FALLBACK);
    if (missing.length > 0) {
      const cgKeys = missing.map((ct) => CG_FALLBACK[ct]);
      const cgRes = await fetch(
        `${DEFILLAMA_URL}/${encodeURIComponent(cgKeys.join(','))}`,
        { signal: AbortSignal.timeout(5_000) },
      ).then((r) => r.json()).catch(() => ({ coins: {} })) as {
        coins?: Record<string, { price: number; symbol?: string }>;
      };

      if (cgRes.coins) {
        for (let i = 0; i < missing.length; i++) {
          const val = cgRes.coins[cgKeys[i]];
          if (val?.price) {
            prices[missing[i]] = val.price;
            if (val.symbol) prices[val.symbol] = val.price;
          }
        }
      }
    }

    cache = { prices, expiresAt: Date.now() + CACHE_TTL };

    return NextResponse.json({ prices, decimals: decimalsMap }, { headers: HEADERS });
  } catch (err) {
    console.error('[prices] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { prices: cache?.prices ?? { USDC: 1, USDT: 1 }, decimals: {} },
      { status: 200 },
    );
  }
}
