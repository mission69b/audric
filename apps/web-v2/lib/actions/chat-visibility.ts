"use server";

/**
 * Chat visibility toggle — server action backing the chat header's
 * lock/globe button + the visibility selector dropdown.
 *
 * Moved out of `app/(chat)/actions.ts` in v0.7e Persistent Chats Phase 2.1
 * so the (chat) route group can be deleted in Phase 2.2.
 *
 * Implementation switched from drizzle (`@/lib/db/queries`) to prisma
 * (`@/lib/audric/chat-persistence`) per LOCK-1. Ownership check is baked
 * into the helper's `updateMany({ where: { id, userSuiAddress } })` clause —
 * a non-owner sees the helper throw rather than silently no-op.
 *
 * The matching template helpers (`saveChatModelAsCookie`,
 * `deleteTrailingMessages`, `generateTitleFromUserMessage`) were
 * intentionally NOT ported:
 *   - `saveChatModelAsCookie` — audric doesn't expose a model picker
 *   - `deleteTrailingMessages` — "edit prior user turn + re-run" UX is
 *     explicitly out of scope (SPEC §3); the `<MessageEditor>` template
 *     surface deletes in Phase 2.2 alongside this file's parent dir
 *   - `generateTitleFromUserMessage` — moved into the canonical
 *     `lib/audric/chat-title.ts` and wired into `/api/chat` directly
 */

import {
  updateChatVisibility as updateChatVisibilityRow,
  type VisibilityType,
} from "@/lib/audric/chat-persistence";
import { getCurrentUser } from "@/lib/audric-auth";

export async function updateChatVisibility({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: VisibilityType;
}): Promise<void> {
  const session = await getCurrentUser();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  await updateChatVisibilityRow({
    chatId,
    visibility,
    userSuiAddress: session.user.id,
  });
}
