"use client";

import { BrainIcon, GlobeIcon, Loader2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtSearchResult,
  ChainOfThoughtSearchResults,
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
                <ChainOfThoughtSearchResults>
                  {item.sources.slice(0, 6).map((s) => (
                    <ChainOfThoughtSearchResult key={s.url}>
                      {domain(s.url)}
                    </ChainOfThoughtSearchResult>
                  ))}
                </ChainOfThoughtSearchResults>
              )}
            </ChainOfThoughtStep>
          )
        )}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}
