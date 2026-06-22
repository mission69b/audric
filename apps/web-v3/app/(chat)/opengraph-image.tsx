import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  renderAudricCard,
} from "@/lib/og/audric-card";

/**
 * Site-wide Open Graph card (v3). Same renderer as web-v2's canonical card,
 * with the v3 positioning headline ("Private, decentralized AI — truly yours").
 */

export const alt = "Audric — Private, decentralized AI";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderAudricCard({
    pill: "PRIVATE · SUI",
    line1: "Private, decentralized",
    line2: "AI — truly yours.",
    subtitle: "Multi-model AI on Sui. Own your wallet, your data, your memory.",
    footerRight: "Multi-model · Non-custodial",
    emphasizeLine2: true,
  });
}
