import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  renderAudricCard,
} from "@/lib/og/audric-card";

/**
 * Twitter card (v3) — same art as the root opengraph-image, kept as its own
 * route so `twitter:image` is populated explicitly rather than relying on the
 * crawler's OG fallback.
 */

export const alt = "Audric — Private, decentralized AI on Sui";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderAudricCard({
    pill: "PRIVATE · SUI",
    line1: "Private, decentralized",
    line2: "AI — truly yours.",
    subtitle: "Multi-model AI on Sui. Own your wallet, your data, your memory.",
  });
}
