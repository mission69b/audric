import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { SuinsRpcError } from '@t2000/engine';
import { resolveSuinsCached } from '@/lib/suins-cache';
import { SuiPayQr } from '@/components/pay/SuiPayQr';
import { AudricMark } from '@/components/ui/AudricMark';
import { PortfolioCard } from '@/components/engine/cards/PortfolioCard';
import { AddressCopyButton } from './AddressCopyButton';
import { SendToHandleButton } from './SendToHandleButton';
import { getSuiRpcUrl } from '@/lib/sui-rpc';
import { isReserved } from '@/lib/identity/reserved-usernames';
import { validateAudricLabel } from '@/lib/identity/validate-label';
import { getPortfolio, type Portfolio } from '@/lib/portfolio';

/**
 * SPEC 10 D.1 — Public profile page at `audric.ai/[username]`
 *
 * Originally shipped as a minimal stub (S.74/S.75) to unblock the SPEC 10
 * B.3 share-to-X URL (`https://audric.ai/${label}` was 404'ing). Expanded
 * in S.81 with the public portfolio panel + Store empty-state per spec.
 *
 * What this page does:
 *   - Server-side SuiNS lookup of `<username>.audric.sui` via the existing
 *     `resolveSuinsViaRpc` engine helper (same one A.3's check route uses)
 *   - 404 on unresolved / invalid / reserved labels (Next `notFound()`)
 *   - Render a centered profile card with:
 *       • Audric mark + 🪪 emoji + full handle
 *       • SuiPayQr in open-receive mode (same wrapper + AudricMark logo +
 *         sui:pay deep-link as the receive flow + SPEC 10 success state) —
 *         visitors with a phone wallet can scan
 *       • Truncated address
 *       • <SendToHandleButton> — dapp-kit ConnectModal + amount input +
 *         direct USDC transfer (works on desktop browsers with Slush
 *         extension; mirrors the `<PayButton>` pattern from /pay/[slug]).
 *         REPLACED the original v1 `sui:pay?…` deep-link button which
 *         silently no-op'd on desktop — see SendToHandleButton header
 *         for the full rationale.
 *       • Below a divider: <AddressCopyButton> for visitors who want to
 *         paste into a CEX withdrawal form
 *   - [S.81] Public portfolio panel (PortfolioCard) — server-fetched via
 *     the canonical `getPortfolio()` (same SSOT every other audric surface
 *     uses). Shows net worth + wallet/savings/DeFi/debt breakdown +
 *     allocation bar. Hidden for new/empty wallets (netWorth < $0.01) to
 *     avoid a "looks broken" $0 card. Insights are intentionally omitted
 *     on public profiles — those are personal recommendations.
 *   - [S.81] Store empty-state — "alice hasn't set up their store yet".
 *     Static placeholder for v0.1; future Phase 5 will turn it into a
 *     link to `audric.ai/[username]/store`.
 *   - OpenGraph + Twitter card metadata for share previews
 *
 * Privacy note: the portfolio panel surfaces data that is ALREADY public
 * on Sui (every Sui address's balances + positions are queryable by
 * anyone via SuiVision / Sui RPC). Showing it here makes existing public
 * data more discoverable, not new info. Users who claim a handle are
 * opting into this surface. A "hide portfolio from public profile"
 * settings toggle is deferred to v0.3 if signal warrants it.
 *
 * URL slug stability: this page uses the bare `<username>` path as the
 * permanent route shape, so any tweet shipped from B.3 today keeps
 * working through D.1 expansion. URL migration risk = zero.
 *
 * Theming: this page is THEMED (follows the visitor's OS theme), not
 * LIGHT-ONLY. Profile pages are recipient-facing surfaces — visitors may
 * not be Audric users but they DID set their OS theme; flashing them
 * the wrong canvas is a bad first impression. Mirrors the `/pay/[slug]`
 * decision documented in `lib/theme/public-paths.ts`.
 *
 * Route-collision protection: `app/[username]` matches every root path
 * not already claimed by a static folder (`/new`, `/chat/...`, `/pay/...`,
 * `/auth/...`, `/settings`, `/litepaper`, `/privacy`, `/terms`, etc.).
 * Next.js routing prioritizes static segments, so the static routes
 * keep working — but to prevent users from claiming usernames that
 * shadow them (and would render the static page instead of the profile
 * page) we extend the reserved-list to cover every top-level static
 * segment in `lib/identity/reserved-usernames.ts`.
 */

const AUDRIC_PARENT_NAME = 'audric.sui';

interface UsernamePageProps {
  params: Promise<{ username: string }>;
}

interface ResolvedHandle {
  label: string;
  /**
   * On-chain SuiNS NFT name — `<label>.audric.sui`. Used for SuiNS RPC
   * lookups and any technical/on-chain reference. NOT for display.
   */
  handle: string;
  /**
   * [S.118] Display form — `<label>@audric`. Used for the page title,
   * h1, OG metadata, share-to-X copy, and any user-facing surface. The
   * SuiNS V2 short-form alias resolves to the same address as `handle`
   * via SuiNS RPC, but reads cleaner in marketing / consumer copy.
   */
  displayHandle: string;
  address: string;
}

async function resolveHandle(rawUsername: string): Promise<ResolvedHandle | null> {
  const validation = validateAudricLabel(rawUsername);
  if (!validation.valid) return null;
  const label = validation.label;
  if (isReserved(label)) return null;

  const handle = `${label}.${AUDRIC_PARENT_NAME}`;
  const displayHandle = `${label}@${AUDRIC_PARENT_NAME.replace(/\.sui$/, '')}`;
  try {
    // [S18-F9 / vercel-logs L8] Cached lookup: positive 5min TTL, negative
    // 30s. Pre-fix one popular profile (`/adeniyi`) was hit 77 times in 12h
    // → 77 live RPC calls → periodic 429 bursts → page intermittently 404'd
    // its own visitors. Cache cuts ~95% of repeat lookups inside the
    // Lambda's warm window.
    const address = await resolveSuinsCached(handle, { suiRpcUrl: getSuiRpcUrl() });
    if (!address) return null;
    return { label, handle, displayHandle, address };
  } catch (err) {
    // SuiNS RPC degraded — log and treat as not-found rather than 5xx.
    // Visitors retrying in a moment will succeed. The profile-page UX
    // doesn't have an "RPC degraded" surface yet (Phase D may add one).
    const detail =
      err instanceof SuinsRpcError ? err.message : err instanceof Error ? err.message : 'unknown';
    console.warn(`[/${rawUsername}] SuiNS lookup failed: ${detail}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// [S.81 D.1] Public portfolio data fetch + PortfolioCard prop shape.
//
// Routes through the canonical `getPortfolio()` (same SSOT as
// balance_check, portfolio_analysis, the daily snapshot cron, and every
// other audric surface). Degrades silently to `null` on any failure —
// the profile page is recipient-facing and a 5xx because BlockVision had
// a hiccup would be an unacceptable cliff. Empty wallets (netWorth < 1¢)
// also return null to suppress a "looks broken" $0 card on brand-new
// claims.
//
// The PortfolioCard transformation mirrors the `portfolio_analysis`
// engine tool's mapping (allocations from wallet coins + per-protocol
// DeFi rows, sorted desc, dust-filtered). We deliberately do NOT
// hand-tune insights on public profiles — those are personal
// recommendations and surfacing them on someone else's URL would be
// awkward at best.
// ---------------------------------------------------------------------------

const DUST_USD = 0.5;
const STABLECOINS = new Set(['USDC', 'USDsui', 'USDT', 'USDe', 'AUSD']);

interface PortfolioCardData {
  totalValue: number;
  walletValue: number;
  savingsValue: number;
  defiValue?: number;
  defiSource?: 'blockvision' | 'partial' | 'partial-stale' | 'degraded';
  debtValue: number;
  healthFactor: number | null;
  allocations: { symbol: string; amount: number; usdValue: number; percentage: number }[];
  stablePercentage: number;
  insights: { type: string; message: string }[];
  savingsApy?: number;
  dailyEarning?: number;
  address?: string;
  isSelfQuery?: boolean;
  suinsName?: string | null;
}

function buildPortfolioCardData(
  portfolio: Portfolio,
  handle: string,
): PortfolioCardData | null {
  // Suppress empty wallets — visiting a brand-new claim with $0 should
  // not render a card that looks like a rendering failure.
  if (portfolio.netWorthUsd < 0.01 && portfolio.wallet.length === 0) {
    return null;
  }

  const allocations: { symbol: string; amount: number; usdValue: number; percentage: number }[] = [];
  let walletValue = 0;
  for (const coin of portfolio.wallet) {
    const amount = Number(coin.balance) / 10 ** coin.decimals;
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const usdValue = coin.usdValue ?? (coin.price != null ? amount * coin.price : 0);
    walletValue += usdValue;
    if (usdValue >= DUST_USD) {
      allocations.push({ symbol: coin.symbol, amount, usdValue, percentage: 0 });
    }
  }

  // Per-spec "single aggregate DeFi row" treatment — the public profile
  // doesn't surface per-protocol breakdowns (no DeFi positions endpoint
  // exposed via the canonical fetcher today). One labelled row keeps
  // the allocation pie honest about DeFi mass.
  if (portfolio.defiValueUsd >= DUST_USD) {
    allocations.push({
      symbol: 'DeFi (aggregate)',
      amount: 0,
      usdValue: portfolio.defiValueUsd,
      percentage: 0,
    });
  }

  const totalValue = walletValue + portfolio.positions.savings + portfolio.defiValueUsd;
  for (const a of allocations) {
    a.percentage = totalValue > 0 ? (a.usdValue / totalValue) * 100 : 0;
  }
  allocations.sort((a, b) => b.usdValue - a.usdValue);

  const stableValue =
    allocations.filter((a) => STABLECOINS.has(a.symbol)).reduce((s, a) => s + a.usdValue, 0)
    + portfolio.positions.savings;
  const stablePercentage = totalValue > 0 ? (stableValue / totalValue) * 100 : 0;

  const savingsApy =
    portfolio.positions.savingsRate > 0 ? portfolio.positions.savingsRate : undefined;
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
    allocations: allocations.slice(0, 10),
    stablePercentage,
    insights: [], // suppressed on public profiles by design
    savingsApy,
    dailyEarning,
    address: portfolio.address,
    isSelfQuery: false, // always a watched-address read on profile pages
    suinsName: handle,
  };
}

async function fetchProfilePortfolio(
  address: string,
  handle: string,
): Promise<PortfolioCardData | null> {
  try {
    const portfolio = await getPortfolio(address);
    return buildPortfolioCardData(portfolio, handle);
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown';
    console.warn(`[/${handle}] portfolio fetch failed: ${detail}`);
    return null;
  }
}

export async function generateMetadata({ params }: UsernamePageProps): Promise<Metadata> {
  const { username } = await params;
  const resolved = await resolveHandle(username);
  if (!resolved) {
    return { title: 'Not found · Audric', robots: { index: false } };
  }
  // [S.118] Use the @audric display form for OG metadata + share previews —
  // it's what users see when the link is shared on X / iMessage / etc.
  // The on-chain `handle` (`<label>.audric.sui`) stays available for any
  // technical surface that needs it.
  const { displayHandle } = resolved;
  const description = `Send USDC, SUI, or any token to ${displayHandle} on Sui via Audric.`;
  // [S.89] `summary_large_image` so X / Discord / iMessage etc. render
  // the per-username 1200x630 hero card from `./opengraph-image.tsx`
  // (Next.js auto-discovers the sibling file). Without this card the
  // shared link previews as a tiny square with a generic Audric image —
  // doesn't read as "this is alice's passport" at a glance.
  return {
    title: `${displayHandle} · Audric`,
    description,
    openGraph: {
      title: displayHandle,
      description,
      siteName: 'Audric',
      type: 'profile',
    },
    twitter: {
      card: 'summary_large_image',
      title: displayHandle,
      description,
    },
  };
}

export default async function UsernamePage({ params }: UsernamePageProps) {
  const { username } = await params;
  const resolved = await resolveHandle(username);
  if (!resolved) notFound();

  const { label, handle, displayHandle, address } = resolved;

  // Run the portfolio fetch in parallel with the rest of the render — it
  // won't block 404s (resolveHandle already ran) but it may add ~200ms
  // to first paint when BlockVision is healthy. Acceptable for an
  // SSR'd surface where the panel is the value.
  // [S.118] Pass the on-chain `handle` to the canonical fetcher (it
  // logs against the on-chain identity); display surfaces below use
  // `displayHandle` instead.
  const portfolioCardData = await fetchProfilePortfolio(address, handle);

  return (
    <main className="min-h-screen bg-surface-page flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-lg border border-border-subtle bg-surface-card p-6 space-y-6 shadow-[var(--shadow-flat)]">
          <div className="flex flex-col items-center gap-3 text-center">
            <Link
              href="/"
              aria-label="Audric"
              className="text-fg-primary opacity-70 transition-opacity hover:opacity-100"
            >
              <AudricMark size={28} />
            </Link>
            <div className="space-y-1">
              <div className="text-2xl" aria-hidden="true">
                🪪
              </div>
              <h1 className="break-all font-mono text-lg font-medium text-fg-primary">
                {displayHandle}
              </h1>
              <p className="text-[12px] text-fg-secondary">
                yours on Sui — recognized everywhere
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center gap-3">
            <SuiPayQr recipientAddress={address} amount={null} size={180} />
            <div className="font-mono text-[10px] text-fg-secondary">
              {truncateAddress(address)}
            </div>
          </div>

          <SendToHandleButton recipientAddress={address} handle={displayHandle} />

          <div className="space-y-2 border-t border-border-subtle pt-4">
            <p className="text-center text-[10px] uppercase tracking-[0.08em] text-fg-muted">
              or send from another wallet
            </p>
            <AddressCopyButton address={address} />
            <p className="text-center text-[11px] text-fg-secondary">
              Scan the QR with your phone wallet, or paste this address into any Sui wallet or
              exchange withdrawal form.
            </p>
          </div>
        </div>

        {portfolioCardData ? (
          <div className="mt-4">
            <PortfolioCard data={portfolioCardData} />
          </div>
        ) : null}

        <div className="mt-4 rounded-md border border-border-subtle bg-surface-card overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2 border-b border-border-subtle bg-surface-sunken">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-muted">
              Store
            </span>
          </div>
          <div className="px-3.5 py-4 text-center">
            <div className="text-2xl mb-1.5" aria-hidden="true">
              🛒
            </div>
            <p className="text-[12px] text-fg-secondary">
              {label} hasn&rsquo;t set up their store yet.
            </p>
            <p className="mt-1 text-[10px] text-fg-muted">
              Coming soon — Audric Store
            </p>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-[11px] text-fg-secondary">
            Powered by{' '}
            <Link
              href="/"
              className="text-fg-primary underline-offset-2 hover:underline"
            >
              Audric Passport
            </Link>
            {' '}—{' '}
            <Link
              href="/new"
              className="text-fg-primary underline-offset-2 hover:underline"
            >
              claim your handle
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
