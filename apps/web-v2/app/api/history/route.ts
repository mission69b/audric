/**
 * `/api/history` — sidebar chat list (GET) + bulk delete (DELETE).
 *
 * Moved out of `app/(chat)/api/history/` in v0.7e Persistent Chats Phase 2.1
 * so the (chat) route group can be deleted in Phase 2.2 (LOCK-3: fold the
 * Session 9a cleanup into this SPEC).
 *
 * Implementation switched from drizzle (`@/lib/db/queries`) to prisma
 * (`@/lib/audric/chat-persistence`) per LOCK-1. The wire contract is
 * unchanged — same query params, same response shape, same auth gate —
 * so `components/chat/sidebar-history.tsx` works without modification.
 */

import type { NextRequest } from "next/server";
import {
  deleteAllChatsBySuiAddress,
  getChatsBySuiAddress,
} from "@/lib/audric/chat-persistence";
import { getCurrentUser } from "@/lib/audric-auth";
import { ChatbotError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const limit = Math.min(
    Math.max(Number.parseInt(searchParams.get("limit") || "10", 10), 1),
    50
  );
  const startingAfter = searchParams.get("starting_after");
  const endingBefore = searchParams.get("ending_before");

  if (startingAfter && endingBefore) {
    return new ChatbotError(
      "bad_request:api",
      "Only one of starting_after or ending_before can be provided."
    ).toResponse();
  }

  const session = await getCurrentUser();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  try {
    const chats = await getChatsBySuiAddress({
      userSuiAddress: session.user.id,
      limit,
      startingAfter,
      endingBefore,
    });
    return Response.json(chats);
  } catch (err) {
    console.error(
      `[api/history] getChatsBySuiAddress failed userId=${session.user.id.slice(0, 10)}...:`,
      err instanceof Error ? err.message : String(err)
    );
    return new ChatbotError(
      "bad_request:database",
      "Failed to get chats by user id"
    ).toResponse();
  }
}

export async function DELETE() {
  const session = await getCurrentUser();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  try {
    const result = await deleteAllChatsBySuiAddress({
      userSuiAddress: session.user.id,
    });
    return Response.json(result, { status: 200 });
  } catch (err) {
    console.error(
      `[api/history] deleteAllChatsBySuiAddress failed userId=${session.user.id.slice(0, 10)}...:`,
      err instanceof Error ? err.message : String(err)
    );
    return new ChatbotError(
      "bad_request:database",
      "Failed to delete all chats"
    ).toResponse();
  }
}
