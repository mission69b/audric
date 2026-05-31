import { audricWebUrl } from "@/lib/audric-web-url";
import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  renderAudricCard,
} from "@/lib/og/audric-card";

/**
 * Per-payment-link Open Graph / Twitter card. When a `/pay/<slug>`
 * URL is shared, this carries the actual amount / label so the
 * recipient sees what they're being asked to pay. Same house design
 * as the root card (t2000-AFI/audric/og-audric.svg).
 *
 * Data source: the same `/api/payments/[slug]` read the page's
 * `generateMetadata` uses (revalidate 60) — single source of truth.
 * Any failure (offline, cancelled, unknown slug) falls back to a
 * generic "Audric Pay" card so the crawler is never blocked.
 */

// No `runtime = "edge"` — incompatible with this app's cacheComponents.
export const alt = "Audric Pay";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

interface PaymentMetadata {
  amount?: number;
  label?: string;
  recipientName?: string;
}

interface ImageProps {
  params: Promise<{ slug: string }>;
}

export default async function Image({ params }: ImageProps) {
  const { slug } = await params;

  let line1 = "Get paid";
  let line2 = "on Audric.";
  let subtitle = "Send USDC on Sui — instant, global, no fees.";

  try {
    const res = await fetch(
      audricWebUrl(`/api/payments/${encodeURIComponent(slug)}`),
      { next: { revalidate: 60 } }
    );
    if (res.ok) {
      const data = (await res.json()) as PaymentMetadata;
      if (data.amount) {
        line1 = `$${data.amount.toFixed(2)}`;
        line2 = "USDC.";
        subtitle = data.label
          ? data.label
          : `A payment request${data.recipientName ? ` from ${data.recipientName}` : ""}.`;
      } else if (data.label) {
        subtitle = data.label;
      }
    }
  } catch {
    // generic Audric Pay card
  }

  return renderAudricCard({
    pill: "AUDRIC PAY",
    line1,
    line2,
    subtitle,
    footerLeft: "audric.ai/pay",
  });
}
