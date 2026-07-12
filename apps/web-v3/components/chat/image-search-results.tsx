"use client";

import { memo, useState } from "react";

/**
 * ImageSearchResults — grid renderer for the image_search tool: responsive
 * thumbnail grid (Brave-CDN thumbs), each tile links to its source page with
 * the title/domain on hover. Broken thumbs self-remove.
 */

type ImageResult = { url: string; origin?: string; title?: string };

function domainOf(url?: string): string {
  if (!url) {
    return "";
  }
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function Tile({ image }: { image: ImageResult }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return null;
  }
  return (
    <a
      className="group relative block overflow-hidden rounded-xl border border-border/40 bg-muted/20"
      href={image.origin ?? image.url}
      rel="noreferrer"
      target="_blank"
      title={image.title}
    >
      {/* biome-ignore lint/performance/noImgElement: arbitrary external image domains — next/image needs an enumerable remotePatterns allowlist */}
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: onError self-removes broken thumbnails */}
      <img
        alt={image.title ?? ""}
        className="h-32 w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
        loading="lazy"
        onError={() => setFailed(true)}
        src={image.url}
      />
      {(image.title || image.origin) && (
        <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 pt-4 pb-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
          {image.title || domainOf(image.origin)}
        </span>
      )}
    </a>
  );
}

function PureImageSearchResults({ images }: { images: ImageResult[] }) {
  if (images.length === 0) {
    return null;
  }
  return (
    <div className="grid w-full max-w-2xl grid-cols-2 gap-2 sm:grid-cols-3">
      {images.map((img) => (
        <Tile image={img} key={img.url} />
      ))}
    </div>
  );
}

export const ImageSearchResults = memo(PureImageSearchResults);
