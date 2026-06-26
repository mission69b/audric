/**
 * Bluefin (Sui-native perps DEX) public market-data fetcher — the read layer for
 * the perps "analyze a setup" skill (SPEC_AUDRIC_COMPUTER Phase 1, the read-only
 * moat probe). PUBLIC endpoint, no auth, no account access (sidesteps Bluefin's
 * US-geo API ToS, which gates trading/account — not public market data). All
 * values are E9-scaled on the wire (divide by 1e9). Read-only; no signing.
 *
 * Base verified 2026-06-26: api.sui-prod.bluefin.io (the older `dapi.` host is
 * dead — "no healthy upstream"). 8 markets: BTC/ETH/SOL/SUI/DEEP/WAL/HYPE/GOLD.
 */

const TICKERS_URL = "https://api.sui-prod.bluefin.io/v1/exchange/tickers";
const E9 = 1_000_000_000;
const FETCH_TIMEOUT_MS = 8000;

export type PerpMarket = {
  symbol: string; // e.g. "SUI-PERP"
  markPrice: number; // USD
  oraclePrice: number; // USD
  /** Funding as % per 8h interval (positive = longs pay shorts). */
  lastFundingRatePct: number;
  estFundingRatePct: number;
  nextFundingAt: string; // ISO
  openInterestUsd: number; // USD notional (per-market, the venue's reported OI)
  priceChange24hPct: number;
  high24h: number;
  low24h: number;
  quoteVolume24hUsd: number;
};

type RawTicker = Record<string, string | number>;

function n(v: string | number | undefined): number {
  return typeof v === "number" ? v : Number.parseFloat(String(v ?? "0"));
}

function shape(t: RawTicker): PerpMarket {
  const markPrice = n(t.markPriceE9) / E9;
  const open24h = n(t.openPrice24hrE9) / E9;
  return {
    symbol: String(t.symbol),
    markPrice,
    oraclePrice: n(t.oraclePriceE9) / E9,
    // E9 fraction → % : (x/1e9)*100 === x/1e7.
    lastFundingRatePct: n(t.lastFundingRateE9) / 1e7,
    estFundingRatePct: n(t.estimatedFundingRateE9) / 1e7,
    nextFundingAt: new Date(n(t.nextFundingTimeAtMillis)).toISOString(),
    openInterestUsd: n(t.openInterestE9) / E9,
    priceChange24hPct:
      open24h > 0 ? ((markPrice - open24h) / open24h) * 100 : 0,
    high24h: n(t.highPrice24hrE9) / E9,
    low24h: n(t.lowPrice24hrE9) / E9,
    quoteVolume24hUsd: n(t.quoteVolume24hrE9) / E9,
  };
}

async function fetchTickers(): Promise<RawTicker[]> {
  const res = await fetch(TICKERS_URL, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Bluefin tickers ${res.status}`);
  }
  return (await res.json()) as RawTicker[];
}

/** All Bluefin perp markets (shaped). */
export async function listBluefinPerps(): Promise<PerpMarket[]> {
  return (await fetchTickers()).map(shape);
}

/**
 * One perp market by loose query — "SUI", "sui-perp", "btc" → the matching
 * market. Returns null if Bluefin doesn't list it (only 8 majors are listed).
 */
export async function getBluefinPerp(
  query: string
): Promise<PerpMarket | null> {
  const want = query
    .trim()
    .toUpperCase()
    .replace(/[-_ ]?PERP$/, "");
  const tickers = await fetchTickers();
  const hit = tickers.find(
    (t) => String(t.symbol).toUpperCase().replace("-PERP", "") === want
  );
  return hit ? shape(hit) : null;
}
