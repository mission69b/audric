"use client";

import { useEffect, useState } from "react";

/**
 * LegalToc — the sticky "On this page" rail for the legal/litepaper docs
 * (R6.6 6d, `phase2-profile-legal.html` `.legal-toc`).
 *
 * Auto-derives from the `<h2>` headings inside `#legal-content` on mount:
 * slugifies + assigns an `id` to any heading that lacks one, builds the
 * link list, and tracks the in-view heading via IntersectionObserver for
 * the `active` highlight. This keeps the page bodies free of manual anchor
 * bookkeeping — add or remove an `<h2>` and the TOC follows.
 */

interface TocItem {
  id: string;
  label: string;
}

export function LegalToc() {
  const [items, setItems] = useState<TocItem[]>([]);
  const [active, setActive] = useState("");

  useEffect(() => {
    const root = document.getElementById("legal-content");
    if (!root) {
      return;
    }
    const headings = Array.from(root.querySelectorAll("h2"));
    const seen = new Set<string>();
    const next = headings.map((h, i) => {
      const label = h.textContent?.trim() ?? `Section ${i + 1}`;
      let id = h.id;
      if (!id) {
        const base =
          label
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || `section-${i}`;
        // De-dupe: two headings with identical text would otherwise share
        // an id (invalid HTML + the anchor jumps to the first only).
        id = base;
        let n = 2;
        while (seen.has(id)) {
          id = `${base}-${n}`;
          n += 1;
        }
        h.id = id;
      }
      seen.add(id);
      return { id, label };
    });
    setItems(next);
    if (next[0]) {
      setActive(next[0].id);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setActive((e.target as HTMLElement).id);
          }
        }
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 }
    );
    for (const h of headings) {
      observer.observe(h);
    }
    return () => observer.disconnect();
  }, []);

  if (items.length === 0) {
    return null;
  }

  return (
    <aside className="sticky top-20 hidden self-start text-[13px] lg:block">
      <div className="mb-2.5 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
        On this page
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((it) => (
          <li key={it.id}>
            <a
              className={`tracking-[-0.011em] transition-colors hover:text-foreground ${
                active === it.id ? "text-foreground" : "text-muted-foreground"
              }`}
              href={`#${it.id}`}
            >
              {it.label}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
