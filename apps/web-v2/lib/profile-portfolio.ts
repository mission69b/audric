/**
 * profile-portfolio.ts — server-only adapter for the Audric Store public
 * profile page.
 *
 * ## v0.7c Session 4.6 rewrite (Path A structural fix)
 *
 * Pre-Session 4.5 this module HTTP-hopped to apps/web's `/api/portfolio`
 * with the shared `T2000_INTERNAL_KEY` header (the canonical fetcher
 * `getPortfolio()` lived in apps/web at the time). Session 4.5 migrated
 * the canonical `/api/portfolio` endpoint AND `getPortfolio()` into
 * web-v2 — which made this HTTP hop dead architecture (a fetch from
 * web-v2 to web-v2's own audric-web-v2.vercel.app domain, paying
 * 200-500ms RTT + cross-origin overhead just to call its own function).
 *
 * Session 4.6 rewrite: direct call to the local `getPortfolio()`.
 * Removes the HTTP hop, the `audricWebUrl` dependency, the
 * `T2000_INTERNAL_KEY` auth round-trip, and the JSON parse pass.
 *
 * The `ProfilePortfolio` shape (consumed by `PortfolioCardV2` on the
 * `/[username]` page) is preserved verbatim — this is a structural
 * refactor only, no behavior change visible to the caller.
 *
 * ## Failure mode
 *
 * Profile pages are recipient-facing. A 5xx because BlockVision had a
 * hiccup would be an unacceptable cliff. Every failure path degrades
 * silently to `null`; the page renders without the portfolio panel.
 * The canonical `getPortfolio()` has its own internal try/catch +
 * sticky-positive cache, so the only path that reaches us here is a
 * hard exception — log + return null.
 */

import { getPortfolio } from "@/lib/portfolio";

interface PortfolioCoin {
  balance: string;
  decimals: number;
  price?: number;
  symbol: string;
  usdValue?: number;
}

interface PositionSummary {
  borrows: number;
  healthFactor: number | null;
  savings: number;
  savingsRate: number;
}

export interface ProfilePortfolio {
  address: string;
  defiSource: "blockvision" | "partial" | "partial-stale" | "degraded";
  defiValueUsd: number;
  netWorthUsd: number;
  positions: PositionSummary;
  wallet: PortfolioCoin[];
}

export async function fetchProfilePortfolio(
  address: string
): Promise<ProfilePortfolio | null> {
  try {
    const portfolio = await getPortfolio(address);
    return {
      address: portfolio.address,
      defiSource: portfolio.defiSource,
      defiValueUsd: portfolio.defiValueUsd,
      netWorthUsd: portfolio.netWorthUsd,
      positions: {
        borrows: portfolio.positions.borrows,
        healthFactor: portfolio.positions.healthFactor,
        savings: portfolio.positions.savings,
        savingsRate: portfolio.positions.savingsRate,
      },
      // Engine's `PortfolioCoin` uses `null` for missing price / usdValue;
      // the legacy consumer (`PortfolioCardV2`) checks `!== undefined`, so
      // we normalize null → undefined here to preserve that contract.
      wallet: portfolio.wallet.map((coin) => ({
        balance: coin.balance,
        decimals: coin.decimals,
        symbol: coin.symbol,
        price: coin.price ?? undefined,
        usdValue: coin.usdValue ?? undefined,
      })),
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown";
    console.warn(
      `[profile-portfolio] getPortfolio failed for ${address.slice(0, 10)}…: ${detail}`
    );
    return null;
  }
}
