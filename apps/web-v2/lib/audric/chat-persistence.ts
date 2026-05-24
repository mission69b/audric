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

/**
 * Persist a batch of messages.
 *
 * **Why per-row upsert (not `createMany skipDuplicates`):** the AI SDK v6
 * continuation pattern reuses the same `id` for an assistant message
 * across state transitions (`approval-requested → output-available`).
 * `createMany skipDuplicates` would no-op the existing row and the DB
 * would keep the stale `approval-requested` parts forever — resume
 * after any write tool shows ghost permission cards. Upsert handles
 * BOTH the first-write case (insert) and the state-transition case
 * (update) in one round-trip per message.
 *
 * **Why this also bumps `Chat.updatedAt`:** the sidebar orders chats by
 * `updatedAt desc` so active chats float to the top. Without this bump
 * a long-running conversation stays buried at its original `createdAt`.
 * Setting `updatedAt` explicitly (rather than relying on Prisma's
 * `@updatedAt` magic, which only fires when a Chat field changes)
 * lifts the chat on every turn.
 *
 * **Why this lazy-upserts the Chat row:** P1-E. `saveChat` used to run
 * eagerly in POST /api/chat before the stream started; tab close /
 * stream abort left orphan Chat rows in the sidebar. Lazy upsert means
 * a Chat row only exists once at least one message has been saved.
 * The {@link DBMessageInput.chatOwnerSuiAddress} field carries the
 * owner so the upsert can `create` a fresh row on first save.
 */
export async function saveMessages({
  messages,
  chatOwnerSuiAddress,
  visibility = "private",
}: {
  messages: DBMessageInput[];
  /**
   * Owner Sui address — required for the lazy chat-row upsert when
   * the chat doesn't yet exist. The caller (chat route) already knows
   * this from the authenticated session, so threading it through avoids
   * a separate `getChatById` lookup.
   */
  chatOwnerSuiAddress: string;
  visibility?: VisibilityType;
}): Promise<void> {
  if (messages.length === 0) {
    return;
  }

  const chatId = messages[0]?.chatId;
  if (!chatId) {
    return;
  }

  const now = new Date();

  // Lazy chat-row creation (P1-E orphan fix). Upsert: insert if first
  // turn, no-op if already exists (the update branch bumps updatedAt
  // separately via the explicit Chat.update below — keeps the two
  // concerns legible).
  await prisma.chat.upsert({
    where: { id: chatId },
    create: {
      id: chatId,
      userSuiAddress: chatOwnerSuiAddress,
      visibility,
      title: null,
    },
    update: { updatedAt: now },
  });

  // Per-row upsert (P0-A continuation fix). `Promise.all` keeps the
  // round-trip count to 1+N rather than serialising — the assistant
  // message and the user message in the same turn can land in parallel.
  await Promise.all(
    messages.map((m) =>
      prisma.message.upsert({
        where: { id: m.id },
        create: {
          id: m.id,
          chatId: m.chatId,
          role: m.role,
          parts: m.parts,
          attachments: m.attachments,
          createdAt: m.createdAt,
        },
        update: {
          role: m.role,
          parts: m.parts,
          attachments: m.attachments,
        },
      })
    )
  );
}

/**
 * Set or update the chat title.
 *
 * **Why this is an upsert, not an update.** Title generation runs in
 * parallel with the LLM stream (so the sidebar can show a real title
 * ASAP). It can land BEFORE `saveMessages` has had a chance to
 * lazy-upsert the Chat row (S.248 P1-E moved chat-row creation out
 * of POST and into `saveMessages` to kill orphan rows). If title gen
 * wins the race, a plain `update` would fail with "No record was
 * found for an update" (verified in prod logs 2026-05-22).
 *
 * The owner address is required for the `create` branch — same
 * contract as `saveMessages`. Title gen callers thread the wallet
 * address from the route's authenticated session.
 */
export async function updateChatTitle({
  chatId,
  title,
  chatOwnerSuiAddress,
}: {
  chatId: string;
  title: string;
  chatOwnerSuiAddress: string;
}): Promise<void> {
  await prisma.chat.upsert({
    where: { id: chatId },
    create: {
      id: chatId,
      userSuiAddress: chatOwnerSuiAddress,
      visibility: "private",
      title,
    },
    update: { title },
  });
}

/**
 * Set the active resumable-stream id for a chat (SPEC_AUDRIC_STREAM_RESUME
 * Phase 1, 2026-05-24). Called by POST /api/chat when a new stream starts
 * (`consumeSseStream` callback) and by POST /api/chat/[id]/stop with
 * `null` to clear the active stream after explicit cancel.
 *
 * Ownership-gated via `userSuiAddress` in the where clause — `updateMany`
 * returns `{ count: 0 }` on miss. Callers that don't bother passing the
 * owner address (e.g. internal callbacks that ran inside the auth-gated
 * POST handler) can omit it; the column is set anyway because we already
 * resolved the chat by id. We thread the owner everywhere the call site
 * has it available as belt-and-suspenders.
 *
 * Idempotent: setting to the same value twice is fine.
 */
export async function setActiveStreamId({
  chatId,
  activeStreamId,
  userSuiAddress,
}: {
  chatId: string;
  activeStreamId: string | null;
  userSuiAddress?: string;
}): Promise<void> {
  await prisma.chat.updateMany({
    where: userSuiAddress ? { id: chatId, userSuiAddress } : { id: chatId },
    data: { activeStreamId },
  });
}

/**
 * Read the active resumable-stream id for a chat. Used by GET
 * /api/chat/[id]/stream to decide between 204 (no active stream) and
 * `resumeExistingStream(activeStreamId)`. Always ownership-gated.
 *
 * Returns `null` when:
 *  - chat doesn't exist (treated identically to "no active stream" so we
 *    don't leak chat existence to non-owners)
 *  - caller doesn't own the chat
 *  - chat exists + caller owns it BUT `activeStreamId` is null (no
 *    in-flight stream)
 *
 * Returns the string id when an active stream exists for an owned chat.
 */
export async function getActiveStreamId({
  chatId,
  userSuiAddress,
}: {
  chatId: string;
  userSuiAddress: string;
}): Promise<string | null> {
  const row = await prisma.chat.findFirst({
    where: { id: chatId, userSuiAddress },
    select: { activeStreamId: true },
  });
  return row?.activeStreamId ?? null;
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

  // [P1-F] Sidebar orders by `updatedAt desc` so active chats float to
  // the top. The cursor anchors track `updatedAt` too — using
  // `createdAt` as the anchor (the pre-P1-F behavior) would yield an
  // inconsistent pagination order on chats whose `updatedAt` drifted
  // past a neighbour's `createdAt`.
  if (startingAfter) {
    const anchor = await prisma.chat.findUnique({
      where: { id: startingAfter },
      select: { updatedAt: true },
    });
    if (!anchor) {
      throw new Error(`Chat with id ${startingAfter} not found`);
    }
    dateFilter = { gt: anchor.updatedAt };
  } else if (endingBefore) {
    const anchor = await prisma.chat.findUnique({
      where: { id: endingBefore },
      select: { updatedAt: true },
    });
    if (!anchor) {
      throw new Error(`Chat with id ${endingBefore} not found`);
    }
    dateFilter = { lt: anchor.updatedAt };
  }

  const rows = await prisma.chat.findMany({
    where: {
      userSuiAddress,
      ...(dateFilter ? { updatedAt: dateFilter } : {}),
    },
    orderBy: { updatedAt: "desc" },
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
  // [P1-J] Vote.messageId FKs to Message.id only — the schema can't
  // enforce `messageId ∈ chatId` without a composite FK. Verify here so
  // a chat owner can't pollute their own vote table with foreign
  // message ids (e.g. via a hand-crafted /api/vote PATCH).
  const message = await prisma.message.findFirst({
    where: { id: messageId, chatId },
    select: { id: true },
  });
  if (!message) {
    throw new Error(`Message ${messageId} does not belong to chat ${chatId}`);
  }

  await prisma.vote.upsert({
    where: { chatId_messageId: { chatId, messageId } },
    create: { chatId, messageId, isUpvoted: type === "up" },
    update: { isUpvoted: type === "up" },
  });
}
