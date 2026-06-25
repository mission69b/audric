"use client";

import {
  BrainIcon,
  CheckIcon,
  FileTextIcon,
  GlobeIcon,
  Loader2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import { MessageResponse } from "@/components/ai-elements/message";
import { sanitizeText } from "@/lib/utils";

export type CotItem =
  | { kind: "reasoning"; text: string }
  | { kind: "parsed"; name: string }
  | { kind: "done" }
  | { kind: "failed"; label: string }
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
  // A non-reasoning step (parsed a file / searched) → the turn "Worked", not
  // just "Thought" (Venice-style framing — more accurate than calling a parse
  // "thinking").
  const hasWork = items.some((i) => i.kind === "search" || i.kind === "parsed");
  // "Done" is a terminal marker, not a work step — don't count it.
  const stepCount = items.filter((i) => i.kind !== "done").length;
  const stepLabel = `${stepCount} step${stepCount === 1 ? "" : "s"}`;
  let header: string;
  if (isLoading) {
    if (hasSearch) {
      header = "Researching the web…";
    } else {
      header = hasWork ? "Working…" : "Thinking…";
    }
  } else {
    const verb = hasWork ? "Worked" : "Thought";
    header =
      elapsedMs > 0
        ? `${verb} for ${Math.max(1, Math.round(elapsedMs / 1000))}s · ${stepLabel}`
        : `${verb} · ${stepLabel}`;
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
        {items.map((item, i) => {
          if (item.kind === "parsed") {
            return (
              <ChainOfThoughtStep
                icon={FileTextIcon}
                // biome-ignore lint/suspicious/noArrayIndexKey: timeline is append-only and stable per render
                key={`p-${i}`}
                label={`Parsed ${item.name}`}
                status="complete"
              />
            );
          }
          if (item.kind === "done") {
            return (
              <ChainOfThoughtStep
                icon={CheckIcon}
                // biome-ignore lint/suspicious/noArrayIndexKey: timeline is append-only and stable per render
                key={`d-${i}`}
                label="Done"
                status="complete"
              />
            );
          }
          if (item.kind === "failed") {
            return (
              <ChainOfThoughtStep
                className="text-amber-600 dark:text-amber-500 [&_svg]:text-amber-600 dark:[&_svg]:text-amber-500"
                icon={TriangleAlertIcon}
                // biome-ignore lint/suspicious/noArrayIndexKey: timeline is append-only and stable per render
                key={`f-${i}`}
                label={item.label}
                status="complete"
              />
            );
          }
          return item.kind === "reasoning" ? (
            <ChainOfThoughtStep
              icon={BrainIcon}
              // biome-ignore lint/suspicious/noArrayIndexKey: timeline is append-only and stable per render
              key={`r-${i}`}
              label="Thinking"
            >
              {/* Render the model's reasoning as markdown (bold, numbered lists)
                  — not a flattened blob or raw ** characters. */}
              <MessageResponse className="text-muted-foreground text-xs leading-relaxed [&_li]:my-0.5 [&_ol]:my-1.5 [&_p]:my-1.5 [&_ul]:my-1.5">
                {sanitizeText(item.text)}
              </MessageResponse>
            </ChainOfThoughtStep>
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
                <div className="mt-2 flex max-h-60 flex-col overflow-y-auto overflow-x-hidden rounded-lg border border-border/40">
                  {item.sources.map((s) => {
                    const d = domain(s.url);
                    const title = s.title && s.title !== d ? s.title : null;
                    return (
                      <a
                        className="flex items-center gap-2 border-border/30 border-b px-3 py-2 text-xs transition-colors last:border-b-0 hover:bg-accent/40"
                        href={s.url}
                        key={s.url}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        <GlobeIcon className="size-3.5 shrink-0 text-muted-foreground/40" />
                        {title ? (
                          <>
                            <span className="min-w-0 flex-1 truncate text-foreground/80">
                              {title}
                            </span>
                            <span className="shrink-0 text-muted-foreground/50">
                              {d}
                            </span>
                          </>
                        ) : (
                          <span className="min-w-0 flex-1 truncate text-foreground/80">
                            {d}
                          </span>
                        )}
                      </a>
                    );
                  })}
                </div>
              )}
            </ChainOfThoughtStep>
          );
        })}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}
