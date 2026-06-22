"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { Streamdown } from "streamdown";

const plugins = { cjk, code, math, mermaid };

/** Renders a blog post's markdown body using the same renderer as chat, wrapped
 * in typography `prose` for blog-grade spacing. Server-rendered for SEO; hydrates
 * for code highlighting etc. */
export function BlogContent({ content }: { content: string }) {
  return (
    <div className="prose prose-neutral dark:prose-invert mt-8 max-w-none prose-headings:font-semibold prose-headings:text-foreground prose-p:text-foreground/80 prose-li:text-foreground/80 prose-strong:text-foreground prose-a:text-foreground">
      <Streamdown plugins={plugins}>{content}</Streamdown>
    </div>
  );
}
