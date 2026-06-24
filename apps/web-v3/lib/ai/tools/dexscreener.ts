import { tool } from "ai";
import { z } from "zod";

/**
 * DexScreener tools — onchain/DEX token research + trending discovery, the
 * `crypto_research` skill's primary source (SPEC_AUDRIC_SKILLS_CATALOG).
 *
 * Keyless, multi-chain (Sui/Solana/Ethereum/Base/…), free. Covers what CoinGecko
 * (`crypto_market`) doesn't: any token by contract incl. the long tail / new /
 * memecoins, DEX liquidity + socials, and trending "metas" (narratives like
 * "AI coins"). Does NOT return holder distribution (no source does — deferred
 * `sui_holders`).
 */

const DEXSCREENER = "https://api.dexscreener.com";
const MAX_RESULTS = 6;

type Pair = {
  chainId?: string;
  dexId?: string;
  url?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: Record<string, number>;
  priceChange?: Record<string, number>;
  info?: { socials?: { platform?: string; handle?: string }[] };
};

function shapePair(p: Pair) {
  return {
    chain: p.chainId,
    dex: p.dexId,
    name: p.baseToken?.name,
    symbol: p.baseToken?.symbol,
    address: p.baseToken?.address,
    priceUsd: p.priceUsd ? Number(p.priceUsd) : undefined,
    liquidityUsd: p.liquidity?.usd,
    volume24hUsd: p.volume?.h24,
    change24hPct: p.priceChange?.h24,
    url: p.url,
    socials: p.info?.socials?.map((s) => `${s.platform}:${s.handle}`),
  };
}

/** Top pairs by liquidity, deduped to one row per token (highest-liquidity pair). */
function topByLiquidity(pairs: Pair[]): Pair[] {
  const byToken = new Map<string, Pair>();
  for (const p of pairs) {
    const key = `${p.chainId}:${p.baseToken?.address}`;
    const cur = byToken.get(key);
    if (!cur || (p.liquidity?.usd ?? 0) > (cur.liquidity?.usd ?? 0)) {
      byToken.set(key, p);
    }
  }
  return [...byToken.values()]
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))
    .slice(0, MAX_RESULTS);
}

export const dexscreenerToken = tool({
  description:
    "Research ANY crypto token by symbol, name, or contract address — across all chains (Sui, Solana, Ethereum, Base…). Returns live price, liquidity, 24h volume + change, the DEX, and socials, ranked by liquidity. Use for 'research <token>', 'info on <contract/0x…>', or any token that isn't a top listed coin (crypto_market covers the majors). For an exact token, pass the CONTRACT address (a symbol can match memecoins on other chains). Does NOT return holder counts.",
  inputSchema: z.object({
    query: z
      .string()
      .describe("Token symbol, name, or contract address (any chain)."),
  }),
  execute: async ({ query }) => {
    try {
      const res = await fetch(
        `${DEXSCREENER}/latest/dex/search?q=${encodeURIComponent(query)}`
      );
      if (!res.ok) {
        return { error: `Token lookup unavailable (${res.status}).` };
      }
      const data = (await res.json()) as { pairs?: Pair[] };
      const pairs = topByLiquidity(data.pairs ?? []);
      if (pairs.length === 0) {
        return { error: `No DEX token found for "${query}".` };
      }
      return { results: pairs.map(shapePair), source: "DexScreener" };
    } catch (e) {
      return { error: `Token lookup failed: ${(e as Error).message}` };
    }
  },
});

type Meta = {
  name?: string;
  slug?: string;
  description?: string;
  marketCap?: number;
  volume?: number;
  liquidity?: number;
  tokenCount?: number;
  marketCapChange?: { h24?: number };
};

export const dexscreenerTrending = tool({
  description:
    "Discover trending crypto narratives/'metas' (e.g. 'AI coins', memecoins) and the top tokens within one. Use for 'what are the top AI coins right now', 'what's hot/trending in crypto'. Omit `narrative` to LIST trending narratives (each has a slug + market cap/volume); then call again with a slug to get that narrative's top tokens.",
  inputSchema: z.object({
    narrative: z
      .string()
      .optional()
      .describe(
        "Optional narrative slug (e.g. 'ai') from a prior list call — returns that narrative's top tokens. Omit to list trending narratives."
      ),
  }),
  execute: async ({ narrative }) => {
    try {
      if (!narrative) {
        const res = await fetch(`${DEXSCREENER}/metas/trending/v1`);
        if (!res.ok) {
          return { error: `Trending unavailable (${res.status}).` };
        }
        const metas = (await res.json()) as Meta[];
        return {
          narratives: (metas ?? []).slice(0, 12).map((m) => ({
            name: m.name,
            slug: m.slug,
            description: m.description,
            marketCapUsd: m.marketCap,
            volume24hUsd: m.volume,
            change24hPct:
              typeof m.marketCapChange?.h24 === "number"
                ? m.marketCapChange.h24 * 100
                : undefined,
            tokenCount: m.tokenCount,
          })),
          source: "DexScreener",
          hint: "Call again with a slug to get that narrative's top tokens.",
        };
      }
      const res = await fetch(
        `${DEXSCREENER}/metas/meta/v1/${encodeURIComponent(narrative)}`
      );
      if (!res.ok) {
        return {
          error: `Narrative "${narrative}" unavailable (${res.status}).`,
        };
      }
      const meta = (await res.json()) as Meta & { pairs?: Pair[] };
      return {
        narrative: meta.name ?? narrative,
        marketCapUsd: meta.marketCap,
        volume24hUsd: meta.volume,
        tokenCount: meta.tokenCount,
        topTokens: topByLiquidity(meta.pairs ?? []).map(shapePair),
        source: "DexScreener",
      };
    } catch (e) {
      return { error: `Trending lookup failed: ${(e as Error).message}` };
    }
  },
});
