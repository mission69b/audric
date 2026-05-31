import Link from "next/link";
import type { ReactNode } from "react";
import { LegalToc } from "./legal-toc";

/**
 * LegalShell — shared chrome for the legal docs (R6.6 6d,
 * `phase2-profile-legal.html` §2). Renders the back link, the `.doc-tabs`
 * pill nav, and the `.legal-frame` card: a 200px sticky TOC + the prose
 * content column.
 *
 * `bare` opts a doc out of the `.legal-prose` type scale — the Security page
 * uses its own card/badge layout, so it slots into the same frame + TOC but
 * keeps its bespoke styling.
 */

const DOC_TABS = [
  { slug: "privacy", href: "/privacy", label: "Privacy" },
  { slug: "disclaimer", href: "/disclaimer", label: "Disclaimer" },
  { slug: "security", href: "/security", label: "Security" },
  { slug: "terms", href: "/terms", label: "Terms" },
] as const;

export function LegalShell({
  slug,
  tag,
  title,
  updated,
  bare = false,
  children,
}: {
  bare?: boolean;
  children: ReactNode;
  slug: string;
  tag: string;
  title: string;
  updated: string;
}) {
  return (
    <div>
      <Link
        className="mb-8 inline-block font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em] transition-colors hover:text-foreground"
        href="/"
      >
        ← audric.ai
      </Link>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {DOC_TABS.map((t) => (
          <Link
            aria-current={t.slug === slug ? "page" : undefined}
            className={`rounded-full border px-3 py-[5px] font-mono text-[10.5px] uppercase tracking-[0.06em] transition-colors ${
              t.slug === slug
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
            href={t.href}
            key={t.slug}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-10 rounded-xl border border-border bg-card p-6 sm:p-8 lg:grid-cols-[200px_1fr]">
        <LegalToc />
        <article
          className={bare ? undefined : "legal-prose"}
          data-legal-content
          id="legal-content"
        >
          <span className="mb-4 inline-flex items-center gap-1.5 rounded border border-border px-2 py-[3px] font-mono text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
            {tag}
          </span>
          <h1 className="mb-1.5 font-sans font-semibold text-[32px] text-foreground leading-[1.1] tracking-[-0.035em]">
            {title}
          </h1>
          <div className="mb-7 font-mono text-[11px] text-muted-foreground tracking-[0.02em]">
            {updated}
          </div>
          {children}
        </article>
      </div>
    </div>
  );
}
