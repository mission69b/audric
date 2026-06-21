import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  type SQL,
  sql,
  sum,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { ArtifactKind } from "@/components/chat/artifact";
import type { VisibilityType } from "@/components/chat/visibility-selector";
import { ChatbotError } from "../errors";
import {
  type Chat,
  chat,
  creditLedger,
  type DBMessage,
  document,
  message,
  type Suggestion,
  stream,
  suggestion,
  type User,
  user,
  vote,
} from "./schema";

const client = postgres(process.env.POSTGRES_URL ?? "");
const db = drizzle(client);

/**
 * Upsert the user row keyed by the zkLogin Sui address (Audric v3). Called at
 * sign-in (session mint) so the Chat/Document FKs resolve, and captures the
 * verified Google email for comms (§6b). Idempotent on re-login.
 */
export async function upsertUser(id: string, email: string | null) {
  try {
    await db
      .insert(user)
      .values({ id, email, emailVerified: email !== null })
      .onConflictDoUpdate({
        target: user.id,
        set: { email, updatedAt: new Date() },
      });
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to upsert user");
  }
}

// ── Credit rail (Phase 5) ────────────────────────────────────────────────

export async function getUserById(id: string): Promise<User | undefined> {
  const [row] = await db.select().from(user).where(eq(user.id, id)).limit(1);
  return row;
}

/** Fast collision check for an @audric handle (the DB mirror of the leaf). */
export async function getUserByUsername(
  username: string
): Promise<User | undefined> {
  const [row] = await db
    .select()
    .from(user)
    .where(eq(user.username, username))
    .limit(1);
  return row;
}

/** Persist a claimed/changed @audric handle after the on-chain leaf mint. */
export async function setUsername(
  userId: string,
  username: string,
  txDigest: string
) {
  await db
    .update(user)
    .set({
      username,
      usernameUpdatedAt: new Date(),
      usernameMintTxDigest: txDigest,
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId));
}

/**
 * "Forget all my memories" — bump the user's memory epoch so prior memories are
 * never recalled again (a fresh namespace going forward). Returns the new epoch.
 */
export async function incrementMemoryEpoch(userId: string): Promise<number> {
  const [row] = await db
    .update(user)
    .set({ memoryEpoch: sql`${user.memoryEpoch} + 1`, updatedAt: new Date() })
    .where(eq(user.id, userId))
    .returning({ memoryEpoch: user.memoryEpoch });
  return row?.memoryEpoch ?? 0;
}

/** Current credit balance in micro-USD (SUM of the append-only ledger). */
export async function getCreditBalanceMicros(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sum(creditLedger.amountMicros) })
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId));
  return row?.total ? Number(row.total) : 0;
}

/**
 * Append a ledger entry. `ref` (Stripe event/session/turn id) is unique, so a
 * duplicate webhook or re-metered turn is a no-op. Returns true if it actually
 * wrote (false = already applied → idempotent skip).
 */
export async function recordCredit(entry: {
  userId: string;
  amountMicros: number;
  type: "topup" | "debit" | "recharge" | "grant" | "refund" | "adjustment";
  description?: string;
  ref?: string;
}): Promise<boolean> {
  const inserted = await db
    .insert(creditLedger)
    .values({
      userId: entry.userId,
      amountMicros: Math.round(entry.amountMicros),
      type: entry.type,
      description: entry.description,
      ref: entry.ref,
    })
    .onConflictDoNothing({ target: creditLedger.ref })
    .returning({ id: creditLedger.id });
  return inserted.length > 0;
}

export async function listCreditLedger(userId: string, limit = 50) {
  return await db
    .select()
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId))
    .orderBy(desc(creditLedger.createdAt))
    .limit(limit);
}

export async function setStripeCustomerId(userId: string, customerId: string) {
  await db
    .update(user)
    .set({ stripeCustomerId: customerId, updatedAt: new Date() })
    .where(eq(user.id, userId));
}

export async function setDefaultPaymentMethod(userId: string, pmId: string) {
  await db
    .update(user)
    .set({ defaultPaymentMethodId: pmId, updatedAt: new Date() })
    .where(eq(user.id, userId));
}

export async function setAutoRecharge(
  userId: string,
  opts: { enabled: boolean; thresholdUsd?: number; amountUsd?: number }
) {
  await db
    .update(user)
    .set({
      autoRechargeEnabled: opts.enabled,
      ...(opts.thresholdUsd !== undefined && {
        autoRechargeThresholdUsd: opts.thresholdUsd,
      }),
      ...(opts.amountUsd !== undefined && {
        autoRechargeAmountUsd: opts.amountUsd,
      }),
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId));
}

export async function acceptClosedLoopTerms(userId: string) {
  await db
    .update(user)
    .set({ closedLoopAcceptedAt: new Date(), updatedAt: new Date() })
    .where(eq(user.id, userId));
}

export async function setSubscription(
  userId: string,
  opts: {
    tier: "free" | "pro" | "proPlus" | "max";
    status?: string | null;
    stripeSubscriptionId?: string | null;
  }
) {
  await db
    .update(user)
    .set({
      subscriptionTier: opts.tier,
      subscriptionStatus: opts.status ?? null,
      stripeSubscriptionId: opts.stripeSubscriptionId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId));
}

export async function saveChat({
  id,
  userId,
  title,
  visibility,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: VisibilityType;
}) {
  try {
    return await db.insert(chat).values({
      id,
      createdAt: new Date(),
      userId,
      title,
      visibility,
    });
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save chat");
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    await db.delete(vote).where(eq(vote.chatId, id));
    await db.delete(message).where(eq(message.chatId, id));
    await db.delete(stream).where(eq(stream.chatId, id));

    const [chatsDeleted] = await db
      .delete(chat)
      .where(eq(chat.id, id))
      .returning();
    return chatsDeleted;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete chat by id"
    );
  }
}

export async function deleteAllChatsByUserId({ userId }: { userId: string }) {
  try {
    const userChats = await db
      .select({ id: chat.id })
      .from(chat)
      .where(eq(chat.userId, userId));

    if (userChats.length === 0) {
      return { deletedCount: 0 };
    }

    const chatIds = userChats.map((c) => c.id);

    await db.delete(vote).where(inArray(vote.chatId, chatIds));
    await db.delete(message).where(inArray(message.chatId, chatIds));
    await db.delete(stream).where(inArray(stream.chatId, chatIds));

    const deletedChats = await db
      .delete(chat)
      .where(eq(chat.userId, userId))
      .returning();

    return { deletedCount: deletedChats.length };
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete all chats by user id"
    );
  }
}

/**
 * Blob pathnames referenced by a user's message attachments (Phase 6 purge).
 * Uploaded attachments persist a blob whose ref lives in `message.attachments`
 * (image artifacts are base64 in `document.content`, so they carry no blob).
 * The caller deletes the blobs before/after wiping the rows.
 */
export async function getAttachmentPathnamesByUserId(
  userId: string
): Promise<string[]> {
  const rows = await db
    .select({ attachments: message.attachments })
    .from(message)
    .innerJoin(chat, eq(message.chatId, chat.id))
    .where(eq(chat.userId, userId));

  const paths: string[] = [];
  for (const row of rows) {
    if (!Array.isArray(row.attachments)) {
      continue;
    }
    for (const att of row.attachments) {
      const p = pathnameFromAttachment(att);
      if (p) {
        paths.push(p);
      }
    }
  }
  return paths;
}

/** Recover a blob pathname from a stored attachment (`pathname` or the url's query). */
function pathnameFromAttachment(att: unknown): string | null {
  if (!att || typeof att !== "object") {
    return null;
  }
  const a = att as { pathname?: unknown; url?: unknown };
  if (typeof a.pathname === "string" && a.pathname.length > 0) {
    return a.pathname;
  }
  if (typeof a.url === "string") {
    try {
      return new URL(a.url, "http://local").searchParams.get("pathname");
    } catch {
      return null;
    }
  }
  return null;
}

/** Delete every artifact Document (+ its suggestions) for a user (Phase 6 purge). */
export async function deleteAllDocumentsByUserId({
  userId,
}: {
  userId: string;
}) {
  try {
    await db.delete(suggestion).where(eq(suggestion.userId, userId));
    const deleted = await db
      .delete(document)
      .where(eq(document.userId, userId))
      .returning({ id: document.id });
    return { deletedCount: deleted.length };
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete all documents by user id"
    );
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  try {
    const extendedLimit = limit + 1;

    const query = (whereCondition?: SQL<unknown>) =>
      db
        .select()
        .from(chat)
        .where(
          whereCondition
            ? and(whereCondition, eq(chat.userId, id))
            : eq(chat.userId, id)
        )
        .orderBy(desc(chat.createdAt))
        .limit(extendedLimit);

    let filteredChats: Chat[] = [];

    if (startingAfter) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, startingAfter))
        .limit(1);

      if (!selectedChat) {
        throw new ChatbotError(
          "not_found:database",
          `Chat with id ${startingAfter} not found`
        );
      }

      filteredChats = await query(gt(chat.createdAt, selectedChat.createdAt));
    } else if (endingBefore) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, endingBefore))
        .limit(1);

      if (!selectedChat) {
        throw new ChatbotError(
          "not_found:database",
          `Chat with id ${endingBefore} not found`
        );
      }

      filteredChats = await query(lt(chat.createdAt, selectedChat.createdAt));
    } else {
      filteredChats = await query();
    }

    const hasMore = filteredChats.length > limit;

    return {
      chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
      hasMore,
    };
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get chats by user id"
    );
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    if (!selectedChat) {
      return null;
    }

    return selectedChat;
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to get chat by id");
  }
}

/**
 * Postgres `json`/`text` columns reject U+0000 (NUL). Web-search / scraped tool
 * content (and some model output) can carry NUL bytes, which fail the insert and
 * break the stream. Strip them from nested strings before persisting.
 */
function stripNullBytes<T>(value: T): T {
  if (value == null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value).replace(/\\u0000/g, "")) as T;
}

export async function saveMessages({ messages }: { messages: DBMessage[] }) {
  try {
    const sanitized = messages.map((m) => ({
      ...m,
      parts: stripNullBytes(m.parts),
      attachments: stripNullBytes(m.attachments),
    }));
    return await db.insert(message).values(sanitized);
  } catch (error) {
    console.error("[saveMessages] insert failed:", error);
    throw new ChatbotError("bad_request:database", "Failed to save messages");
  }
}

export async function updateMessage({
  id,
  parts,
}: {
  id: string;
  parts: DBMessage["parts"];
}) {
  try {
    return await db.update(message).set({ parts }).where(eq(message.id, id));
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to update message");
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    return await db
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get messages by chat id"
    );
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: "up" | "down";
}) {
  try {
    const [existingVote] = await db
      .select()
      .from(vote)
      .where(and(eq(vote.messageId, messageId)));

    if (existingVote) {
      return await db
        .update(vote)
        .set({ isUpvoted: type === "up" })
        .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
    }
    return await db.insert(vote).values({
      chatId,
      messageId,
      isUpvoted: type === "up",
    });
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to vote message");
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return await db.select().from(vote).where(eq(vote.chatId, id));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get votes by chat id"
    );
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}) {
  try {
    return await db
      .insert(document)
      .values({
        id,
        title,
        kind,
        content,
        userId,
        createdAt: new Date(),
      })
      .returning();
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save document");
  }
}

export async function updateDocumentContent({
  id,
  content,
}: {
  id: string;
  content: string;
}) {
  try {
    const docs = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt))
      .limit(1);

    const latest = docs[0];
    if (!latest) {
      throw new ChatbotError("not_found:database", "Document not found");
    }

    return await db
      .update(document)
      .set({ content })
      .where(and(eq(document.id, id), eq(document.createdAt, latest.createdAt)))
      .returning();
  } catch (_error) {
    if (_error instanceof ChatbotError) {
      throw _error;
    }
    throw new ChatbotError(
      "bad_request:database",
      "Failed to update document content"
    );
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const documents = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(asc(document.createdAt));

    return documents;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get documents by id"
    );
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const [selectedDocument] = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt));

    return selectedDocument;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get document by id"
    );
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    await db
      .delete(suggestion)
      .where(
        and(
          eq(suggestion.documentId, id),
          gt(suggestion.documentCreatedAt, timestamp)
        )
      );

    return await db
      .delete(document)
      .where(and(eq(document.id, id), gt(document.createdAt, timestamp)))
      .returning();
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete documents by id after timestamp"
    );
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Suggestion[];
}) {
  try {
    return await db.insert(suggestion).values(suggestions);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to save suggestions"
    );
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return await db
      .select()
      .from(suggestion)
      .where(eq(suggestion.documentId, documentId));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get suggestions by document id"
    );
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    return await db.select().from(message).where(eq(message.id, id));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get message by id"
    );
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const messagesToDelete = await db
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp))
      );

    const messageIds = messagesToDelete.map(
      (currentMessage) => currentMessage.id
    );

    if (messageIds.length > 0) {
      await db
        .delete(vote)
        .where(
          and(eq(vote.chatId, chatId), inArray(vote.messageId, messageIds))
        );

      return await db
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds))
        );
    }
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete messages by chat id after timestamp"
    );
  }
}

export async function updateChatVisibilityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: "private" | "public";
}) {
  try {
    return await db.update(chat).set({ visibility }).where(eq(chat.id, chatId));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to update chat visibility by id"
    );
  }
}

export async function updateChatTitleById({
  chatId,
  title,
}: {
  chatId: string;
  title: string;
}) {
  try {
    return await db.update(chat).set({ title }).where(eq(chat.id, chatId));
  } catch (_error) {
    return;
  }
}

export async function getMessageCountByUserId({
  id,
  differenceInHours,
}: {
  id: string;
  differenceInHours: number;
}) {
  try {
    const cutoffTime = new Date(
      Date.now() - differenceInHours * 60 * 60 * 1000
    );

    const [stats] = await db
      .select({ count: count(message.id) })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(chat.userId, id),
          gte(message.createdAt, cutoffTime),
          eq(message.role, "user")
        )
      )
      .execute();

    return stats?.count ?? 0;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get message count by user id"
    );
  }
}

export async function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  try {
    await db
      .insert(stream)
      .values({ id: streamId, chatId, createdAt: new Date() });
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to create stream id"
    );
  }
}

export async function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  try {
    const streamIds = await db
      .select({ id: stream.id })
      .from(stream)
      .where(eq(stream.chatId, chatId))
      .orderBy(asc(stream.createdAt))
      .execute();

    return streamIds.map(({ id }) => id);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get stream ids by chat id"
    );
  }
}
