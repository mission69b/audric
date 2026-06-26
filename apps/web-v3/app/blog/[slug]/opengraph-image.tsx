import { OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og/audric-card";
import { renderBlogOgImage } from "@/lib/og/blog-card";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Audric blog";

// Generated ON-DEMAND (no generateStaticParams) + edge-cached — NOT prerendered.
// Build-time prerender ran a Google-Fonts fetch per post across 15 workers, which
// rate-limited/timed-out → empty fonts → `next/og` threw "No fonts are loaded" →
// build failure. On-demand = one fetch at a time, reliable.
export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return renderBlogOgImage(slug);
}
