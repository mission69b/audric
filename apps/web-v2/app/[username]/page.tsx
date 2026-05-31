import { SuinsRpcError } from "@t2000/engine";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PortfolioCardV2 } from "@/components/audric/cards/PortfolioCardV2";
import { ProfilePublicCard } from "@/components/profile/profile-public-card";
import { isReserved } from "@/lib/identity/reserved-usernames";
import { validateAudricLabel } from "@/lib/identity/validate-label";
import {
  fetchProfilePortfolio,
  type ProfilePortfolio,
} from "@/lib/profile-portfolio";
import { getSuiRpcUrl } from "@/lib/sui-rpc";
import { resolveSuinsCached } from "@/lib/suins-cache";

/**
 * Audric Store — public profile page at `audric.ai/[username]`.
 *
 * Ported from `audric/apps/web/app/[username]/page.tsx` (Phase 6 Session 3,
 * v0.7c). The rebuild keeps every shipped behavior + UX from apps/web:
 *
 *   - Server-side SuiNS lookup of `<username>.audric.sui` via `@t2000/engine`
 *     + per-process cache (5min positive / 10s negative TTL).
 *   - 404 on invalid / reserved / unresolved labels.
 *   - Profile card with Audric mark + 🪪 + display handle + QR + send +
 *     copy-address.
 *   - Public portfolio panel via cross-app fetch (Option F lock —
 *     server-side `x-internal-key` call to apps/web's `/api/portfolio`).
 *     Hidden for empty wallets (netWorth < $0.01).
 *   - Store empty-state ("alice hasn't set up their store yet").
 *   - Per-username OG card via the sibling `opengraph-image.tsx`.
 *
 * Privacy note: the portfolio panel surfaces data that is ALREADY public
 * on Sui (every Sui address is queryable via SuiVision / Sui RPC). Showing
 * it here makes existing public data more discoverable, not new info.
 *
 * Theming: this page follows the visitor's OS theme. Profile pages are
 * recipient-facing — visitors may not be Audric users but they did set
 * their OS theme; flashing them the wrong canvas is a bad first impression.
 *
 * Route-collision protection: `app/[username]` matches every root path not
 * already claimed by a static folder (`/settings`, `/auth`, `/audric-chat`,
 * etc.). Next.js prioritizes static segments, so the static routes keep
 * working — but to prevent username squatting on those segments, the
 * reserved-list (`lib/identity/reserved-usernames.ts`) covers every
 * top-level static segment.
 */

const AUDRIC_PARENT_NAME = "audric.sui";
const DUST_USD = 0.5;
const STABLECOINS = new Set(["USDC", "USDsui", "USDT", "USDe", "AUSD"]);
const MAX_ALLOCATIONS = 10;

interface UsernamePageProps {
  params: Promise<{ username: string }>;
}

interface ResolvedHandle {
  address: string;
  /** Display form `<label>@audric` for user-facing surfaces. */
  displayHandle: string;
  /** On-chain SuiNS NFT name — `<label>.audric.sui`. */
  handle: string;
  label: string;
}

async function resolveHandle(
  rawUsername: string
): Promise<ResolvedHandle | null> {
  const validation = validateAudricLabel(rawUsername);
  if (!validation.valid) {
    return null;
  }
  const label = validation.label;
  if (isReserved(label)) {
    return null;
  }

  const handle = `${label}.${AUDRIC_PARENT_NAME}`;
  const displayHandle = `${label}@${AUDRIC_PARENT_NAME.replace(/\.sui$/, "")}`;
  try {
    const address = await resolveSuinsCached(handle, {
      suiRpcUrl: getSuiRpcUrl(),
    });
    if (!address) {
      return null;
    }
    return { label, handle, displayHandle, address };
  } catch (err) {
    let detail: string;
    if (err instanceof SuinsRpcError) {
      detail = err.message;
    } else if (err instanceof Error) {
      detail = err.message;
    } else {
      detail = "unknown";
    }
    console.warn(`[/${rawUsername}] SuiNS lookup failed: ${detail}`);
    return null;
  }
}

interface PortfolioCardData {
  address?: string;
  allocations: {
    symbol: string;
    amount: number;
    usdValue: number;
    percentage: number;
  }[];
  dailyEarning?: number;
  debtValue: number;
  defiSource?: ProfilePortfolio["defiSource"];
  defiValue?: number;
  healthFactor: number | null;
  insights: { type: string; message: string }[];
  isSelfQuery?: boolean;
  savingsApy?: number;
  savingsValue: number;
  stablePercentage: number;
  suinsName?: string | null;
  totalValue: number;
  walletValue: number;
}

function buildPortfolioCardData(
  portfolio: ProfilePortfolio,
  handle: string
): PortfolioCardData | null {
  if (portfolio.netWorthUsd < 0.01 && portfolio.wallet.length === 0) {
    return null;
  }

  const allocations: PortfolioCardData["allocations"] = [];
  let walletValue = 0;
  for (const coin of portfolio.wallet) {
    const amount = Number(coin.balance) / 10 ** coin.decimals;
    if (!Number.isFinite(amount) || amount <= 0) {
      continue;
    }
    let usdValue: number;
    if (coin.usdValue !== undefined) {
      usdValue = coin.usdValue;
    } else if (coin.price === undefined) {
      usdValue = 0;
    } else {
      usdValue = amount * coin.price;
    }
    walletValue += usdValue;
    if (usdValue >= DUST_USD) {
      allocations.push({
        symbol: coin.symbol,
        amount,
        usdValue,
        percentage: 0,
      });
    }
  }

  if (portfolio.defiValueUsd >= DUST_USD) {
    allocations.push({
      symbol: "DeFi (aggregate)",
      amount: 0,
      usdValue: portfolio.defiValueUsd,
      percentage: 0,
    });
  }

  const totalValue =
    walletValue + portfolio.positions.savings + portfolio.defiValueUsd;
  for (const a of allocations) {
    a.percentage = totalValue > 0 ? (a.usdValue / totalValue) * 100 : 0;
  }
  allocations.sort((a, b) => b.usdValue - a.usdValue);

  const stableValue =
    allocations
      .filter((a) => STABLECOINS.has(a.symbol))
      .reduce((s, a) => s + a.usdValue, 0) + portfolio.positions.savings;
  const stablePercentage =
    totalValue > 0 ? (stableValue / totalValue) * 100 : 0;

  const savingsApy =
    portfolio.positions.savingsRate > 0
      ? portfolio.positions.savingsRate
      : undefined;
  const dailyEarning =
    savingsApy && portfolio.positions.savings > 0
      ? (portfolio.positions.savings * savingsApy) / 365
      : undefined;

  return {
    totalValue: portfolio.netWorthUsd,
    walletValue,
    savingsValue: portfolio.positions.savings,
    defiValue: portfolio.defiValueUsd > 0 ? portfolio.defiValueUsd : undefined,
    defiSource: portfolio.defiValueUsd > 0 ? portfolio.defiSource : undefined,
    debtValue: portfolio.positions.borrows,
    healthFactor: portfolio.positions.healthFactor,
    allocations: allocations.slice(0, MAX_ALLOCATIONS),
    stablePercentage,
    insights: [],
    savingsApy,
    dailyEarning,
    address: portfolio.address,
    isSelfQuery: false,
    suinsName: handle,
  };
}

async function fetchPortfolioCard(
  address: string,
  handle: string
): Promise<PortfolioCardData | null> {
  const portfolio = await fetchProfilePortfolio(address);
  if (!portfolio) {
    return null;
  }
  return buildPortfolioCardData(portfolio, handle);
}

export async function generateMetadata({
  params,
}: UsernamePageProps): Promise<Metadata> {
  const { username } = await params;
  const resolved = await resolveHandle(username);
  if (!resolved) {
    return { title: "Not found · Audric", robots: { index: false } };
  }
  const { displayHandle } = resolved;
  const description = `Send USDC, SUI, or any token to ${displayHandle} on Sui via Audric.`;
  return {
    title: `${displayHandle} · Audric`,
    description,
    openGraph: {
      title: displayHandle,
      description,
      siteName: "Audric",
      type: "profile",
    },
    twitter: {
      card: "summary_large_image",
      title: displayHandle,
      description,
    },
  };
}

/**
 * Next 16 Cache Components mode forbids `export const dynamic` and
 * disallows uncached data reads outside `<Suspense>`. The outer page
 * stays synchronous; the async render + per-request SuiNS lookup +
 * portfolio fetch all live inside `<UsernameContent>` behind a Suspense
 * boundary. Same pattern as `app/audric-chat/page.tsx`.
 *
 * `generateMetadata` runs on its own pass (separate from page render)
 * and is exempt from this constraint.
 */
export default function UsernamePage({ params }: UsernamePageProps) {
  return (
    <Suspense fallback={<UsernameSkeleton />}>
      <UsernameContent params={params} />
    </Suspense>
  );
}

function UsernameSkeleton() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="h-[520px] animate-pulse rounded-xl border border-border bg-card" />
      </div>
    </main>
  );
}

async function UsernameContent({ params }: UsernamePageProps) {
  const { username } = await params;
  const resolved = await resolveHandle(username);
  if (!resolved) {
    notFound();
  }

  const { label, handle, displayHandle, address } = resolved;
  const portfolioCardData = await fetchPortfolioCard(address, handle);

  return (
    <main className="flex min-h-screen flex-col items-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <ProfilePublicCard
          address={address}
          displayHandle={displayHandle}
          label={label}
        />

        {portfolioCardData ? (
          <div className="mt-4">
            <PortfolioCardV2 data={portfolioCardData} />
          </div>
        ) : null}

        <div className="mt-6 text-center">
          <p className="text-[11px] text-muted-foreground">
            Don&rsquo;t have a handle yet?{" "}
            <Link
              className="text-foreground underline-offset-2 hover:underline"
              href="/chat"
            >
              Claim yours on Audric
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
