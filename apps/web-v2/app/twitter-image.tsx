import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  renderAudricCard,
} from "@/lib/og/audric-card";

/**
 * Site-wide Twitter card — same art as the root opengraph-image, kept
 * as its own route so `twitter:image` is populated explicitly rather
 * than relying on crawler OG fallback.
 */

// No `runtime = "edge"` — incompatible with this app's cacheComponents.
export const alt = "Audric — Conversational finance on Sui";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderAudricCard({
    pill: "LIVE · SUI",
    line1: "Conversational",
    line2: "finance.",
    subtitle: "Talk to your money. Save, send, swap — by message.",
  });
}
