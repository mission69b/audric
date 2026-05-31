import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  renderAudricCard,
} from "@/lib/og/audric-card";

/**
 * Site-wide Open Graph card (canonical design: t2000-AFI/audric/
 * og-audric.svg). Inherited by every route that doesn't ship its own
 * `opengraph-image` (/pay/[slug], /share/[id], /[username] override).
 */

// NOTE: no `runtime = "edge"` — this app enables `cacheComponents`,
// which is incompatible with the edge route-segment config (unlike
// t2000/gateway). The Node runtime renders the card identically.
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
