import equal from "fast-deep-equal";
import { type MouseEvent, memo } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { useCopyToClipboard } from "usehooks-ts";
import { useArtifact } from "@/hooks/use-artifact";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";
import {
  MessageAction as Action,
  MessageActions as Actions,
} from "../ai-elements/message";
import {
  CopyIcon,
  FileIcon,
  PencilEditIcon,
  ThumbDownIcon,
  ThumbUpIcon,
} from "./icons";

/** Min inline-text length before we offer "Open as document". */
const OPEN_AS_DOCUMENT_MIN_CHARS = 400;

/** Derive a short document title from the message's first meaningful line. */
function deriveDocumentTitle(text: string): string {
  const firstLine =
    text
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "Document";
  const clean = firstLine
    .replace(/^#+\s*/, "")
    .replace(/[*_`>#]/g, "")
    .trim();
  if (!clean) {
    return "Document";
  }
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
}

export function PureMessageActions({
  chatId,
  message,
  vote,
  isLoading,
  onEdit,
}: {
  chatId: string;
  message: ChatMessage;
  vote: Vote | undefined;
  isLoading: boolean;
  onEdit?: () => void;
}) {
  const { mutate } = useSWRConfig();
  const [_, copyToClipboard] = useCopyToClipboard();
  const { setArtifact } = useArtifact();

  if (isLoading) {
    return null;
  }

  const textFromParts = message.parts
    ?.filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();

  const handleCopy = async () => {
    if (!textFromParts) {
      toast.error("There's no text to copy!");
      return;
    }

    await copyToClipboard(textFromParts);
    toast.success("Copied to clipboard!");
  };

  const canOpenAsDocument =
    !!textFromParts && textFromParts.length >= OPEN_AS_DOCUMENT_MIN_CHARS;

  const handleOpenAsDocument = (event: MouseEvent<HTMLButtonElement>) => {
    if (!textFromParts) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const id = generateUUID();
    const title = deriveDocumentTitle(textFromParts);

    const promote = fetch(
      `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/document?id=${id}`,
      {
        method: "POST",
        body: JSON.stringify({ content: textFromParts, title, kind: "text" }),
      }
    ).then((res) => {
      if (!res.ok) {
        throw new Error("Failed to create document");
      }
      setArtifact({
        documentId: id,
        title,
        kind: "text",
        content: textFromParts,
        status: "idle",
        isVisible: true,
        boundingBox: {
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
        },
      });
    });

    toast.promise(promote, {
      loading: "Opening as document…",
      success: "Opened as document",
      error: "Couldn't open as document",
    });
  };

  if (message.role === "user") {
    return (
      <Actions className="-mr-0.5 justify-end opacity-0 transition-opacity duration-150 group-hover/message:opacity-100">
        <div className="flex items-center gap-0.5">
          {onEdit && (
            <Action
              className="size-7 text-muted-foreground/50 hover:text-foreground"
              data-testid="message-edit-button"
              onClick={onEdit}
              tooltip="Edit"
            >
              <PencilEditIcon />
            </Action>
          )}
          <Action
            className="size-7 text-muted-foreground/50 hover:text-foreground"
            onClick={handleCopy}
            tooltip="Copy"
          >
            <CopyIcon />
          </Action>
        </div>
      </Actions>
    );
  }

  return (
    <Actions className="-ml-0.5 opacity-0 transition-opacity duration-150 group-hover/message:opacity-100">
      <Action
        className="text-muted-foreground/50 hover:text-foreground"
        onClick={handleCopy}
        tooltip="Copy"
      >
        <CopyIcon />
      </Action>

      {canOpenAsDocument && (
        <Action
          className="text-muted-foreground/50 hover:text-foreground"
          data-testid="message-open-as-document"
          onClick={handleOpenAsDocument}
          tooltip="Open as document"
        >
          <FileIcon size={16} />
        </Action>
      )}

      <Action
        className="text-muted-foreground/50 hover:text-foreground"
        data-testid="message-upvote"
        disabled={vote?.isUpvoted}
        onClick={() => {
          const upvote = fetch(
            `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/vote`,
            {
              method: "PATCH",
              body: JSON.stringify({
                chatId,
                messageId: message.id,
                type: "up",
              }),
            }
          ).then((res) => {
            // Anon (no account) → 401: don't show a fake success.
            if (!res.ok) {
              throw new Error("vote failed");
            }
            return res;
          });

          toast.promise(upvote, {
            loading: "Upvoting Response...",
            success: () => {
              mutate<Vote[]>(
                `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/vote?chatId=${chatId}`,
                (currentVotes) => {
                  if (!currentVotes) {
                    return [];
                  }

                  const votesWithoutCurrent = currentVotes.filter(
                    (currentVote) => currentVote.messageId !== message.id
                  );

                  return [
                    ...votesWithoutCurrent,
                    {
                      chatId,
                      messageId: message.id,
                      isUpvoted: true,
                    },
                  ];
                },
                { revalidate: false }
              );

              return "Upvoted Response!";
            },
            error: "Sign in to vote on responses.",
          });
        }}
        tooltip="Upvote Response"
      >
        <ThumbUpIcon />
      </Action>

      <Action
        className="text-muted-foreground/50 hover:text-foreground"
        data-testid="message-downvote"
        disabled={vote && !vote.isUpvoted}
        onClick={() => {
          const downvote = fetch(
            `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/vote`,
            {
              method: "PATCH",
              body: JSON.stringify({
                chatId,
                messageId: message.id,
                type: "down",
              }),
            }
          ).then((res) => {
            if (!res.ok) {
              throw new Error("vote failed");
            }
            return res;
          });

          toast.promise(downvote, {
            loading: "Downvoting Response...",
            success: () => {
              mutate<Vote[]>(
                `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/vote?chatId=${chatId}`,
                (currentVotes) => {
                  if (!currentVotes) {
                    return [];
                  }

                  const votesWithoutCurrent = currentVotes.filter(
                    (currentVote) => currentVote.messageId !== message.id
                  );

                  return [
                    ...votesWithoutCurrent,
                    {
                      chatId,
                      messageId: message.id,
                      isUpvoted: false,
                    },
                  ];
                },
                { revalidate: false }
              );

              return "Downvoted Response!";
            },
            error: "Sign in to vote on responses.",
          });
        }}
        tooltip="Downvote Response"
      >
        <ThumbDownIcon />
      </Action>
    </Actions>
  );
}

export const MessageActions = memo(
  PureMessageActions,
  (prevProps, nextProps) => {
    if (!equal(prevProps.vote, nextProps.vote)) {
      return false;
    }
    if (prevProps.isLoading !== nextProps.isLoading) {
      return false;
    }

    return true;
  }
);
