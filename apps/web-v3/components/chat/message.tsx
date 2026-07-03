"use client";
import type { UseChatHelpers } from "@ai-sdk/react";
import { BrainIcon, LockIcon } from "lucide-react";
import { allChatModels } from "@/lib/ai/models";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { cn, sanitizeText } from "@/lib/utils";
import { MessageContent, MessageResponse } from "../ai-elements/message";
import { Shimmer } from "../ai-elements/shimmer";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "../ai-elements/tool";
import { BalanceTool } from "./balance-tool";
import { ConfidentialBadge } from "./confidential-badge";
import { type CotItem, CotTimeline } from "./cot-timeline";
import { useDataStream } from "./data-stream-provider";
import { DocumentToolResult } from "./document";
import { DocumentPreview } from "./document-preview";
import { AudricMark, SparklesIcon } from "./icons";

const MODEL_NAMES = new Map(allChatModels.map((m) => [m.id, m.name]));
function modelDisplayName(id: string): string {
  return MODEL_NAMES.get(id) ?? id.split("/").pop() ?? id;
}

import { useUpgradeModal } from "@/components/pricing/upgrade-modal";
import { useArtifact } from "@/hooks/use-artifact";
import { AgentPayTool } from "./agent-pay-tool";
import { ImageSearchResults } from "./image-search-results";
import { InlineImage, InlineImageLoading } from "./inline-image";
import { InlineVideo, InlineVideoLoading } from "./inline-video";
import { MessageActions } from "./message-actions";
import { PreviewAttachment } from "./preview-attachment";
import { type CryptoMarketOutput, PriceCard } from "./price-card";
import { PriceChart, type PriceHistoryOutput } from "./price-chart";
import { SearchResults } from "./search-results";
import { SendTransferTool } from "./send-transfer-tool";
import { StockCard, type StockOutput } from "./stock-card";

/** Slim pulse placeholder while a finance skill is fetching. */
function FinanceCardLoading() {
  return (
    <div className="h-24 w-full max-w-xl animate-pulse rounded-2xl border border-border/40 bg-muted/30" />
  );
}

/** Free daily-image cap reached → a clean upgrade-to-view gate (Venice-style). */
function ImageLimitCard({ message }: { message: string }) {
  const { openUpgrade } = useUpgradeModal();
  return (
    <div className="flex w-[min(100%,420px)] flex-col gap-3 rounded-xl border border-border/40 bg-gradient-to-br from-secondary to-muted p-4">
      <div className="flex items-start gap-2.5">
        <SparklesIcon size={16} />
        <p className="text-[13px] text-foreground leading-relaxed">{message}</p>
      </div>
      <button
        className="inline-flex w-fit items-center justify-center rounded-lg bg-foreground px-3.5 py-1.5 font-medium text-[13px] text-background transition-opacity hover:opacity-90"
        onClick={openUpgrade}
        type="button"
      >
        Upgrade
      </button>
    </div>
  );
}

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
  // The active artifact's kind — used as a fallback for image-update streaming,
  // where the tool output (and its kind) isn't available yet.
  const { artifact } = useArtifact();

  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  const hasAnyContent = message.parts?.some(
    (part) =>
      (part.type === "text" && part.text?.trim().length > 0) ||
      (part.type === "reasoning" &&
        "text" in part &&
        part.text?.trim().length > 0) ||
      part.type === "data-parsed-file" ||
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

  // Group the turn's "work" parts (reasoning + web_search) into the live
  // Chain-of-Thought timeline (rendered once, before the answer). Everything
  // else keeps its own rendering below. Consecutive reasoning chunks merge.
  // The FINAL answer is the trailing text after the last "work" part (reasoning
  // or search). Everything before it — reasoning, searches, AND the model's
  // intermediate narration text ("let me dig deeper…") — belongs in the trace,
  // interleaved in order (Claude-style), not dumped after the searches.
  const allParts = message.parts ?? [];
  let lastWorkIndex = -1;
  allParts.forEach((p, i) => {
    if (p.type === "reasoning" || p.type === "tool-web_search") {
      lastWorkIndex = i;
    }
  });

  const cotItems: CotItem[] = [];
  const pushNarration = (text: string) => {
    if (!text.trim()) {
      return;
    }
    const last = cotItems.at(-1);
    if (last?.kind === "reasoning") {
      last.text += `\n\n${text}`;
    } else {
      cotItems.push({ kind: "reasoning", text });
    }
  };
  allParts.forEach((part, i) => {
    if (part.type === "data-parsed-file") {
      cotItems.push({ kind: "parsed", name: part.data.name });
    } else if (part.type === "reasoning") {
      pushNarration("text" in part ? (part.text ?? "") : "");
    } else if (part.type === "tool-web_search") {
      cotItems.push({
        kind: "search",
        query: part.input?.query ?? "",
        sources:
          part.state === "output-available" ? (part.output?.sources ?? []) : [],
        state:
          part.state === "output-available"
            ? "complete"
            : part.state === "output-error"
              ? "error"
              : "active",
      });
    } else if (part.type === "text" && i < lastWorkIndex) {
      // Intermediate narration between searches → interleave it in the trace.
      pushNarration(part.text ?? "");
    }
  });
  // Perplexity-style visual layer — aggregate every completed search's sources
  // + related images for the card grid / image strip rendered above the answer
  // (search-results.tsx). The CoT timeline above stays the process view.
  const searchSources = allParts.flatMap((p) =>
    p.type === "tool-web_search" && p.state === "output-available"
      ? (p.output?.sources ?? [])
      : []
  );
  const searchImages = allParts.flatMap((p) =>
    p.type === "tool-web_search" && p.state === "output-available"
      ? (p.output?.images ?? [])
      : []
  );

  // Terminal marker once the turn has finished its work. If an image tool
  // errored, mark the turn FAILED (not a misleading "Done" ✓ next to a failed
  // generation). Only when there was visible work and we're not still streaming.
  if (isAssistant && !isLoading && cotItems.length > 0) {
    const imageFailed = allParts.some(
      (p) =>
        (p.type === "tool-generate_image" ||
          p.type === "tool-edit_image" ||
          p.type === "tool-upscale_image") &&
        typeof p.output === "object" &&
        p.output !== null &&
        "error" in p.output
    );
    cotItems.push(
      imageFailed
        ? { kind: "failed", label: "Image generation failed" }
        : { kind: "done" }
    );
  }

  const parts = message.parts?.map((part, index) => {
    const { type } = part;
    const key = `message-${message.id}-part-${index}`;

    // Reasoning + web_search render in the CoT timeline (above), not here. So
    // does intermediate narration text (before the final answer).
    if (type === "reasoning" || type === "tool-web_search") {
      return null;
    }
    if (type === "text" && index < lastWorkIndex) {
      return null;
    }

    if (type === "data-parsed-file") {
      // Rendered as a step in the CoT timeline (above), not in the body.
      return null;
    }

    if (type === "tool-balance_check") {
      return <BalanceTool key={part.toolCallId} part={part} />;
    }

    if (type === "tool-image_search") {
      if (part.state !== "output-available") {
        return (
          <div
            className="grid w-full max-w-2xl grid-cols-2 gap-2 sm:grid-cols-3"
            key={part.toolCallId}
          >
            {[0, 1, 2].map((i) => (
              <div
                className="h-32 animate-pulse rounded-xl bg-muted/30"
                key={i}
              />
            ))}
          </div>
        );
      }
      const out = part.output as
        | { images?: { url: string; origin?: string; title?: string }[] }
        | undefined;
      return (
        <ImageSearchResults images={out?.images ?? []} key={part.toolCallId} />
      );
    }

    // Finance cards — structured skill output → scannable visual anchor
    // (the model still narrates the numbers in its text below the card).
    if (type === "tool-crypto_market") {
      if (part.state !== "output-available") {
        return <FinanceCardLoading key={part.toolCallId} />;
      }
      return (
        <PriceCard
          key={part.toolCallId}
          output={part.output as CryptoMarketOutput}
        />
      );
    }
    if (type === "tool-crypto_history") {
      if (part.state !== "output-available") {
        return <FinanceCardLoading key={part.toolCallId} />;
      }
      return (
        <PriceChart
          key={part.toolCallId}
          output={part.output as PriceHistoryOutput}
        />
      );
    }
    if (type === "tool-stock_analysis") {
      if (part.state !== "output-available") {
        return <FinanceCardLoading key={part.toolCallId} />;
      }
      return (
        <StockCard key={part.toolCallId} output={part.output as StockOutput} />
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
          {isUser ? (
            // User input shows VERBATIM — preserve newlines/indentation/dashes.
            // (Rendering it as markdown reinterpreted "- item" lines into a list
            // and collapsed the formatting the user typed.) Only the assistant's
            // output is markdown-rendered.
            <div className="whitespace-pre-wrap break-words">
              {sanitizeText(part.text)}
            </div>
          ) : (
            <MessageResponse>{sanitizeText(part.text)}</MessageResponse>
          )}
        </MessageContent>
      );
    }

    if (type === "tool-send_transfer") {
      return <SendTransferTool key={part.toolCallId} part={part} />;
    }

    if (type === "tool-agent_pay") {
      return <AgentPayTool key={part.toolCallId} part={part} />;
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

    if (type === "tool-generate_image") {
      const { toolCallId } = part;
      const out = part.output;
      if (out && "error" in out) {
        return (
          <div
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 text-sm dark:bg-red-950/50"
            key={toolCallId}
          >
            {String(out.error)}
          </div>
        );
      }
      if (out && "signInRequired" in out) {
        return (
          <div
            className="rounded-lg border border-border/40 bg-muted/40 p-4 text-muted-foreground text-sm"
            key={toolCallId}
          >
            {out.message}
          </div>
        );
      }
      if (out && "limitReached" in out) {
        return (
          <ImageLimitCard
            key={toolCallId}
            message={
              out.message ??
              "You've reached today's free image limit. Add credits or upgrade for more."
            }
          />
        );
      }
      if (out && "id" in out) {
        return (
          <InlineImage
            documentId={out.id}
            key={toolCallId}
            model={out.model}
            title={out.prompt}
            versionIndex={0}
          />
        );
      }
      return <InlineImageLoading key={toolCallId} />;
    }

    if (type === "tool-edit_image") {
      const { toolCallId } = part;
      const out = part.output;
      if (out && "error" in out) {
        return (
          <div
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 text-sm dark:bg-red-950/50"
            key={toolCallId}
          >
            {String(out.error)}
          </div>
        );
      }
      if (out && "limitReached" in out) {
        return (
          <ImageLimitCard
            key={toolCallId}
            message={
              out.message ??
              "You've reached today's free image limit. Add credits or upgrade for more."
            }
          />
        );
      }
      if (out && "id" in out) {
        return (
          <InlineImage
            documentId={out.id}
            key={toolCallId}
            model={out.model}
            title={out.prompt}
            versionIndex={out.versionIndex}
          />
        );
      }
      return <InlineImageLoading key={toolCallId} />;
    }

    if (type === "tool-upscale_image") {
      const { toolCallId } = part;
      const out = part.output;
      if (out && "error" in out) {
        return (
          <div
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 text-sm dark:bg-red-950/50"
            key={toolCallId}
          >
            {String(out.error)}
          </div>
        );
      }
      if (out && "limitReached" in out) {
        return (
          <ImageLimitCard
            key={toolCallId}
            message={
              out.message ??
              "You've reached today's free image limit. Add credits or upgrade for more."
            }
          />
        );
      }
      if (out && "id" in out) {
        return (
          <InlineImage
            documentId={out.id}
            key={toolCallId}
            model={out.model}
            title={out.prompt}
            versionIndex={out.versionIndex}
          />
        );
      }
      return <InlineImageLoading key={toolCallId} />;
    }

    if (type === "tool-generate_video") {
      const { toolCallId } = part;
      const out = part.output;
      if (out && "error" in out) {
        return (
          <div
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 text-sm dark:bg-red-950/50"
            key={toolCallId}
          >
            {String(out.error)}
          </div>
        );
      }
      if (out && "signInRequired" in out) {
        return (
          <div
            className="rounded-lg border border-border/40 bg-muted/40 p-4 text-muted-foreground text-sm"
            key={toolCallId}
          >
            {out.message}
          </div>
        );
      }
      if (out && "upgradeRequired" in out) {
        return (
          <ImageLimitCard
            key={toolCallId}
            message={
              out.message ??
              "Video generation is a Pro feature. Add credits or upgrade for more."
            }
          />
        );
      }
      if (out && "url" in out) {
        return (
          <InlineVideo key={toolCallId} title={out.prompt} url={out.url} />
        );
      }
      return <InlineVideoLoading key={toolCallId} />;
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

      // Backwards-compat: createDocument is now code/sheet only, but OLD chats
      // have createDocument(kind:'image') parts — keep rendering those inline.
      // (New images use tool-generate_image above.)
      const docKind = (part.output?.kind ?? part.input?.kind) as string;
      if (docKind === "image") {
        if (part.output?.id) {
          return (
            <InlineImage
              documentId={part.output.id}
              key={toolCallId}
              title={part.output.title}
              versionIndex={0}
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

      // Image updates render inline (like create) — NOT the doc-preview card,
      // which showed the full generation prompt as a title (leak) + a faded
      // image. During streaming the tool output (hence its kind) isn't ready and
      // updateDocument's input carries no kind, so fall back to the active
      // artifact's kind — otherwise an image refinement briefly flashed the
      // doc-preview card mid-generation.
      const updKind =
        part.output?.kind ?? (part.output ? undefined : artifact.kind);
      if (updKind === "image") {
        return part.output?.id ? (
          <InlineImage
            documentId={part.output.id}
            key={toolCallId}
            title={part.output.title}
            versionIndex={part.output.versionIndex}
          />
        ) : (
          <InlineImageLoading key={toolCallId} />
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

  // Surface what "Auto" chose this turn — makes the routing intelligence
  // visible (only on Auto-routed turns; explicit picks already show in the
  // composer switcher).
  const modelBadge =
    isAssistant && message.metadata?.autoRouted && message.metadata?.modelId ? (
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
        <SparklesIcon size={10} />
        <span>Auto · {modelDisplayName(message.metadata.modelId)}</span>
      </div>
    ) : null;

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
  // Guard hard: if the turn did ANY visible work (a CoT step — reasoning, a
  // search, or a parsed file), it is NOT empty, so the fallback can never show
  // alongside a real answer/trace (a transient mid-stream state once did).
  const isEmptyAssistant =
    isAssistant && !isLoading && !hasAnyContent && cotItems.length === 0;

  const content = isThinking ? (
    <div className="flex h-[calc(13px*1.65)] items-center text-[13px] leading-[1.65]">
      <Shimmer className="font-medium" duration={1}>
        Thinking...
      </Shimmer>
    </div>
  ) : (
    <>
      {attachments}
      {isAssistant && (
        <CotTimeline
          isLoading={isLoading}
          items={cotItems}
          startedAt={
            message.metadata?.createdAt
              ? Date.parse(message.metadata.createdAt)
              : undefined
          }
        />
      )}
      {isAssistant && (searchSources.length > 0 || searchImages.length > 0) && (
        <SearchResults images={searchImages} sources={searchSources} />
      )}
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
      {modelBadge}
      {isAssistant && <ConfidentialBadge message={message} />}
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
              <AudricMark size={13} />
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
          <AudricMark size={13} />
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
