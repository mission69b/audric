import type { Metadata } from "next";
import { Suspense } from "react";
import { PayClient } from "@/components/pay/pay-client";
import { audricWebUrl } from "@/lib/audric-web-url";

/**
 * `/pay/[slug]` — public Audric Pay receipt screen. The only signed-out
 * application surface; the visuals lean on the QR-receipt pattern with a
 * pulsing "Listening for payment" indicator.
 *
 * Ported from `apps/web/app/pay/[slug]/page.tsx` for Session 4 (v0.7c
 * Phase 6). Behaviour preservation:
 *   - Same metadata derivation (invoice vs link branches; OG / Twitter
 *     summary card; `robots: { index: false }`).
 *   - Same client orchestration via `<PayClient slug={slug} />`.
 *
 * Metadata fetch path: pre-cutover (web-v2 ≠ same origin as `/api/payments/[slug]`),
 * `audricWebUrl()` prefixes the path with `NEXT_PUBLIC_AUDRIC_WEB_URL` when
 * that's set. Once Session 4 lands and the new Pay API route ships from
 * web-v2 itself, the `audricWebUrl()` no-op'd (no override → same-origin
 * fetch) and the same call hits this very deploy. Survives both phases
 * without a code change.
 */

interface PageProps {
  params: Promise<{ slug: string }>;
}

interface PaymentMetadata {
  amount?: number;
  label?: string;
  recipientName?: string;
  type?: "link" | "invoice";
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;

  let title = "Pay — Audric";
  let description = "Complete a USDC payment via Audric.";
  let ogTitle = "Audric Pay";

  try {
    // `audricWebUrl()` returns same-origin when NEXT_PUBLIC_AUDRIC_WEB_URL
    // is unset and the cross-app URL when set. Pre-cutover this points at
    // apps/web; post Session 5 rewrite flip same-origin returns to web-v2
    // itself. Survives both phases without a code change.
    const res = await fetch(
      audricWebUrl(`/api/payments/${encodeURIComponent(slug)}`),
      {
        next: { revalidate: 60 },
      }
    );
    if (res.ok) {
      const data = (await res.json()) as PaymentMetadata;
      const isInvoice = data.type === "invoice";
      const amountStr = data.amount
        ? `$${data.amount.toFixed(2)} USDC`
        : "USDC";

      if (isInvoice) {
        ogTitle = data.label ? `Invoice: ${data.label}` : "Invoice";
        title = `${ogTitle} — Audric`;
        description = `Pay ${amountStr} for ${data.label ?? "invoice"} via Audric.`;
      } else {
        ogTitle = data.label ? `Pay: ${data.label}` : `Pay ${amountStr}`;
        title = `${ogTitle} — Audric`;
        description = data.amount
          ? `Send ${amountStr} to ${data.recipientName ?? "recipient"} via Audric.`
          : "Complete a USDC payment via Audric.";
      }
    }
  } catch {
    // fall through to defaults
  }

  return {
    title,
    description,
    robots: { index: false },
    openGraph: {
      title: ogTitle,
      description,
      siteName: "Audric",
      type: "website",
    },
    twitter: {
      card: "summary",
      title: ogTitle,
      description,
    },
  };
}

/**
 * Next 16 Cache Components mode requires async data access (including
 * `await params`) to live behind a `<Suspense>` boundary. The outer
 * page stays synchronous; the params destructure + client orchestration
 * happen inside `<PayContent>`. Same pattern as `app/[username]/page.tsx`
 * and `app/audric-chat/page.tsx`.
 */
export default function PayPage({ params }: PageProps) {
  return (
    <Suspense fallback={<PaySkeleton />}>
      <PayContent params={params} />
    </Suspense>
  );
}

function PaySkeleton() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-page px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="rounded-md border border-border-subtle bg-surface-card p-8 text-center">
          <div className="animate-pulse space-y-4">
            <div className="mx-auto h-40 w-40 rounded-md bg-surface-sunken" />
            <div className="mx-auto h-4 w-3/4 rounded bg-surface-sunken" />
            <div className="mx-auto h-4 w-1/2 rounded bg-surface-sunken" />
          </div>
        </div>
      </div>
    </div>
  );
}

async function PayContent({ params }: PageProps) {
  const { slug } = await params;
  return <PayClient slug={slug} />;
}
