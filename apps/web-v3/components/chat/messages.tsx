import type { UseChatHelpers } from "@ai-sdk/react";
import { ArrowDownIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { useMessages } from "@/hooks/use-messages";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useDataStream } from "./data-stream-provider";
import { FollowupSuggestions } from "./followup-suggestions";
import { Greeting } from "./greeting";
import { PreviewMessage, ThinkingMessage } from "./message";

function extractText(message: ChatMessage | undefined): string {
  if (!message) {
    return "";
  }
  return message.parts
    .filter(
      (part): part is { type: "text"; text: string } => part.type === "text"
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}

type MessagesProps = {
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  chatId: string;
  status: UseChatHelpers<ChatMessage>["status"];
  votes: Vote[] | undefined;
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  isReadonly: boolean;
  isArtifactVisible: boolean;
  isLoading?: boolean;
  selectedModelId: string;
  onEditMessage?: (message: ChatMessage) => void;
};

function PureMessages({
  addToolApprovalResponse,
  chatId,
  status,
  votes,
  messages,
  setMessages,
  regenerate,
  isReadonly,
  isArtifactVisible,
  isLoading,
  selectedModelId: _selectedModelId,
  onEditMessage,
}: MessagesProps) {
  const {
    containerRef: messagesContainerRef,
    endRef: messagesEndRef,
    isAtBottom,
    scrollToBottom,
    onViewportLeave,
    hasSentMessage,
    reset,
  } = useMessages({
    status,
  });

  useDataStream();

  const isGenerating = status === "submitted" || status === "streaming";

  const prevChatIdRef = useRef(chatId);
  const sawStreamingRef = useRef(false);
  const didReopenScrollRef = useRef(false);

  useEffect(() => {
    if (prevChatIdRef.current !== chatId) {
      prevChatIdRef.current = chatId;
      reset();
      sawStreamingRef.current = false;
      didReopenScrollRef.current = false;
    }
  }, [chatId, reset]);

  useEffect(() => {
    if (status === "submitted" || status === "streaming") {
      sawStreamingRef.current = true;
    }
  }, [status]);

  // Principle #11 — a chat reopened with history lands at the LAST USER MESSAGE
  // (near the top), not the absolute bottom. One-shot, and only for a chat loaded
  // from history (never streamed in this session) — a live/new chat keeps
  // bottom-follow so the streaming reply stays in view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: messagesContainerRef is a stable ref from useScrollToBottom
  useEffect(() => {
    if (
      didReopenScrollRef.current ||
      sawStreamingRef.current ||
      status !== "ready" ||
      messages.length === 0
    ) {
      return;
    }
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }
    const userNodes = container.querySelectorAll('[data-role="user"]');
    const lastUser = userNodes.item(userNodes.length - 1) as HTMLElement | null;
    if (!lastUser) {
      return;
    }
    didReopenScrollRef.current = true;
    // Mark not-at-bottom first so the auto-follow observer doesn't yank to the
    // bottom in the same frame, then pin the last user turn near the top.
    onViewportLeave();
    requestAnimationFrame(() => {
      lastUser.scrollIntoView({ block: "start", behavior: "instant" });
    });
  }, [messages.length, status, onViewportLeave]);

  return (
    <div className="relative flex-1 bg-background">
      {messages.length === 0 && !isLoading && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <Greeting />
        </div>
      )}
      <div
        className={cn(
          "absolute inset-0 touch-pan-y overflow-y-auto",
          messages.length > 0 ? "bg-background" : "bg-transparent"
        )}
        ref={messagesContainerRef}
        style={isArtifactVisible ? { scrollbarWidth: "none" } : undefined}
      >
        <div className="mx-auto flex min-h-full min-w-0 max-w-4xl flex-col gap-5 px-2 py-6 md:gap-7 md:px-4">
          {messages.map((message, index) => (
            <PreviewMessage
              addToolApprovalResponse={addToolApprovalResponse}
              chatId={chatId}
              isLoading={
                status === "streaming" && messages.length - 1 === index
              }
              isReadonly={isReadonly}
              key={message.id}
              message={message}
              onEdit={onEditMessage}
              regenerate={regenerate}
              requiresScrollPadding={
                hasSentMessage && index === messages.length - 1
              }
              setMessages={setMessages}
              vote={
                votes
                  ? votes.find((vote) => vote.messageId === message.id)
                  : undefined
              }
            />
          ))}

          {status === "submitted" && messages.at(-1)?.role !== "assistant" && (
            <ThinkingMessage />
          )}

          {(() => {
            const last = messages.at(-1);
            const assistantText = extractText(last);
            // Only after a settled assistant reply that actually said something
            // (skip pure tool-call / pending-approval turns and shared/readonly).
            if (
              status !== "ready" ||
              isReadonly ||
              last?.role !== "assistant" ||
              !assistantText
            ) {
              return null;
            }
            const userText = extractText(messages.at(-2));
            const context = `User: ${userText}\n\nAssistant: ${assistantText}`;
            return (
              <FollowupSuggestions
                context={context}
                key={last.id}
                messageId={last.id}
              />
            );
          })()}

          <div
            className="min-h-[24px] min-w-[24px] shrink-0"
            ref={messagesEndRef}
          />
        </div>
      </div>

      <button
        aria-label={
          isGenerating ? "Jump to the reply being written" : "Scroll to latest"
        }
        className={cn(
          "absolute bottom-4 left-1/2 z-10 flex h-7 -translate-x-1/2 items-center gap-1.5 rounded-full border border-border/50 bg-card/90 px-3 font-medium text-[10px] text-muted-foreground shadow-[var(--shadow-float)] backdrop-blur-lg transition-all duration-200",
          isAtBottom
            ? "pointer-events-none scale-90 opacity-0"
            : "pointer-events-auto scale-100 opacity-100"
        )}
        onClick={() => scrollToBottom("smooth")}
        type="button"
      >
        {isGenerating ? (
          <>
            <span className="size-1.5 animate-pulse rounded-full bg-primary" />
            <span>Replying</span>
            <ArrowDownIcon className="size-3" />
          </>
        ) : (
          <ArrowDownIcon className="size-3" />
        )}
      </button>
    </div>
  );
}

export const Messages = PureMessages;
