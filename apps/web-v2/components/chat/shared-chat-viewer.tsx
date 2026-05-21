"use client";

/**
 * Public chat viewer — read-only render of a shared chat at `/share/[id]`.
 *
 * v0.7e Persistent Chats Phase 4 (S.247). Mounts WITHOUT `useChat`,
 * `transport`, or any live engine connection. The chat row is server-
 * validated as `visibility === 'public'` before this component
 * receives messages, so no client-side gating is needed.
 *
 * **What's intentionally absent compared to `<AudricChatPanel>`:**
 *   - Prompt input bar (no composing)
 *   - ChipBar / suggested actions (no composing)
 *   - Permission cards (bundle + tool — approvals can't replay)
 *   - Shimmer / thinking states (nothing is streaming)
 *   - sendMessage callback wired to ToolResultRouter (read-only)
 *
 * **Surfaces preserved verbatim:**
 *   - `<Conversation>` / `<ConversationContent>` — same sticky-bottom
 *     scroll container the live chat uses, so saved tool canvases
 *     scroll into view the same way.
 *   - `<Message>` / `<MessageContent>` / `<MessageResponse>` — same
 *     bubble styling (incl. the S.209 dark user bubble).
 *   - `<Reasoning>` extended-thinking accordion — collapsed by default.
 *   - `<ToolResultRouter>` — every tool canvas renders identically
 *     (CanvasCard, balance, swap, etc.). The router accepts an
 *     optional `onSendMessage`; we omit it so any "ask follow-up"
 *     callbacks inside cards no-op silently (signed-out viewers
 *     can't author messages anyway).
 */

import type { ReasoningUIPart, ToolUIPart, UIMessage } from "ai";
import Link from "next/link";
import { Fragment } from "react";
import {
  Conversation,
  ConversationContent,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { ToolResultRouter } from "@/components/audric/tool-result-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SharedChatViewer({
  chatTitle,
  messages,
}: {
  chatTitle: string | null;
  messages: UIMessage[];
}) {
  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex h-12 items-center justify-between border-border/40 border-b px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-semibold text-foreground text-sm">Audric</span>
          <span className="text-foreground/40 text-xs">·</span>
          <span className="truncate text-foreground/60 text-xs">
            {chatTitle ?? "Shared chat"}
          </span>
        </div>
        <Link href="/chat">
          <Button size="sm" variant="secondary">
            Start your own
          </Button>
        </Link>
      </header>
      <Conversation className="flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl gap-3 px-4 py-6">
          {messages.map((m) => (
            <Fragment key={m.id}>
              <Message
                className={cn(m.role === "user" && "items-end")}
                from={m.role}
              >
                <MessageContent
                  className={cn(
                    m.role === "user" &&
                      "w-fit max-w-[min(80%,56ch)] overflow-hidden break-words rounded-2xl rounded-br-[4px] bg-bubble-user-bg px-4 py-2.5 text-bubble-user-fg shadow-[var(--shadow-card)] [&_*]:text-bubble-user-fg"
                  )}
                >
                  {m.parts.map((part, i) => {
                    if (part.type === "text") {
                      return (
                        <MessageResponse
                          // biome-ignore lint/suspicious/noArrayIndexKey: parts are positionally stable per message
                          key={`${m.id}-${i}`}
                        >
                          {part.text}
                        </MessageResponse>
                      );
                    }
                    if (part.type === "reasoning") {
                      const reasoningPart = part as ReasoningUIPart;
                      return (
                        <Reasoning
                          isStreaming={false}
                          // biome-ignore lint/suspicious/noArrayIndexKey: parts are positionally stable per message
                          key={`${m.id}-${i}`}
                        >
                          <ReasoningTrigger />
                          <ReasoningContent>
                            {reasoningPart.text}
                          </ReasoningContent>
                        </Reasoning>
                      );
                    }
                    if (part.type.startsWith("tool-")) {
                      const toolPart = part as ToolUIPart;
                      // Approval-requested parts never survive into a
                      // saved chat — by the time persistence ran, the
                      // user had already responded (output-available
                      // or output-error). Render only the resolved
                      // tool canvases.
                      if (toolPart.state === "approval-requested") {
                        return null;
                      }
                      return (
                        <ToolResultRouter
                          // biome-ignore lint/suspicious/noArrayIndexKey: parts are positionally stable per message
                          key={`${m.id}-${i}`}
                          part={toolPart}
                        />
                      );
                    }
                    // `data-audric-bundle` markers, etc. — read-only viewer
                    // drops them; the individual tool parts inside the
                    // bundle still render via the `tool-*` branch above.
                    return null;
                  })}
                </MessageContent>
              </Message>
            </Fragment>
          ))}
        </ConversationContent>
      </Conversation>
    </div>
  );
}
