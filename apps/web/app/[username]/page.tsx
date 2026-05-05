import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { resolveSuinsViaRpc, SuinsRpcError } from '@t2000/engine';
import { SuiPayQr } from '@/components/pay/SuiPayQr';
import { AudricMark } from '@/components/ui/AudricMark';
import { AddressCopyButton } from './AddressCopyButton';
import { getSuiRpcUrl } from '@/lib/sui-rpc';
import { isReserved } from '@/lib/identity/reserved-usernames';
import { validateAudricLabel } from '@/lib/identity/validate-label';
import { buildSuiPayUri } from '@/lib/sui-pay-uri';

/**
 * SPEC 10 D.1 — Public profile page (stub) at `audric.ai/[username]`
 *
 * Minimum-viable shipment to unblock the SPEC 10 B.3 share-to-X URL
 * (`https://audric.ai/${label}` was 404'ing — see S.74 for context).
 *
 * What this stub does:
 *   - Server-side SuiNS lookup of `<username>.audric.sui` via the existing
 *     `resolveSuinsViaRpc` engine helper (same one A.3's check route uses)
 *   - 404 on unresolved / invalid / reserved labels (Next `notFound()`)
 *   - Render a centered profile card with:
 *       • Audric mark + 🪪 emoji + full handle
 *       • Truncated + copyable address
 *       • SuiPayQr in open-receive mode (same wrapper + AudricMark logo +
 *         sui:pay deep-link as the receive flow + SPEC 10 success state)
 *       • "Open in Sui wallet" CTA (sui:pay deep-link button) — opens
 *         Slush/Phantom/Suiet directly on mobile
 *       • "Powered by Audric Passport" footer + signup CTA
 *   - OpenGraph + Twitter card metadata for share previews
 *
 * What the FULL D.1 (Phase D, deferred) will add on top:
 *   - Public portfolio reuse (the `audric.ai/report/[address]` panel from
 *     Phase E of Audric 2.0) — net worth, top holdings, recent activity
 *   - "Following" / "Followers" social signals (deferred to v0.3)
 *   - Empty-state link to user's Audric Store (Phase 5 / SPEC 9 v0.2)
 *
 * URL slug stability: this stub uses the bare `<username>` path as the
 * permanent route shape, so any tweet shipped from B.3 today will keep
 * working when the full D.1 lands. URL migration risk = zero.
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
  handle: string;
  address: string;
}

async function resolveHandle(rawUsername: string): Promise<ResolvedHandle | null> {
  const validation = validateAudricLabel(rawUsername);
  if (!validation.valid) return null;
  const label = validation.label;
  if (isReserved(label)) return null;

  const handle = `${label}.${AUDRIC_PARENT_NAME}`;
  try {
    const address = await resolveSuinsViaRpc(handle, { suiRpcUrl: getSuiRpcUrl() });
    if (!address) return null;
    return { label, handle, address };
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

export async function generateMetadata({ params }: UsernamePageProps): Promise<Metadata> {
  const { username } = await params;
  const resolved = await resolveHandle(username);
  if (!resolved) {
    return { title: 'Not found · Audric', robots: { index: false } };
  }
  const { handle } = resolved;
  const description = `Send USDC, SUI, or any token to ${handle} on Sui via Audric.`;
  return {
    title: `${handle} · Audric`,
    description,
    openGraph: {
      title: handle,
      description,
      siteName: 'Audric',
      type: 'profile',
    },
    twitter: {
      card: 'summary',
      title: handle,
      description,
    },
  };
}

export default async function UsernamePage({ params }: UsernamePageProps) {
  const { username } = await params;
  const resolved = await resolveHandle(username);
  if (!resolved) notFound();

  const { handle, address } = resolved;
  const deepLink = buildSuiPayUri({ recipient: address });

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
                {handle}
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

          <div className="space-y-2">
            <AddressCopyButton address={address} />
            <a
              href={deepLink}
              className="block w-full rounded-md border border-border-strong bg-fg-primary px-4 py-2.5 text-center text-[12px] font-medium text-fg-inverse transition-opacity hover:opacity-90"
            >
              Open in Sui wallet
            </a>
          </div>

          <p className="text-center text-[11px] text-fg-secondary">
            Scan, copy, or tap to send {handle} USDC, SUI, or any token.
          </p>
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
