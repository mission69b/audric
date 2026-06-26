// Twitter card = the same branded per-post share image as the OG route (Next
// reads this file for twitter:image; route config can't be re-exported, so this
// mirrors the opengraph-image route over the shared renderer).
import { OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og/audric-card";
import { renderBlogOgImage } from "@/lib/og/blog-card";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Audric blog";

// On-demand + edge-cached (no generateStaticParams) — see opengraph-image.tsx for
// why (build-time prerender stormed Google Fonts → "No fonts are loaded" crash).
export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return renderBlogOgImage(slug);
}
