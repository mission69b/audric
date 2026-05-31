import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  renderAudricCard,
} from "@/lib/og/audric-card";

/**
 * Open Graph / Twitter card for public shared chats (`/share/[id]`).
 * Same house design as the root card (t2000-AFI/audric/og-audric.svg).
 *
 * Intentionally a pure function of the URL — it does NOT read the chat
 * row. Two reasons: (1) a `/share/<id>` is only viewable when
 * `visibility === 'public'`, and the OG path has no cheap way to honor
 * that gate without leaking the existence of private chats; (2) chat
 * titles are unbounded user text that renders unpredictably. So every
 * shared chat gets the same branded card.
 */

// No `runtime = "edge"` — incompatible with this app's cacheComponents.
export const alt = "A conversation with Audric";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderAudricCard({
    pill: "SHARED CHAT",
    line1: "A conversation",
    line2: "with Audric.",
    subtitle: "Talk to your money on Sui — save, send, swap by message.",
  });
}
