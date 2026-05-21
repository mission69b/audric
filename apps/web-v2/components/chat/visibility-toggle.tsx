"use client";

/**
 * Visibility toggle — flips a chat between `private` and `public`, and
 * surfaces a "Copy link" affordance when the chat is public.
 *
 * Mounted in `audric-chat-client.tsx`'s top bar (only when `chatId` is
 * defined — i.e., a persisted chat exists to toggle). Uses
 * `use-chat-visibility` for client-side SWR cache sync; the underlying
 * mutation goes through `lib/actions/chat-visibility.ts` server action.
 *
 * V0.7e Persistent Chats Phase 4 surface (S.247).
 */

import { CheckIcon, CopyIcon, GlobeIcon, LockIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useChatVisibility } from "@/hooks/use-chat-visibility";

const COPY_FEEDBACK_MS = 1800;

export function VisibilityToggle({
  chatId,
  initialVisibility,
}: {
  chatId: string;
  initialVisibility: "private" | "public";
}) {
  const { visibilityType, setVisibilityType, isPending } = useChatVisibility({
    chatId,
    initialVisibilityType: initialVisibility,
  });
  const [copied, setCopied] = useState(false);
  const isPublic = visibilityType === "public";

  // [P1-G] Awaited + optimistic-with-rollback. Pre-P1-G this called
  // toast.success unconditionally even when the server write failed.
  const handleToggle = async () => {
    const next = isPublic ? "private" : "public";
    try {
      await setVisibilityType(next);
      toast.success(
        next === "public" ? "Chat is now public" : "Chat is now private"
      );
    } catch {
      toast.error("Couldn't update visibility. Please try again.");
    }
  };

  const handleCopy = async () => {
    try {
      const url = `${window.location.origin}/share/${chatId}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Share link copied");
      setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {
      toast.error("Copy failed — clipboard unavailable");
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        aria-label={isPublic ? "Make chat private" : "Make chat public"}
        className="h-8 px-2 text-foreground/70 hover:text-foreground disabled:opacity-50"
        disabled={isPending}
        onClick={handleToggle}
        size="sm"
        title={isPublic ? "Public — anyone with the link can view" : "Private"}
        variant="ghost"
      >
        {isPublic ? (
          <GlobeIcon className="size-4" />
        ) : (
          <LockIcon className="size-4" />
        )}
        <span className="ml-1.5 hidden text-xs sm:inline">
          {isPublic ? "Public" : "Private"}
        </span>
      </Button>
      {isPublic && (
        <Button
          aria-label="Copy share link"
          className="h-8 px-2 text-foreground/70 hover:text-foreground"
          onClick={handleCopy}
          size="sm"
          title="Copy share link"
          variant="ghost"
        >
          {copied ? (
            <CheckIcon className="size-4" />
          ) : (
            <CopyIcon className="size-4" />
          )}
          <span className="ml-1.5 hidden text-xs sm:inline">
            {copied ? "Copied" : "Copy link"}
          </span>
        </Button>
      )}
    </div>
  );
}
