"use client";

/**
 * Inline generated-video render (standalone media capability; AGENT_WEDGE §6a).
 * The mp4 lives in a PRIVATE blob; `url` is the session-gated `/api/files/blob`
 * read URL. Native <video controls> + an explicit Download button — the blob
 * route serves no Content-Disposition (it must stay inline-playable), so the
 * native 3-dot download has no filename ("unknown file"); the <a download> below
 * forces a proper `.mp4` name (same-origin, so the attribute is honored).
 */

import { DownloadIcon } from "lucide-react";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function InlineVideoLoading() {
  return (
    <div className="flex aspect-video w-[min(100%,480px)] items-center justify-center rounded-xl border border-border/40 bg-muted/40">
      <span className="animate-pulse text-muted-foreground text-sm">
        Generating video… (~1 min)
      </span>
    </div>
  );
}

export function InlineVideo({ url, title }: { url: string; title?: string }) {
  const src = `${BASE_PATH}${url}`;
  const filename = `${(title ?? "audric-video")
    .replace(/[^\w-]+/g, "-")
    .toLowerCase()
    .slice(0, 50)}.mp4`;

  return (
    <div className="group relative w-[min(100%,480px)]">
      {/* biome-ignore lint/a11y/useMediaCaption: generated clip, no caption track */}
      <video
        className="w-full rounded-xl border border-border/40"
        controls
        playsInline
        preload="metadata"
        src={src}
        title={title}
      />
      <a
        aria-label="Download video"
        className="absolute top-2 right-2 rounded-md bg-black/50 p-1.5 text-white/90 opacity-100 backdrop-blur-sm transition-all hover:bg-black/70 group-hover:opacity-100 [@media(hover:hover)]:opacity-0"
        download={filename}
        href={src}
      >
        <DownloadIcon className="size-4" />
      </a>
    </div>
  );
}
