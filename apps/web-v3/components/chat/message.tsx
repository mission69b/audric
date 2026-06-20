"use client";
import type { UseChatHelpers } from "@ai-sdk/react";
import { BrainIcon, LockIcon } from "lucide-react";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { cn, sanitizeText } from "@/lib/utils";
import { MessageContent, MessageResponse } from "../ai-elements/message";
import { Shimmer } from "../ai-elements/shimmer";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "../ai-elements/sources";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "../ai-elements/tool";
import { BalanceTool } from "./balance-tool";
import { useDataStream } from "./data-stream-provider";
import { DocumentToolResult } from "./document";
import { DocumentPreview } from "./document-preview";
import { SparklesIcon } from "./icons";
import { InlineImage, InlineImageLoading } from "./inline-image";
import { MessageActions } from "./message-actions";
import { MessageReasoning } from "./message-reasoning";
import { PreviewAttachment } from "./preview-attachment";
import { RecipeRunTool } from "./recipe-run-tool";
import { SendTransferTool } from "./send-transfer-tool";
import { TeeReceiptBadge } from "./tee-receipt-badge";

const PurePreviewMessage = ({
  // Native AI-SDK HITL approval handler — threaded as reusable infra for any
  // future server tool with `needsApproval` (no current consumer).
  addToolApprovalResponse: _addToolApprovalResponse,
  chatId,
  message,
  vote,
  isLoading,
  setMessages: _setMessages,
  regenerate: _regenerate,
  isReadonly,
  requiresScrollPadding: _requiresScrollPadding,
  onEdit,
}: {
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  chatId: string;
  message: ChatMessage;
  vote: Vote | undefined;
  isLoading: boolean;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  isReadonly: boolean;
  requiresScrollPadding: boolean;
  onEdit?: (message: ChatMessage) => void;
}) => {
  const attachmentsFromMessage = message.parts.filter(
    (part) => part.type === "file"
  );

  useDataStream();

  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  const hasAnyContent = message.parts?.some(
    (part) =>
      (part.type === "text" && part.text?.trim().length > 0) ||
      (part.type === "reasoning" &&
        "text" in part &&
        part.text?.trim().length > 0) ||
      part.type.startsWith("tool-")
  );
  const isThinking = isAssistant && isLoading && !hasAnyContent;

  const attachments = attachmentsFromMessage.length > 0 && (
    <div
      className="flex flex-row justify-end gap-2"
      data-testid={"message-attachments"}
    >
      {attachmentsFromMessage.map((attachment) => (
        <PreviewAttachment
          attachment={{
            name: attachment.filename ?? "file",
            contentType: attachment.mediaType,
            url: attachment.url,
          }}
          key={attachment.url}
        />
      ))}
    </div>
  );

  const mergedReasoning = message.parts?.reduce(
    (acc, part) => {
      if (part.type === "reasoning" && part.text?.trim().length > 0) {
        return {
          text: acc.text ? `${acc.text}\n\n${part.text}` : part.text,
          isStreaming: "state" in part ? part.state === "streaming" : false,
          rendered: false,
        };
      }
      return acc;
    },
    { text: "", isStreaming: false, rendered: false }
  ) ?? { text: "", isStreaming: false, rendered: false };

  const parts = message.parts?.map((part, index) => {
    const { type } = part;
    const key = `message-${message.id}-part-${index}`;

    if (type === "reasoning") {
      if (!mergedReasoning.rendered && mergedReasoning.text) {
        mergedReasoning.rendered = true;
        return (
          <MessageReasoning
            isLoading={isLoading || mergedReasoning.isStreaming}
            key={key}
            reasoning={mergedReasoning.text}
          />
        );
      }
      return null;
    }

    if (type === "data-tee-receipt") {
      return (
        <TeeReceiptBadge
          key={key}
          model={part.data.model}
          responseId={part.data.responseId}
        />
      );
    }

    if (type === "tool-balance_check") {
      return <BalanceTool key={part.toolCallId} part={part} />;
    }

    if (type === "tool-web_search") {
      const { toolCallId, state } = part;
      if (state === "output-available") {
        const sources = part.output?.sources ?? [];
        if (sources.length === 0) {
          return null;
        }
        return (
          <Sources key={toolCallId}>
            <SourcesTrigger count={sources.length} />
            <SourcesContent>
              {sources.map((s) => (
                <Source
                  href={s.url}
                  key={`${toolCallId}-${s.url}`}
                  title={s.title}
                />
              ))}
            </SourcesContent>
          </Sources>
        );
      }
      if (state === "output-error") {
        return null;
      }
      // input-streaming / input-available → searching
      return (
        <div className="mb-2 flex items-center gap-2 text-sm" key={toolCallId}>
          <Shimmer>Searching the web…</Shimmer>
        </div>
      );
    }

    if (type === "text") {
      return (
        <MessageContent
          className={cn("text-[13px] leading-[1.65]", {
            "w-fit max-w-[min(80%,56ch)] overflow-hidden break-words rounded-2xl rounded-br-lg border border-border/30 bg-gradient-to-br from-secondary to-muted px-3.5 py-2 shadow-[var(--shadow-card)]":
              message.role === "user",
          })}
          data-testid="message-content"
          key={key}
        >
          <MessageResponse>{sanitizeText(part.text)}</MessageResponse>
        </MessageContent>
      );
    }

    if (type === "tool-send_transfer") {
      return <SendTransferTool key={part.toolCallId} part={part} />;
    }

    if (type === "tool-run_recipe") {
      return <RecipeRunTool key={part.toolCallId} part={part} />;
    }

    if (type === "tool-save_memory") {
      const out = part.output as
        | { saved?: boolean; fact?: string; error?: string }
        | undefined;
      if (!out) {
        return (
          <div
            className="text-muted-foreground text-xs italic"
            key={part.toolCallId}
          >
            Saving to memory…
          </div>
        );
      }
      return (
        <div
          className="flex items-center gap-1.5 text-muted-foreground text-xs"
          key={part.toolCallId}
        >
          <BrainIcon className="size-3.5" />
          {out.saved ? (
            <span className="flex flex-wrap items-center gap-x-1.5">
              <span>Saved to memory: {out.fact}</span>
              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground/60">
                <LockIcon className="size-2.5" />
                encrypted · yours to delete
              </span>
            </span>
          ) : (
            <span className="text-amber-600">
              Couldn't save to memory{out.error ? `: ${out.error}` : ""}.
            </span>
          )}
        </div>
      );
    }

    if (type === "tool-createDocument") {
      const { toolCallId } = part;

      if (part.output && "error" in part.output) {
        return (
          <div
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 dark:bg-red-950/50"
            key={toolCallId}
          >
            Error creating document: {String(part.output.error)}
          </div>
        );
      }

      // Generated images render inline (ChatGPT-style) instead of the doc-
      // preview card — a clean "Creating image…" placeholder while generating,
      // the inline image once ready. Other kinds keep the artifact preview.
      const docKind = part.output?.kind ?? part.input?.kind;
      if (docKind === "image") {
        if (part.output?.id) {
          return (
            <InlineImage
              documentId={part.output.id}
              key={toolCallId}
              title={part.output.title}
            />
          );
        }
        return <InlineImageLoading key={toolCallId} />;
      }

      return (
        <DocumentPreview
          isReadonly={isReadonly}
          key={toolCallId}
          result={part.output}
        />
      );
    }

    if (type === "tool-updateDocument") {
      const { toolCallId } = part;

      if (part.output && "error" in part.output) {
        return (
          <div
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 dark:bg-red-950/50"
            key={toolCallId}
          >
            Error updating document: {String(part.output.error)}
          </div>
        );
      }

      return (
        <div className="relative" key={toolCallId}>
          <DocumentPreview
            args={{ ...part.output, isUpdate: true }}
            isReadonly={isReadonly}
            result={part.output}
          />
        </div>
      );
    }

    if (type === "tool-requestSuggestions") {
      const { toolCallId, state } = part;

      return (
        <Tool
          className="w-[min(100%,450px)]"
          defaultOpen={true}
          key={toolCallId}
        >
          <ToolHeader state={state} type="tool-requestSuggestions" />
          <ToolContent>
            {state === "input-available" && <ToolInput input={part.input} />}
            {state === "output-available" && (
              <ToolOutput
                errorText={undefined}
                output={
                  "error" in part.output ? (
                    <div className="rounded border p-2 text-red-500">
                      Error: {String(part.output.error)}
                    </div>
                  ) : (
                    <DocumentToolResult
                      isReadonly={isReadonly}
                      result={part.output}
                      type="request-suggestions"
                    />
                  )
                }
              />
            )}
          </ToolContent>
        </Tool>
      );
    }

    return null;
  });

  const actions = !isReadonly && (
    <MessageActions
      chatId={chatId}
      isLoading={isLoading}
      key={`action-${message.id}`}
      message={message}
      onEdit={onEdit ? () => onEdit(message) : undefined}
      vote={vote}
    />
  );

  // Never render a blank assistant turn (e.g. a model that finished with no text
  // and no tool output) — surface a short, honest fallback instead of silence.
  const isEmptyAssistant = isAssistant && !isLoading && !hasAnyContent;

  const content = isThinking ? (
    <div className="flex h-[calc(13px*1.65)] items-center text-[13px] leading-[1.65]">
      <Shimmer className="font-medium" duration={1}>
        Thinking...
      </Shimmer>
    </div>
  ) : (
    <>
      {attachments}
      {isEmptyAssistant ? (
        <MessageContent className="text-[13px] leading-[1.65]">
          <MessageResponse>
            I didn't quite catch that — could you rephrase or add a bit more
            detail?
          </MessageResponse>
        </MessageContent>
      ) : (
        parts
      )}
      {actions}
    </>
  );

  return (
    <div
      className={cn(
        "group/message w-full",
        !isAssistant && "animate-[fade-up_0.25s_cubic-bezier(0.22,1,0.36,1)]"
      )}
      data-role={message.role}
      data-testid={`message-${message.role}`}
    >
      <div
        className={cn(
          isUser ? "flex flex-col items-end gap-2" : "flex items-start gap-3"
        )}
      >
        {isAssistant && (
          <div className="flex h-[calc(13px*1.65)] shrink-0 items-center">
            <div className="flex size-7 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground ring-1 ring-border/50">
              <SparklesIcon size={13} />
            </div>
          </div>
        )}
        {isAssistant ? (
          <div className="flex min-w-0 flex-1 flex-col gap-2">{content}</div>
        ) : (
          content
        )}
      </div>
    </div>
  );
};

export const PreviewMessage = PurePreviewMessage;

export const ThinkingMessage = () => (
  <div
    className="group/message w-full"
    data-role="assistant"
    data-testid="message-assistant-loading"
  >
    <div className="flex items-start gap-3">
      <div className="flex h-[calc(13px*1.65)] shrink-0 items-center">
        <div className="flex size-7 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground ring-1 ring-border/50">
          <SparklesIcon size={13} />
        </div>
      </div>

      <div className="flex h-[calc(13px*1.65)] items-center text-[13px] leading-[1.65]">
        <Shimmer className="font-medium" duration={1}>
          Thinking...
        </Shimmer>
      </div>
    </div>
  </div>
);
