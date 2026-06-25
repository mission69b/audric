import { tool } from "ai";
import { z } from "zod";
import {
  gtOnchainTrending,
  gtSearch,
  resolveNetwork,
} from "@/lib/ai/crypto/geckoterminal";

/**
 * On-chain / DEX tools — GeckoTerminal (CoinGecko on-chain), the long-tail lane:
 * CHAIN-SCOPED trending/top/new pools + token research by symbol/name/contract,
 * across Sui, Solana, Ethereum, Base, BSC and more. Keyless. Pairs with CMC
 * (canonical listed coins via crypto_market/screener). Replaces DexScreener —
 * adds the chain-scoped trending that previously fell back to web search.
 */

export const onchainTrending = tool({
  description:
    "Discover what's moving ON A SPECIFIC CHAIN — trending, top-by-volume, or newly-launched tokens on Sui, Solana, Base, Ethereum, BSC, etc. Use for 'top/trending tokens on <chain>', 'new memecoins on <chain>', 'what's hot on Sui/Base/Solana'. REQUIRES a chain. For a chain-agnostic narrative ('top AI coins') use crypto_screener (category); for one specific token use token_research.",
  inputSchema: z.object({
    network: z
      .string()
      .describe(
        "The chain (e.g. 'sui', 'solana', 'base', 'ethereum', 'bsc', 'arbitrum', 'polygon', 'avalanche')."
      ),
    kind: z
      .enum(["trending", "top", "new"])
      .optional()
      .describe(
        "trending = momentum (default); top = highest 24h volume; new = recently-launched pools."
      ),
  }),
  execute: async ({ network, kind }) => {
    if (!resolveNetwork(network)) {
      return {
        error: `Chain "${network}" isn't supported for on-chain trending. Supported: Sui, Solana, Ethereum, Base, BSC, Arbitrum, Polygon, Avalanche, Optimism, Blast.`,
      };
    }
    const data = await gtOnchainTrending(network, kind ?? "trending");
    if (!data || data.results.length === 0) {
      return {
        error: `No on-chain ${kind ?? "trending"} data for ${network} right now.`,
      };
    }
    return { ...data, source: "GeckoTerminal" };
  },
});

export const tokenResearch = tool({
  description:
    "Research ANY crypto token by symbol, name, or contract address — across all chains (Sui, Solana, Ethereum, Base…). Returns live price, liquidity, 24h volume + change, the DEX, and the chain, ranked by liquidity. Use for 'research <token>', 'info on <contract/0x…>', or any token that isn't a top listed coin (crypto_market covers the majors). For an exact token pass the CONTRACT address (a bare symbol can match memecoins on other chains). Does NOT return holder counts.",
  inputSchema: z.object({
    query: z
      .string()
      .describe("Token symbol, name, or contract address (any chain)."),
    chain: z
      .string()
      .optional()
      .describe(
        "Chain to restrict to when the user names one (e.g. 'sui', 'solana', 'base'). Pass it whenever the user says 'on <chain>' — otherwise a low-liquidity token there can be outranked by same-symbol tokens elsewhere."
      ),
  }),
  execute: async ({ query, chain }) => {
    let note: string | undefined;
    if (chain && !resolveNetwork(chain)) {
      note = `Chain "${chain}" not recognized — searching all chains.`;
      chain = undefined;
    }
    const data = await gtSearch(query, chain);
    if (!data || data.results.length === 0) {
      return {
        error: `No DEX token found for "${query}"${chain ? ` on ${chain}` : ""}. For an exact token, pass its contract address.`,
      };
    }
    return { ...data, source: "GeckoTerminal", ...(note ? { note } : {}) };
  },
});
