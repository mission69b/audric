"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import type { ComponentProps } from "react";
import { Streamdown } from "streamdown";

const plugins = { cjk, code, math, mermaid };

// Render an `.mp4` markdown "image" (![alt](/blog/x.mp4)) as an autoplaying,
// looping, muted inline video; everything else stays a normal image. Lets the
// blog embed motion clips with plain markdown image syntax.
function MediaImg({ src, alt }: ComponentProps<"img">) {
  const url = typeof src === "string" ? src : "";
  if (url.endsWith(".mp4")) {
    return (
      <video
        aria-label={alt}
        autoPlay
        className="my-6 w-full rounded-xl border border-border/40"
        loop
        muted
        playsInline
      >
        <source src={url} type="video/mp4" />
      </video>
    );
  }
  return (
    // biome-ignore lint/performance/noImgElement: rendered blog markdown image
    <img
      alt={alt}
      className="rounded-xl border border-border/40"
      loading="lazy"
      src={url}
    />
  );
}

const components = { img: MediaImg };

/** Renders a blog post's markdown body using the same renderer as chat, wrapped
 * in typography `prose` for blog-grade spacing. Server-rendered for SEO; hydrates
 * for code highlighting etc. Supports inline .mp4 video via markdown image syntax. */
export function BlogContent({ content }: { content: string }) {
  return (
    <div className="prose prose-neutral dark:prose-invert mt-8 max-w-none prose-headings:font-semibold prose-headings:text-foreground prose-p:text-foreground/80 prose-li:text-foreground/80 prose-strong:text-foreground prose-a:text-foreground">
      <Streamdown components={components} plugins={plugins}>
        {content}
      </Streamdown>
    </div>
  );
}
