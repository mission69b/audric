"use client";

import { ChevronDownIcon } from "lucide-react";
import { memo, useMemo, useState } from "react";

/**
 * SearchResults — Perplexity-style visual layer for web_search turns: a grid
 * of source cards (favicon · title · domain · age) + a related-image strip.
 * Renders ABOVE the answer; the CoT timeline keeps the process view (queries +
 * per-step sources) untouched. Aggregates every web_search in the turn,
 * deduped. Degrades to nothing when a turn has no completed searches.
 */

type Source = { url: string; title: string; date?: string };
type SearchImage = { url: string; origin?: string };

const VISIBLE_CARDS = 4;
const MAX_CARDS = 12;

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function ageOf(date?: string): string | null {
  if (!date) {
    return null;
  }
  const t = Date.parse(date);
  if (Number.isNaN(t)) {
    return null;
  }
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days <= 0) {
    return "today";
  }
  if (days === 1) {
    return "1d ago";
  }
  if (days < 30) {
    return `${days}d ago`;
  }
  return new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function Favicon({ domain }: { domain: string }) {
  const [failed, setFailed] = useState(false);
  if (!domain || failed) {
    return <div className="size-4 shrink-0 rounded-sm bg-muted" />;
  }
  return (
    // biome-ignore lint/performance/noImgElement: external favicons (arbitrary domains) can't go through next/image
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: onError swaps to a neutral placeholder when the favicon 404s
    <img
      alt=""
      className="size-4 shrink-0 rounded-sm"
      height={16}
      loading="lazy"
      onError={() => setFailed(true)}
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
      width={16}
    />
  );
}

function SourceCard({ source }: { source: Source }) {
  const domain = domainOf(source.url);
  const age = ageOf(source.date);
  return (
    <a
      className="flex flex-col justify-between gap-2 rounded-xl border border-border/40 bg-card/40 p-3 no-underline transition-colors hover:border-border hover:bg-accent"
      href={source.url}
      rel="noreferrer"
      target="_blank"
    >
      <span className="line-clamp-2 font-medium text-[12.5px] text-foreground leading-snug">
        {source.title || domain}
      </span>
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Favicon domain={domain} />
        <span className="truncate">{domain}</span>
        {age && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span className="shrink-0">{age}</span>
          </>
        )}
      </span>
    </a>
  );
}

function ImageThumb({ image }: { image: SearchImage }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return null;
  }
  return (
    <a
      className="block shrink-0 overflow-hidden rounded-xl border border-border/40"
      href={image.origin ?? image.url}
      rel="noreferrer"
      target="_blank"
    >
      {/* biome-ignore lint/performance/noImgElement: arbitrary external image domains — next/image needs an enumerable remotePatterns allowlist */}
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: onError self-removes broken thumbnails */}
      <img
        alt=""
        className="h-24 w-auto min-w-24 max-w-44 object-cover transition-opacity hover:opacity-85"
        loading="lazy"
        onError={() => setFailed(true)}
        src={image.url}
      />
    </a>
  );
}

function PureSearchResults({
  sources,
  images,
}: {
  sources: Source[];
  images: SearchImage[];
}) {
  const [expanded, setExpanded] = useState(false);

  const deduped = useMemo(() => {
    const seen = new Set<string>();
    const out: Source[] = [];
    for (const s of sources) {
      if (s.url && !seen.has(s.url)) {
        seen.add(s.url);
        out.push(s);
      }
      if (out.length >= MAX_CARDS) {
        break;
      }
    }
    return out;
  }, [sources]);

  const dedupedImages = useMemo(() => {
    const seen = new Set<string>();
    return images.filter((i) => {
      if (!i.url || seen.has(i.url)) {
        return false;
      }
      seen.add(i.url);
      return true;
    });
  }, [images]);

  if (deduped.length === 0 && dedupedImages.length === 0) {
    return null;
  }

  const visible = expanded ? deduped : deduped.slice(0, VISIBLE_CARDS);
  const hidden = deduped.length - VISIBLE_CARDS;
  const expandable = hidden > 0;

  return (
    <div className="flex flex-col gap-2">
      {dedupedImages.length > 0 && (
        <div className="scrollbar-hide flex gap-2 overflow-x-auto">
          {dedupedImages.map((img) => (
            <ImageThumb image={img} key={img.url} />
          ))}
        </div>
      )}
      {deduped.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {visible.map((s) => (
            <SourceCard key={s.url} source={s} />
          ))}
        </div>
      )}
      {expandable && (
        <button
          className="flex w-fit items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => setExpanded((v) => !v)}
          type="button"
        >
          <ChevronDownIcon
            className={`size-3 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
          {expanded
            ? "Show fewer sources"
            : `${hidden} more source${hidden === 1 ? "" : "s"}`}
        </button>
      )}
    </div>
  );
}

export const SearchResults = memo(PureSearchResults);
