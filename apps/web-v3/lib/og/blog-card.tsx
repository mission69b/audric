import { getPost } from "@/lib/blog";
import { renderAudricCard } from "@/lib/og/audric-card";

/**
 * Per-post share card — shared by the blog's opengraph-image + twitter-image
 * routes (Next requires each route to declare its own config, so the routes are
 * thin wrappers and the logic lives here). Built from the branded
 * `renderAudricCard` template with the post's title + description.
 */

/** Split a title into two balanced lines for the card's 2-line headline. */
function splitTitle(title: string): [string, string] {
  if (title.length <= 22) {
    return [title, ""];
  }
  const mid = Math.floor(title.length / 2);
  let at = title.lastIndexOf(" ", mid);
  if (at < 6) {
    at = title.indexOf(" ", mid);
  }
  return at === -1 ? [title, ""] : [title.slice(0, at), title.slice(at + 1)];
}

/** Clip a subtitle to one line (the card doesn't wrap it). */
function clip(s: string, max: number): string {
  if (s.length <= max) {
    return s;
  }
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 20 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

export function renderBlogOgImage(slug: string) {
  const post = getPost(slug);
  const [line1, line2] = splitTitle(post?.title ?? "Audric Blog");
  return renderAudricCard({
    pill: "FROM THE BLOG",
    line1,
    line2,
    subtitle: clip(
      post?.description ?? "Private, decentralized AI — truly yours.",
      88
    ),
    footerLeft: "audric.ai/blog",
  });
}
