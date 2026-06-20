"use client";

import { BrainIcon, GlobeIcon, Loader2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import { sanitizeText } from "@/lib/utils";

export type CotItem =
  | { kind: "reasoning"; text: string }
  | {
      kind: "search";
      query: string;
      sources: { url: string; title: string }[];
      state: "active" | "complete" | "error";
    };

function domain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * A deterministic letter "favicon" — colored chip with the source's first
 * letter. No external favicon fetch (which would leak every source domain the
 * user reads to a third party — wrong for a privacy-first app); gives per-source
 * variety vs a repeated globe icon. Color is derived from the domain.
 */
function SourceFavicon({ url }: { url: string }) {
  const d = domain(url);
  const letter = d.charAt(0).toUpperCase() || "?";
  let hash = 0;
  for (const ch of d) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  const hue = hash % 360;
  return (
    <span
      aria-hidden="true"
      className="flex size-4 shrink-0 items-center justify-center rounded font-semibold text-[8px] text-white"
      style={{ backgroundColor: `hsl(${hue} 52% 45%)` }}
    >
      {letter}
    </span>
  );
}

/**
 * The live "Chain of Thought" timeline (AI Elements) — groups a turn's reasoning
 * + web_search steps into ONE collapsible block. Open while the turn is in
 * flight (so the user watches it work), auto-collapses to a "Thought for Xs · N
 * steps" summary when done — but a manual toggle wins (never snaps shut while
 * the user is reading). Duration shows only for the live/just-finished turn
 * (metadata isn't persisted); historical turns show the step count.
 */
export function CotTimeline({
  items,
  isLoading,
  startedAt,
}: {
  items: CotItem[];
  isLoading: boolean;
  // Turn start (ms) from the message metadata — anchors the timer to the real
  // turn start (not component mount), so "Thought for Xs" is accurate. Absent on
  // historical messages (metadata isn't persisted) → no duration shown.
  startedAt?: number;
}) {
  const startRef = useRef<number>(startedAt ?? Date.now());
  useEffect(() => {
    if (startedAt) {
      startRef.current = startedAt;
    }
  }, [startedAt]);
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    if (!isLoading) {
      return;
    }
    const tick = () => setElapsedMs(Date.now() - startRef.current);
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [isLoading]);

  // Open while streaming; collapse when done — unless the user has toggled it.
  const [open, setOpen] = useState(isLoading);
  const userToggled = useRef(false);
  useEffect(() => {
    if (!userToggled.current) {
      setOpen(isLoading);
    }
  }, [isLoading]);

  if (items.length === 0) {
    return null;
  }

  const hasSearch = items.some((i) => i.kind === "search");
  const stepLabel = `${items.length} step${items.length === 1 ? "" : "s"}`;
  let header: string;
  if (isLoading) {
    header = hasSearch ? "Researching the web…" : "Thinking…";
  } else if (elapsedMs > 0) {
    header = `Thought for ${Math.max(1, Math.round(elapsedMs / 1000))}s · ${stepLabel}`;
  } else {
    header = `Thought · ${stepLabel}`;
  }

  return (
    <ChainOfThought
      onOpenChange={(o) => {
        userToggled.current = true;
        setOpen(o);
      }}
      open={open}
    >
      <ChainOfThoughtHeader>{header}</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {items.map((item, i) =>
          item.kind === "reasoning" ? (
            <ChainOfThoughtStep
              description={sanitizeText(item.text)}
              icon={BrainIcon}
              // biome-ignore lint/suspicious/noArrayIndexKey: timeline is append-only and stable per render
              key={`r-${i}`}
              label="Thinking"
            />
          ) : (
            <ChainOfThoughtStep
              className={item.state === "active" ? "[&_svg]:animate-spin" : ""}
              icon={item.state === "active" ? Loader2Icon : GlobeIcon}
              // biome-ignore lint/suspicious/noArrayIndexKey: timeline is append-only and stable per render
              key={`s-${i}`}
              label={
                item.state === "active"
                  ? "Searching the web…"
                  : `Searched the web for "${item.query}"`
              }
              status={item.state === "active" ? "active" : "complete"}
            >
              {item.sources.length > 0 && (
                <div className="mt-1.5 flex flex-col gap-1">
                  {item.sources.slice(0, 8).map((s) => (
                    <a
                      className="flex items-center gap-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground"
                      href={s.url}
                      key={s.url}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <SourceFavicon url={s.url} />
                      <span className="truncate">
                        {s.title || domain(s.url)}
                      </span>
                      <span className="shrink-0 text-muted-foreground/40">
                        {domain(s.url)}
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </ChainOfThoughtStep>
          )
        )}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}
