/**
 * Chat persistence — prisma helpers backing the v0.7e Persistent Chats SPEC.
 *
 * **Replaces** `apps/web-v2/lib/db/queries.ts` (drizzle) per LOCK-1 (prisma
 * rewrite). The drizzle layer is deleted en bloc in Phase 2.2 once Phase 1
 * lands cleanly.
 *
 * **Surface (11 active queries — ported from the 25 in drizzle's queries.ts,
 * after dropping artifact/suggestion/stream/legacy-template helpers per
 * LOCK-2 / LOCK-4):**
 *
 *  - saveChat({ chatId, userSuiAddress, title?, visibility? })
 *  - saveMessages({ messages: [...] })
 *  - getChatsBySuiAddress({ userSuiAddress, limit, startingAfter?, endingBefore? })
 *  - getChatById({ chatId })
 *  - getMessagesByChatId({ chatId })
 *  - deleteChatById({ chatId, userSuiAddress })            (ownership check)
 *  - deleteAllChatsBySuiAddress({ userSuiAddress })
 *  - updateChatVisibility({ chatId, visibility, userSuiAddress })  (ownership check)
 *  - updateChatTitle({ chatId, title })                    (internal — title generator only)
 *  - voteMessage({ chatId, messageId, type })
 *  - getVotesByChatId({ chatId })
 *
 * **Return-type aliasing:** the drizzle queries returned chats with a
 * `userId` field; the prisma column is `userSuiAddress`. The DB-side rename
 * makes the FK pivot legible (we route via canonical Sui address, not the
 * cuid User.id), but consumer routes/components still read `chat.userId`.
 * Helpers re-shape on read so the consumer surface is unchanged — Phase 2.1
 * moves the routes; their bodies stay touched only at the import line.
 */

import { type Prisma, prisma } from "@/lib/prisma";

export type VisibilityType = "private" | "public";

export type ChatRow = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  title: string | null;
  visibility: VisibilityType;
  userId: string; // <- aliased from userSuiAddress (drizzle-compat field name)
};

/**
 * Read-side message shape returned by `getMessagesByChatId`. Prisma's
 * `JsonValue` is the wider shape (includes `null` recursively); consumers
 * downstream — sidebar / message list / chat resume — accept it.
 */
export type DBMessage = {
  id: string;
  chatId: string;
  role: string;
  parts: Prisma.JsonValue;
  attachments: Prisma.JsonValue;
  createdAt: Date;
};

/**
 * Write-side input shape for `saveMessages`. Prisma distinguishes the
 * write shape (`InputJsonValue`, excludes top-level `null`) from the
 * read shape used by `DBMessage` above. Keeping them separate avoids
 * casting at every call site.
 */
export type DBMessageInput = {
  id: string;
  chatId: string;
  role: string;
  parts: Prisma.InputJsonValue;
  attachments: Prisma.InputJsonValue;
  createdAt: Date;
};

export type VoteRow = {
  chatId: string;
  messageId: string;
  isUpvoted: boolean;
};

// ---------------------------------------------------------------------------
// Internal shape mapper — Chat row → drizzle-compat output
// ---------------------------------------------------------------------------

function toChatRow(row: {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  title: string | null;
  visibility: string;
  userSuiAddress: string;
}): ChatRow {
  return {
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    title: row.title,
    visibility: row.visibility as VisibilityType,
    userId: row.userSuiAddress,
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function saveChat({
  chatId,
  userSuiAddress,
  title,
  visibility = "private",
}: {
  chatId: string;
  userSuiAddress: string;
  title?: string | null;
  visibility?: VisibilityType;
}): Promise<ChatRow> {
  const row = await prisma.chat.create({
    data: {
      id: chatId,
      userSuiAddress,
      title: title ?? null,
      visibility,
    },
  });
  return toChatRow(row);
}

export async function saveMessages({
  messages,
}: {
  messages: DBMessageInput[];
}): Promise<void> {
  if (messages.length === 0) {
    return;
  }
  await prisma.message.createMany({
    data: messages.map((m) => ({
      id: m.id,
      chatId: m.chatId,
      role: m.role,
      parts: m.parts,
      attachments: m.attachments,
      createdAt: m.createdAt,
    })),
    skipDuplicates: true,
  });
}

export async function updateChatTitle({
  chatId,
  title,
}: {
  chatId: string;
  title: string;
}): Promise<void> {
  await prisma.chat.update({
    where: { id: chatId },
    data: { title },
  });
}

export async function updateChatVisibility({
  chatId,
  visibility,
  userSuiAddress,
}: {
  chatId: string;
  visibility: VisibilityType;
  userSuiAddress: string;
}): Promise<void> {
  // Ownership check baked into the where clause — `updateMany` returns
  // `{ count: 0 }` on miss instead of throwing, so the caller can surface a
  // 403 without a second read.
  const { count } = await prisma.chat.updateMany({
    where: { id: chatId, userSuiAddress },
    data: { visibility },
  });
  if (count === 0) {
    throw new Error("Chat not found or not owned by caller");
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getChatById({
  chatId,
}: {
  chatId: string;
}): Promise<ChatRow | null> {
  const row = await prisma.chat.findUnique({ where: { id: chatId } });
  return row ? toChatRow(row) : null;
}

export async function getMessagesByChatId({
  chatId,
}: {
  chatId: string;
}): Promise<DBMessage[]> {
  return await prisma.message.findMany({
    where: { chatId },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Cursor-paginated sidebar feed. Mirrors the drizzle helper's API —
 * extendedLimit = limit + 1 sentinel for "has more" detection.
 */
export async function getChatsBySuiAddress({
  userSuiAddress,
  limit,
  startingAfter,
  endingBefore,
}: {
  userSuiAddress: string;
  limit: number;
  startingAfter?: string | null;
  endingBefore?: string | null;
}): Promise<{ chats: ChatRow[]; hasMore: boolean }> {
  const extendedLimit = limit + 1;
  let dateFilter: Prisma.DateTimeFilter | undefined;

  if (startingAfter) {
    const anchor = await prisma.chat.findUnique({
      where: { id: startingAfter },
      select: { createdAt: true },
    });
    if (!anchor) {
      throw new Error(`Chat with id ${startingAfter} not found`);
    }
    dateFilter = { gt: anchor.createdAt };
  } else if (endingBefore) {
    const anchor = await prisma.chat.findUnique({
      where: { id: endingBefore },
      select: { createdAt: true },
    });
    if (!anchor) {
      throw new Error(`Chat with id ${endingBefore} not found`);
    }
    dateFilter = { lt: anchor.createdAt };
  }

  const rows = await prisma.chat.findMany({
    where: {
      userSuiAddress,
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: extendedLimit,
  });

  const hasMore = rows.length > limit;
  const chats = (hasMore ? rows.slice(0, limit) : rows).map(toChatRow);
  return { chats, hasMore };
}

// ---------------------------------------------------------------------------
// Deletes
// ---------------------------------------------------------------------------

export async function deleteChatById({
  chatId,
  userSuiAddress,
}: {
  chatId: string;
  userSuiAddress: string;
}): Promise<{ deletedCount: number }> {
  // Ownership baked into the filter — `deleteMany` returns 0 on miss
  // instead of throwing. Cascades to Message + Vote via FK.
  const { count } = await prisma.chat.deleteMany({
    where: { id: chatId, userSuiAddress },
  });
  return { deletedCount: count };
}

export async function deleteAllChatsBySuiAddress({
  userSuiAddress,
}: {
  userSuiAddress: string;
}): Promise<{ deletedCount: number }> {
  const { count } = await prisma.chat.deleteMany({
    where: { userSuiAddress },
  });
  return { deletedCount: count };
}

// ---------------------------------------------------------------------------
// Votes (LOCK-2 KEEP)
// ---------------------------------------------------------------------------

export async function getVotesByChatId({
  chatId,
}: {
  chatId: string;
}): Promise<VoteRow[]> {
  return await prisma.vote.findMany({ where: { chatId } });
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: "up" | "down";
}): Promise<void> {
  await prisma.vote.upsert({
    where: { chatId_messageId: { chatId, messageId } },
    create: { chatId, messageId, isUpvoted: type === "up" },
    update: { isUpvoted: type === "up" },
  });
}
