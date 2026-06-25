/**
 * Canonical GeckoTerminal (CoinGecko on-chain) fetcher — the on-chain/DEX lane:
 * CHAIN-SCOPED trending / top / new pools + token search & research, across Sui,
 * Solana, Ethereum, Base, BSC and more. Keyless (rate-limited ~30/min); we make
 * ≤1 call per query + retry once on 429, then degrade gracefully. Pairs with CMC
 * (canonical listed coins). Replaces DexScreener — adds chain-scoped trending
 * (the gap that forced web-search fallbacks) and is CoinGecko-backed.
 */

const GT = "https://api.geckoterminal.com/api/v2";

// User-facing chain name → GeckoTerminal network slug.
const NETWORKS: Record<string, string> = {
  sui: "sui-network",
  solana: "solana",
  sol: "solana",
  ethereum: "eth",
  eth: "eth",
  base: "base",
  bsc: "bsc",
  bnb: "bsc",
  arbitrum: "arbitrum",
  arb: "arbitrum",
  polygon: "polygon_pos",
  avalanche: "avax",
  avax: "avax",
  blast: "blast",
  optimism: "optimism",
};

export function resolveNetwork(name?: string): string | undefined {
  if (!name) {
    return;
  }
  return NETWORKS[name.trim().toLowerCase().replace(/\s+/g, "")];
}

// Known slugs, longest-first — so "polygon_pos" matches before any "polygon_*".
const KNOWN_SLUGS = [...new Set(Object.values(NETWORKS))].sort(
  (a, b) => b.length - a.length
);

/** Derive the network slug from a "<slug>_<address>" base_token id. */
function slugFromTokenId(id: string): string | undefined {
  return KNOWN_SLUGS.find((s) => id.startsWith(`${s}_`));
}

async function gtFetch(path: string, retry = true): Promise<unknown | null> {
  try {
    const res = await fetch(`${GT}${path}`, {
      headers: { Accept: "application/json" },
    });
    if (res.status === 429 && retry) {
      await new Promise((r) => setTimeout(r, 1500));
      return gtFetch(path, false);
    }
    if (!res.ok) {
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}

type GtPool = {
  attributes?: {
    name?: string;
    address?: string;
    base_token_price_usd?: string;
    volume_usd?: { h24?: string };
    price_change_percentage?: { h24?: string };
    reserve_in_usd?: string;
  };
  relationships?: {
    base_token?: { data?: { id?: string } };
    network?: { data?: { id?: string } };
    dex?: { data?: { id?: string } };
  };
};

export type OnchainRow = {
  pair?: string;
  symbol?: string;
  priceUsd?: number;
  change24hPct?: number;
  volume24hUsd?: number;
  liquidityUsd?: number;
  dex?: string;
  chain?: string;
  tokenAddress?: string;
  poolAddress?: string;
};

const numOrUndef = (v?: string) =>
  v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined;

function shapePool(p: GtPool, networkHint?: string): OnchainRow {
  const a = p.attributes ?? {};
  const baseId = p.relationships?.base_token?.data?.id ?? "";
  // Prefer the slug embedded in the token id (robust for cross-chain search);
  // fall back to the caller's hint. Slug-aware strip (some slugs hold "_").
  const slug = slugFromTokenId(baseId) ?? networkHint ?? "";
  const tokenAddress =
    slug && baseId.startsWith(`${slug}_`)
      ? baseId.slice(slug.length + 1)
      : baseId;
  const name = a.name ?? "";
  // Sanitize launch-artifact %s (a freshly-listed pool can read +99544%).
  const rawChange = numOrUndef(a.price_change_percentage?.h24);
  const change24hPct =
    rawChange != null && Math.abs(rawChange) > 5000 ? undefined : rawChange;
  return {
    pair: name,
    symbol: name.split("/")[0]?.trim(),
    priceUsd: numOrUndef(a.base_token_price_usd),
    change24hPct,
    volume24hUsd: numOrUndef(a.volume_usd?.h24),
    liquidityUsd: numOrUndef(a.reserve_in_usd),
    dex: p.relationships?.dex?.data?.id,
    chain: slug || undefined,
    tokenAddress,
    poolAddress: a.address,
  };
}

/** One row per token (keep the highest-liquidity pool). */
function dedupeByToken(rows: OnchainRow[]): OnchainRow[] {
  const byToken = new Map<string, OnchainRow>();
  for (const r of rows) {
    const key = r.tokenAddress || r.pair || "";
    const cur = byToken.get(key);
    if (!cur || (r.liquidityUsd ?? 0) > (cur.liquidityUsd ?? 0)) {
      byToken.set(key, r);
    }
  }
  return [...byToken.values()];
}

export type OnchainKind = "trending" | "top" | "new";

/** Chain-scoped discovery: trending / top-by-volume / newly-launched pools. */
export async function gtOnchainTrending(
  network: string,
  kind: OnchainKind = "trending",
  limit = 10
): Promise<{ chain: string; kind: OnchainKind; results: OnchainRow[] } | null> {
  const slug = resolveNetwork(network);
  if (!slug) {
    return null;
  }
  const path =
    kind === "top"
      ? `/networks/${slug}/pools?page=1&sort=h24_volume_usd_desc`
      : kind === "new"
        ? `/networks/${slug}/new_pools?page=1`
        : `/networks/${slug}/trending_pools?page=1`;
  const json = (await gtFetch(path)) as { data?: GtPool[] } | null;
  const pools = json?.data ?? [];
  if (pools.length === 0) {
    return null;
  }
  let rows = dedupeByToken(pools.map((p) => shapePool(p, slug)));
  // 'new' pools are full of near-dead dust — require real liquidity + volume.
  if (kind === "new") {
    rows = rows.filter(
      (r) => (r.liquidityUsd ?? 0) >= 1000 && (r.volume24hUsd ?? 0) >= 100
    );
  }
  return {
    chain: network,
    kind,
    results: rows.slice(0, Math.min(Math.max(Math.round(limit), 1), 25)),
  };
}

/** Search any token by name / symbol / contract (optionally on one chain). */
export async function gtSearch(
  query: string,
  network?: string,
  limit = 6
): Promise<{ results: OnchainRow[] } | null> {
  const slug = resolveNetwork(network);
  const q = encodeURIComponent(query.trim());
  const path = slug
    ? `/search/pools?query=${q}&network=${slug}`
    : `/search/pools?query=${q}`;
  const json = (await gtFetch(path)) as { data?: GtPool[] } | null;
  const pools = json?.data ?? [];
  if (pools.length === 0) {
    return null;
  }
  const rows = pools.map((p) => shapePool(p, slug));
  return {
    results: dedupeByToken(rows)
      .sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))
      .slice(0, Math.min(Math.max(Math.round(limit), 1), 12)),
  };
}

export type GtHistory = {
  symbol?: string;
  days: number;
  pool?: string;
  chain?: string;
  dex?: string;
  series: {
    date: string;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    volumeUsd?: number;
  }[];
  summary: {
    startUsd?: number;
    endUsd?: number;
    highUsd?: number;
    lowUsd?: number;
    changePct?: number;
  };
  source: "GeckoTerminal";
};

/**
 * Daily OHLCV for a DEX pool (the base token's USD candles), last `days`.
 * `networkSlug` is the resolved GT slug (e.g. "sui-network") + `pool` the pool
 * address — both come straight off a `gtSearch` row. Closes the DEX-only-token
 * price-history gap that CMC (listed coins only) can't cover.
 */
export async function gtOhlcv(
  networkSlug: string,
  pool: string,
  days = 30
): Promise<GtHistory | null> {
  const limit = Math.min(Math.max(Math.round(days), 1), 365);
  const json = (await gtFetch(
    `/networks/${networkSlug}/pools/${pool}/ohlcv/day?limit=${limit}&currency=usd&token=base`
  )) as { data?: { attributes?: { ohlcv_list?: number[][] } } } | null;
  const list = json?.data?.attributes?.ohlcv_list;
  if (!list?.length) {
    return null;
  }
  // GT returns newest-first — reverse to chronological (oldest → newest).
  const series = [...list].reverse().map((r) => ({
    date: new Date((r[0] ?? 0) * 1000).toISOString().slice(0, 10),
    open: r[1],
    high: r[2],
    low: r[3],
    close: r[4],
    volumeUsd: r[5],
  }));
  const num = (xs: (number | undefined)[]) =>
    xs.filter((n): n is number => typeof n === "number");
  const closes = num(series.map((s) => s.close));
  const highs = num(series.map((s) => s.high));
  const lows = num(series.map((s) => s.low));
  const startUsd = closes[0];
  const endUsd = closes.at(-1);
  return {
    days: limit,
    series,
    summary: {
      startUsd,
      endUsd,
      highUsd: highs.length ? Math.max(...highs) : undefined,
      lowUsd: lows.length ? Math.min(...lows) : undefined,
      changePct:
        startUsd && endUsd ? ((endUsd - startUsd) / startUsd) * 100 : undefined,
    },
    source: "GeckoTerminal",
  };
}
