/**
 * `/api/vote` — message thumbs up/down feedback (LOCK-2 KEEP).
 *
 * Moved out of `app/(chat)/api/vote/` in v0.7e Persistent Chats Phase 2.1
 * so the (chat) route group can be deleted in Phase 2.2.
 *
 * Why we kept this (LOCK-2): vote rows are zero-cost free signal for the
 * eval loop — every thumbs gives us a labelled (chat-context → assistant-
 * turn → outcome) tuple we can sample from later for regression evals
 * without needing to instrument anything else.
 *
 * **UI surface:** the original template `<MessageActions>` thumbs UI
 * was deleted as part of the v0.7e template debris strip. P1-B
 * restores a minimal thumbs surface inline in `audric-chat-client.tsx`
 * on each assistant message; that's the only consumer of this route.
 */

import { z } from "zod";
import {
  getChatById,
  getVotesByChatId,
  voteMessage,
} from "@/lib/audric/chat-persistence";
import { getCurrentUser } from "@/lib/audric-auth";
import { ChatbotError } from "@/lib/errors";

const voteSchema = z.object({
  chatId: z.string(),
  messageId: z.string(),
  type: z.enum(["up", "down"]),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chatId");

  if (!chatId) {
    return new ChatbotError(
      "bad_request:api",
      "Parameter chatId is required."
    ).toResponse();
  }

  const session = await getCurrentUser();
  if (!session?.user) {
    return new ChatbotError("unauthorized:vote").toResponse();
  }

  const chat = await getChatById({ chatId });
  if (!chat) {
    return new ChatbotError("not_found:chat").toResponse();
  }
  if (chat.userId !== session.user.id) {
    return new ChatbotError("forbidden:vote").toResponse();
  }

  const votes = await getVotesByChatId({ chatId });
  return Response.json(votes, { status: 200 });
}

export async function PATCH(request: Request) {
  let chatId: string;
  let messageId: string;
  let type: "up" | "down";

  try {
    const parsed = voteSchema.parse(await request.json());
    chatId = parsed.chatId;
    messageId = parsed.messageId;
    type = parsed.type;
  } catch {
    return new ChatbotError(
      "bad_request:api",
      "Parameters chatId, messageId, and type are required."
    ).toResponse();
  }

  const session = await getCurrentUser();
  if (!session?.user) {
    return new ChatbotError("unauthorized:vote").toResponse();
  }

  const chat = await getChatById({ chatId });
  if (!chat) {
    return new ChatbotError("not_found:vote").toResponse();
  }
  if (chat.userId !== session.user.id) {
    return new ChatbotError("forbidden:vote").toResponse();
  }

  await voteMessage({ chatId, messageId, type });
  return new Response("Message voted", { status: 200 });
}
