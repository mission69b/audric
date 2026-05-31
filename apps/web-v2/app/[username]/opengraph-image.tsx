import { isReserved } from "@/lib/identity/reserved-usernames";
import { validateAudricLabel } from "@/lib/identity/validate-label";
import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  renderAudricCard,
} from "@/lib/og/audric-card";

/**
 * Per-username Open Graph / Twitter card.
 *
 * When a user shares their `audric.ai/<handle>` URL, the platform fetches
 * THIS route to render the inline preview. Built on the shared
 * `renderAudricCard` helper (same renderer as root / pay / share) so the
 * brand stays identical across every card.
 *
 * Validation strategy: format + reserved-list ONLY (no SuiNS RPC).
 *   - The image is a pure function of the URL param.
 *   - SuiNS RPC at the OG-image edge has no retry budget — a flaky lookup
 *     would render a generic fallback for a valid handle, which is worse
 *     than a "preview-without-on-chain-check" image for a handle that
 *     doesn't exist (the linked page still 404s correctly via its own
 *     RPC check).
 *   - Performance — X retries aggressively if the image takes >2-3s.
 *
 * Reserved + invalid handles fall back to the generic Audric card so
 * shares of `audric.ai/admin` or `audric.ai/-bad` don't render
 * authoritative-looking handle cards.
 */

export const alt = "Audric Passport";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const PARENT_SUFFIX = "@audric";

interface ImageProps {
  params: Promise<{ username: string }>;
}

export default async function Image({ params }: ImageProps) {
  const { username } = await params;
  const validation = validateAudricLabel(username);
  const isValidHandle = validation.valid && !isReserved(validation.label);
  const label = isValidHandle ? validation.label : null;

  if (label) {
    return renderAudricCard({
      pill: "PASSPORT · SUI",
      line1: label,
      line2: PARENT_SUFFIX,
      subtitle: "Yours on Sui — recognized everywhere.",
      footerLeft: `audric.ai/${label}`,
      footerRight: "Gasless on Sui",
    });
  }

  return renderAudricCard({
    pill: "PASSPORT · SUI",
    line1: "Your money,",
    line2: "handled.",
    subtitle: "Talk to your money. Save, send, swap, and pay on Sui.",
    footerLeft: "audric.ai",
    footerRight: "Gasless on Sui",
  });
}
