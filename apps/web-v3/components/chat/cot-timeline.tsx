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

/** Clean, readable URL: host + path, no protocol / query / hash / trailing slash
 * (e.g. "greycoder.com/best-privacy-ai"). The full location minus the noise. */
function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname.replace(/\/$/, "");
    return path && path !== "/" ? `${host}${path}` : host;
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
  // True turn start (ms) from message metadata — stable now (server stamps it
  // once on start AND finish), so "Thought for Xs" reflects wall-clock (routing
  // + model TTFT + searches), not just the visible streaming window. Falls back
  // to mount for historical messages (metadata isn't persisted → no duration).
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
                  : `Searched the web for "${item.query}"${item.sources.length ? ` · ${item.sources.length} results` : ""}`
              }
              status={item.state === "active" ? "active" : "complete"}
            >
              {item.sources.length > 0 && (
                <div className="mt-2 flex max-h-72 flex-col overflow-y-auto overflow-x-hidden rounded-lg border border-border/40">
                  {item.sources.map((s) => {
                    const d = domain(s.url);
                    const pretty = prettyUrl(s.url);
                    const title = s.title && s.title !== d ? s.title : null;
                    return (
                      <a
                        className="flex items-start gap-2 border-border/30 border-b px-3 py-2 text-xs transition-colors last:border-b-0 hover:bg-accent/40"
                        href={s.url}
                        key={s.url}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        <GlobeIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/40" />
                        <span className="flex min-w-0 flex-1 flex-col">
                          {title && (
                            <span className="truncate text-foreground/80">
                              {title}
                            </span>
                          )}
                          <span className="truncate text-muted-foreground/50">
                            {pretty}
                          </span>
                        </span>
                      </a>
                    );
                  })}
                </div>
              )}
            </ChainOfThoughtStep>
          )
        )}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}
