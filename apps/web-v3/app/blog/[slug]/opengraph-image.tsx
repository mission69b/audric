import { OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og/audric-card";
import { blogOgParams, renderBlogOgImage } from "@/lib/og/blog-card";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Audric blog";

export function generateStaticParams() {
  return blogOgParams();
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return renderBlogOgImage(slug);
}
