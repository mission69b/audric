import { SuinsRpcError } from "@t2000/engine";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProfilePublicCard } from "@/components/profile/profile-public-card";
import { isReserved } from "@/lib/identity/reserved-usernames";
import { validateAudricLabel } from "@/lib/identity/validate-label";
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
 *   - Store empty-state ("alice hasn't set up their store yet").
 *   - Per-username OG card via the sibling `opengraph-image.tsx`.
 *
 * [SPEC_AUDRIC_DEFI_REMOVAL §2e / S.387d — 2026-06-10] The public
 * portfolio panel (`PortfolioCardV2` + `lib/profile-portfolio.ts`) was
 * stripped: a public net-worth panel on a pay page is off-thesis and
 * privacy-noisy. The page is now a clean "pay this handle" surface;
 * Audric Store extends it later.
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

export async function generateMetadata({
  params,
}: UsernamePageProps): Promise<Metadata> {
  const { username } = await params;
  const resolved = await resolveHandle(username);
  if (!resolved) {
    // [F4 — 2026-05-31] Bare title — the root layout's `%s · Audric`
    // template appends the suffix. Previously this hardcoded "· Audric"
    // too, yielding the doubled "Not found · Audric · Audric".
    return { title: "Not found", robots: { index: false } };
  }
  const { displayHandle } = resolved;
  const description = `Send USDC, SUI, or any token to ${displayHandle} on Sui via Audric.`;
  return {
    // [F4 — 2026-05-31] Bare title; the layout template adds "· Audric".
    title: displayHandle,
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

  const { label, displayHandle, address } = resolved;

  return (
    <main className="flex min-h-screen flex-col items-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <ProfilePublicCard
          address={address}
          displayHandle={displayHandle}
          label={label}
        />

        <div className="mt-6 text-center">
          <p className="text-[11px] text-muted-foreground">
            Don&rsquo;t have a handle yet?{" "}
            <Link
              className="text-foreground underline-offset-2 hover:underline"
              href="/"
            >
              Claim yours on Audric
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
