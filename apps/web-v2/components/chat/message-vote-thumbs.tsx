/**
 * MessageVoteThumbs — minimal LOCK-2 vote surface.
 *
 * **Why this exists.** v0.7e Persistent Chats kept the `Vote` schema +
 * `/api/vote` endpoint per LOCK-2 (eval signal), but the original
 * template `<MessageActions>` thumbs UI was deleted with the rest of
 * the template debris. Without a UI surface, the `/api/vote` endpoint
 * captures zero signal — defeating the LOCK-2 intent.
 *
 * This component restores the minimum viable thumbs UI: two small
 * icon-buttons after each assistant message. Click → POST /api/vote
 * with the optimistic flip → toast on success/failure.
 *
 * Kept intentionally tiny (~50 LoC, no SWR cache) so it's easy to
 * delete or upgrade when the eval-signal product story matures.
 */

"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth-fetch";
import { cn } from "@/lib/utils";

export type VoteState = "up" | "down" | null;

export function MessageVoteThumbs({
  chatId,
  messageId,
  initialVote = null,
}: {
  chatId: string;
  messageId: string;
  /**
   * Seed value for the vote state on mount. Used by audric-chat-client
   * to hydrate prior votes from GET /api/vote on chat load — pre-P5.3
   * this defaulted to null and every reload lost the prior thumbs.
   * See SPEC_AI_SDK_HARDENING P5.3.
   */
  initialVote?: VoteState;
}) {
  const [vote, setVote] = useState<VoteState>(initialVote);
  const [isPending, setIsPending] = useState(false);

  const handleVote = async (type: "up" | "down") => {
    if (isPending) {
      return;
    }
    const prior = vote;
    setVote(type);
    setIsPending(true);
    try {
      const res = await authFetch("/api/vote", {
        body: JSON.stringify({ chatId, messageId, type }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      if (!res.ok) {
        throw new Error(`vote failed: ${res.status}`);
      }
      toast.success(type === "up" ? "Thanks for the feedback" : "Got it");
    } catch {
      setVote(prior);
      toast.error("Couldn't record vote. Please try again.");
    } finally {
      setIsPending(false);
    }
  };

  // P5.2/P5.3/P5.4 (2026-05-24): the outer hover-reveal row now lives
  // in `audric-chat-client.tsx` so Copy + Regenerate + Vote sit in a
  // single row that fades in together. This component renders just the
  // two thumb buttons; the parent owns the wrapper styling.
  return (
    <>
      <Button
        aria-label="Upvote response"
        className={cn(
          "size-7 text-foreground/40 hover:text-foreground",
          vote === "up" && "text-success-fg"
        )}
        disabled={isPending}
        onClick={() => handleVote("up")}
        size="icon"
        variant="ghost"
      >
        <ThumbsUp className="size-3.5" />
      </Button>
      <Button
        aria-label="Downvote response"
        className={cn(
          "size-7 text-foreground/40 hover:text-foreground",
          vote === "down" && "text-error-fg"
        )}
        disabled={isPending}
        onClick={() => handleVote("down")}
        size="icon"
        variant="ghost"
      >
        <ThumbsDown className="size-3.5" />
      </Button>
    </>
  );
}
