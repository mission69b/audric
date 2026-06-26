"use client";

/**
 * Inline generated-video render (standalone media capability; AGENT_WEDGE §6a).
 * The mp4 lives in a PRIVATE blob; `url` is the session-gated `/api/files/blob`
 * read URL. Native <video controls> (download lives in the browser's controls).
 */

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
  return (
    <div className="w-[min(100%,480px)]">
      {/* biome-ignore lint/a11y/useMediaCaption: generated clip, no caption track */}
      <video
        className="w-full rounded-xl border border-border/40"
        controls
        playsInline
        preload="metadata"
        src={`${BASE_PATH}${url}`}
        title={title}
      />
    </div>
  );
}
